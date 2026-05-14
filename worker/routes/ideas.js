import { Hono } from 'hono';
import { nanoid } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { broadcast } from '../lib/broadcast.js';
import { listIdeasWithMyVote, getIdea } from '../lib/ideas.js';
import { requireFacilitator } from '../middleware.js';

const app = new Hono();

const MAX_TITLE = 140;
const MAX_DESC = 2000;

// Per-attendee rate limits (cookie-keyed). IP-level limits belong in Cloudflare WAF,
// not KV counters — KV free tier is 1k writes/day and each vote already costs 2 writes.
const VOTE_LIMITS = [{ window: 60, max: 30 }, { window: 3600, max: 200 }];
const SUBMIT_LIMITS = [{ window: 600, max: 5 }, { window: 3600, max: 15 }];

app.get('/', async (c) => {
	const ideas = await listIdeasWithMyVote(c.env.DB, c.get('attendeeId'));
	c.header('Cache-Control', 'no-store');
	return c.json(ideas);
});

app.post('/', async (c) => {
	const attendeeId = c.get('attendeeId');
	const rl = await rateLimit(c.env.KV, 'submit', attendeeId, SUBMIT_LIMITS);
	if (!rl.allowed) return c.json({ error: 'Slow down', retryAfter: rl.retryAfter }, 429);

	const win = await c.env.KV.get('submissions_window', 'json');
	const now = Date.now();
	if (win?.open_at && now < win.open_at) {
		return c.json({ error: 'Submissions are not open yet', open_at: win.open_at }, 403);
	}
	if (win?.close_at && now > win.close_at) {
		return c.json({ error: 'Submissions are closed', close_at: win.close_at }, 403);
	}

	const body = await c.req.json().catch(() => ({}));
	const title = (body.title || '').toString().trim().slice(0, MAX_TITLE);
	const description = (body.description || '').toString().trim().slice(0, MAX_DESC);
	if (!title) return c.json({ error: 'Title required' }, 400);

	const id = `idea_${nanoid(12)}`;
	await c.env.DB
		.prepare(
			`INSERT INTO ideas (id, title, description, submitter_id, vote_count, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 0, 'open', ?, ?)`,
		)
		.bind(id, title, description, attendeeId, now, now)
		.run();

	const idea = await getIdea(c.env.DB, id);
	await broadcast(c.env, { type: 'idea:added', idea: { ...idea, my_vote: false } });
	return c.json(idea, 201);
});

app.post('/:id/vote', async (c) => {
	const attendeeId = c.get('attendeeId');
	const { id } = c.req.param();
	const rl = await rateLimit(c.env.KV, 'vote', attendeeId, VOTE_LIMITS);
	if (!rl.allowed) return c.json({ error: 'Voting too fast', retryAfter: rl.retryAfter }, 429);

	const now = Date.now();
	const insert = await c.env.DB
		.prepare(`INSERT OR IGNORE INTO votes (idea_id, attendee_id, created_at) VALUES (?, ?, ?)`)
		.bind(id, attendeeId, now)
		.run();
	const inserted = insert.meta?.changes === 1;

	if (!inserted) {
		const existing = await getIdea(c.env.DB, id);
		if (!existing) return c.json({ error: 'Idea not found' }, 404);
		return c.json({ ...existing, my_vote: true });
	}

	await c.env.DB
		.prepare(`UPDATE ideas SET vote_count = vote_count + 1, updated_at = ? WHERE id = ?`)
		.bind(now, id)
		.run();

	const idea = await getIdea(c.env.DB, id);
	if (!idea) return c.json({ error: 'Idea not found' }, 404);

	await broadcast(c.env, { type: 'idea:updated', idea: { ...idea, my_vote: false } });
	return c.json({ ...idea, my_vote: true });
});

app.delete('/:id/vote', async (c) => {
	const attendeeId = c.get('attendeeId');
	const { id } = c.req.param();
	const rl = await rateLimit(c.env.KV, 'vote', attendeeId, VOTE_LIMITS);
	if (!rl.allowed) return c.json({ error: 'Voting too fast', retryAfter: rl.retryAfter }, 429);

	const del = await c.env.DB
		.prepare(`DELETE FROM votes WHERE idea_id = ? AND attendee_id = ?`)
		.bind(id, attendeeId)
		.run();
	const removed = del.meta?.changes === 1;

	if (removed) {
		await c.env.DB
			.prepare(`UPDATE ideas SET vote_count = MAX(vote_count - 1, 0), updated_at = ? WHERE id = ?`)
			.bind(Date.now(), id)
			.run();
	}

	const idea = await getIdea(c.env.DB, id);
	if (!idea) return c.json({ error: 'Idea not found' }, 404);
	if (removed) await broadcast(c.env, { type: 'idea:updated', idea: { ...idea, my_vote: false } });
	return c.json({ ...idea, my_vote: false });
});

app.post('/:id/assign', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const body = await c.req.json().catch(() => ({}));
	const slotId = body.slot_id ?? body.slotId ?? null;
	const roomId = body.room_id ?? body.roomId ?? null;

	if ((slotId && !roomId) || (!slotId && roomId)) {
		return c.json({ error: 'slot_id and room_id must both be set or both null' }, 400);
	}

	try {
		const status = slotId ? 'scheduled' : 'open';
		const result = await c.env.DB
			.prepare(`UPDATE ideas SET slot_id = ?, room_id = ?, status = ?, updated_at = ? WHERE id = ?`)
			.bind(slotId, roomId, status, Date.now(), id)
			.run();
		if (result.meta?.changes === 0) return c.json({ error: 'Idea not found' }, 404);
	} catch (err) {
		if (/UNIQUE/.test(err?.message || '')) {
			return c.json({ error: 'That cell is already occupied' }, 409);
		}
		throw err;
	}

	const idea = await getIdea(c.env.DB, id);
	await broadcast(c.env, { type: 'idea:assigned', idea: { ...idea, my_vote: false } });
	return c.json(idea);
});

app.post('/merge', requireFacilitator, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const primaryId = body.primary_id ?? body.primaryId;
	const mergeIds = Array.isArray(body.merge_ids ?? body.mergeIds) ? (body.merge_ids ?? body.mergeIds) : [];

	if (!primaryId || mergeIds.length === 0) {
		return c.json({ error: 'primary_id and non-empty merge_ids required' }, 400);
	}
	if (mergeIds.includes(primaryId)) {
		return c.json({ error: 'primary cannot be in merge_ids' }, 400);
	}

	const now = Date.now();
	const placeholders = mergeIds.map(() => '?').join(',');

	// Batch executes in order: copy votes first, then recount (sees the new rows), then mark merged.
	await c.env.DB.batch([
		c.env.DB
			.prepare(
				`INSERT OR IGNORE INTO votes (idea_id, attendee_id, created_at)
				 SELECT ?, attendee_id, created_at
				   FROM votes
				  WHERE idea_id IN (${placeholders})`,
			)
			.bind(primaryId, ...mergeIds),
		c.env.DB
			.prepare(
				`UPDATE ideas SET
				    vote_count = (SELECT COUNT(*) FROM votes WHERE idea_id = ?),
				    updated_at = ?
				  WHERE id = ?`,
			)
			.bind(primaryId, now, primaryId),
		c.env.DB
			.prepare(
				`UPDATE ideas
				    SET status = 'merged', merged_into_id = ?, updated_at = ?
				  WHERE id IN (${placeholders})`,
			)
			.bind(primaryId, now, ...mergeIds),
	]);

	const primary = await getIdea(c.env.DB, primaryId);
	await broadcast(c.env, { type: 'idea:merged', primary_id: primaryId, merged_ids: mergeIds, primary });
	return c.json({ primary, merged: mergeIds });
});

app.delete('/:id', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const now = Date.now();
	const res = await c.env.DB
		.prepare(`UPDATE ideas SET status = 'removed', updated_at = ? WHERE id = ?`)
		.bind(now, id)
		.run();
	if (res.meta?.changes === 0) return c.json({ error: 'Idea not found' }, 404);
	await broadcast(c.env, { type: 'idea:removed', id });
	return c.json({ success: true });
});

export default app;
