import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import ideasApp from '../ideas.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeKv() {
	const store = new Map();
	return {
		store,
		async get(k, type) {
			const v = store.get(k) ?? null;
			if (type === 'json' && v) return JSON.parse(v);
			return v;
		},
		async put(k, v) { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
		async delete(k) { store.delete(k); },
		async list({ prefix }) {
			return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ name: k })) };
		},
	};
}

function fakeDo() {
	const sent = [];
	return {
		EVENT_ROOM: {
			idFromName: () => 'main',
			get: () => ({
				fetch: async (url, init) => {
					sent.push({ url, body: JSON.parse(init.body) });
					return new Response('ok');
				},
			}),
		},
		_sent: sent,
	};
}

/**
 * Minimal stateful fake D1.
 *
 * Tracks ideas + votes in-memory. Parses just enough SQL keywords to dispatch
 * to the right handler for each query the route module actually issues.
 */
function fakeDb(opts = {}) {
	// Allow callers to inject pre-seeded ideas and votes.
	const ideas = opts.ideas ? [...opts.ideas] : [];
	const votes = opts.votes ? [...opts.votes] : [];

	// nextInsertChanges lets tests control whether INSERT OR IGNORE fires.
	let nextInsertChanges = opts.nextInsertChanges ?? 1;

	const self = {
		ideas,
		votes,
		setNextInsertChanges(n) { nextInsertChanges = n; },

		async batch(stmts) {
			const results = [];
			for (const stmt of stmts) results.push(await stmt.run());
			return results;
		},

		prepare(sql) {
			const s = sql.trim().replace(/\s+/g, ' ').toUpperCase();
			return {
				bind(...args) {
					return {
						async run() {
							// INSERT INTO ideas
							if (s.startsWith('INSERT INTO IDEAS')) {
								const [id, title, description, submitter_id, , status, created_at, updated_at] = args;
								ideas.push({ id, title, description, submitter_id, vote_count: 0, status, slot_id: null, room_id: null, merged_into_id: null, created_at, updated_at });
								return { meta: { changes: 1 } };
							}
							// INSERT OR IGNORE INTO votes
							if (s.startsWith('INSERT OR IGNORE INTO VOTES') && !s.includes('SELECT')) {
								const [idea_id, attendee_id, created_at] = args;
								const exists = votes.some(v => v.idea_id === idea_id && v.attendee_id === attendee_id);
								if (!exists) {
									votes.push({ idea_id, attendee_id, created_at });
									return { meta: { changes: nextInsertChanges } };
								}
								return { meta: { changes: 0 } };
							}
							// INSERT OR IGNORE INTO votes ... SELECT (merge)
							if (s.startsWith('INSERT OR IGNORE INTO VOTES') && s.includes('SELECT')) {
								const [primaryId, ...mergeIds] = args;
								let changes = 0;
								for (const v of votes.filter(v => mergeIds.includes(v.idea_id))) {
									if (!votes.some(x => x.idea_id === primaryId && x.attendee_id === v.attendee_id)) {
										votes.push({ idea_id: primaryId, attendee_id: v.attendee_id, created_at: v.created_at });
										changes++;
									}
								}
								return { meta: { changes } };
							}
							// DELETE FROM votes
							if (s.startsWith('DELETE FROM VOTES')) {
								const [idea_id, attendee_id] = args;
								const before = votes.length;
								const idx = votes.findIndex(v => v.idea_id === idea_id && v.attendee_id === attendee_id);
								if (idx !== -1) votes.splice(idx, 1);
								return { meta: { changes: before - votes.length } };
							}
							// UPDATE ideas SET vote_count = vote_count + 1
							if (s.includes('VOTE_COUNT = VOTE_COUNT + 1')) {
								const [, id] = args;
								const idea = ideas.find(i => i.id === id);
								if (idea) { idea.vote_count += 1; idea.updated_at = args[0]; }
								return { meta: { changes: idea ? 1 : 0 } };
							}
							// UPDATE ideas SET vote_count = MAX(vote_count - 1, 0)
							if (s.includes('VOTE_COUNT = MAX(VOTE_COUNT - 1')) {
								const [, id] = args;
								const idea = ideas.find(i => i.id === id);
								if (idea) { idea.vote_count = Math.max(idea.vote_count - 1, 0); idea.updated_at = args[0]; }
								return { meta: { changes: idea ? 1 : 0 } };
							}
							// UPDATE ideas SET slot_id, room_id, status (assign)
							if (s.includes('SLOT_ID = ?, ROOM_ID = ?, STATUS = ?')) {
								const [slot_id, room_id, status, updated_at, id] = args;
								if (opts.assignThrowsUnique) throw new Error('UNIQUE constraint failed');
								const idea = ideas.find(i => i.id === id);
								if (!idea) return { meta: { changes: 0 } };
								Object.assign(idea, { slot_id, room_id, status, updated_at });
								return { meta: { changes: 1 } };
							}
							// UPDATE ideas SET vote_count = (SELECT COUNT(*)) (merge recount)
							if (s.includes('VOTE_COUNT = (SELECT COUNT(*)')) {
								const [primaryId, updatedAt, id] = args;
								const idea = ideas.find(i => i.id === id);
								if (idea) {
									idea.vote_count = votes.filter(v => v.idea_id === primaryId).length;
									idea.updated_at = updatedAt;
								}
								return { meta: { changes: idea ? 1 : 0 } };
							}
							// UPDATE ideas SET merged_into_id = ? WHERE merged_into_id IN (...) (re-point grandchildren)
							if (s.includes('SET MERGED_INTO_ID = ?') && s.includes('WHERE MERGED_INTO_ID IN')) {
								const [primaryId, updatedAt, ...oldParents] = args;
								let changes = 0;
								for (const idea of ideas.filter(i => oldParents.includes(i.merged_into_id))) {
									idea.merged_into_id = primaryId;
									idea.updated_at = updatedAt;
									changes++;
								}
								return { meta: { changes } };
							}
							// UPDATE ideas SET status='merged'
							if (s.includes("STATUS = 'MERGED'")) {
								const [primaryId, updatedAt, ...mergeIds] = args;
								for (const idea of ideas.filter(i => mergeIds.includes(i.id))) {
									idea.status = 'merged';
									idea.merged_into_id = primaryId;
									idea.updated_at = updatedAt;
								}
								return { meta: { changes: mergeIds.length } };
							}
							// UPDATE ideas SET status='removed'
							if (s.includes("STATUS = 'REMOVED'")) {
								const [updatedAt, id] = args;
								const idea = ideas.find(i => i.id === id);
								if (!idea) return { meta: { changes: 0 } };
								idea.status = 'removed';
								idea.updated_at = updatedAt;
								return { meta: { changes: 1 } };
							}
							return { meta: { changes: 0 } };
						},

						async all() {
							// listIdeasWithMyVote query
							if (s.includes('CASE WHEN V.ATTENDEE_ID IS NULL')) {
								const attendeeId = args[0];
								const results = ideas
									.filter(i => ['open', 'scheduled'].includes(i.status))
									.map(i => ({
										...i,
										my_vote: votes.some(v => v.idea_id === i.id && v.attendee_id === attendeeId) ? 1 : 0,
									}));
								return { results };
							}
							// listIdeasWithMyVote: all merged children, grouped by primary
							if (s.includes("STATUS = 'MERGED' AND MERGED_INTO_ID IS NOT NULL")) {
								return { results: ideas.filter(i => i.status === 'merged' && i.merged_into_id) };
							}
							// getIdea: merged children for one primary
							if (s.includes("MERGED_INTO_ID = ? AND STATUS = 'MERGED'")) {
								return { results: ideas.filter(i => i.status === 'merged' && i.merged_into_id === args[0]) };
							}
							return { results: [] };
						},

						async first() {
							// getIdea: SELECT * FROM ideas WHERE id = ?
							if (s.includes('FROM IDEAS WHERE ID = ?')) {
								return ideas.find(i => i.id === args[0]) ?? null;
							}
							return null;
						},
					};
				},
			};
		},
	};
	return self;
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp(overrides = {}) {
	const app = new Hono();
	const doEnv = fakeDo();
	const env = {
		DB: overrides.db ?? fakeDb(),
		KV: overrides.kv ?? fakeKv(),
		EVENT_ROOM: doEnv.EVENT_ROOM,
	};

	app.use('*', async (c, next) => {
		c.set('attendeeId', overrides.attendeeId !== undefined ? overrides.attendeeId : 'att_test');
		c.set('role', overrides.role ?? undefined);
		await next();
	});
	app.route('/', ideasApp);

	app._env = env;
	app._sent = doEnv._sent;
	return app;
}

async function req(app, method, path, opts = {}) {
	const { body, headers = {} } = opts;
	const init = { method, headers: { 'content-type': 'application/json', ...headers } };
	if (body !== undefined) init.body = JSON.stringify(body);
	return app.request(path, init, app._env);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /', () => {
	it('returns an ideas array', async () => {
		const db = fakeDb({ ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }] });
		const app = buildApp({ db });
		const res = await req(app, 'GET', '/');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(Array.isArray(json)).toBe(true);
		expect(json[0].id).toBe('idea_1');
	});
});

describe('POST /', () => {
	it('returns 201 and broadcasts idea:added on success', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/', { body: { title: 'My idea' } });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.title).toBe('My idea');
		expect(app._sent.some(e => e.body.type === 'idea:added')).toBe(true);
	});

	it('returns 400 when title is missing', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/', { body: { title: '' } });
		expect(res.status).toBe(400);
	});

});

describe('POST /:id/vote', () => {
	it('first vote increments count and returns my_vote: true', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 0, description: '', submitter_id: 'att_other', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
		});
		const app = buildApp({ db });
		const res = await req(app, 'POST', '/idea_1/vote');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.my_vote).toBe(true);
		expect(json.vote_count).toBe(1);
		expect(app._sent.some(e => e.body.type === 'idea:updated')).toBe(true);
	});

	it('duplicate vote returns existing idea with my_vote: true and no double-increment', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 1, description: '', submitter_id: 'att_other', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
			votes: [{ idea_id: 'idea_1', attendee_id: 'att_test', created_at: 1 }],
		});
		const app = buildApp({ db });
		const res = await req(app, 'POST', '/idea_1/vote');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.my_vote).toBe(true);
		expect(json.vote_count).toBe(1);
	});

});

describe('DELETE /:id/vote', () => {
	it('removes vote, decrements count, and broadcasts idea:updated', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 1, description: '', submitter_id: 'att_other', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
			votes: [{ idea_id: 'idea_1', attendee_id: 'att_test', created_at: 1 }],
		});
		const app = buildApp({ db });
		const res = await req(app, 'DELETE', '/idea_1/vote');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.my_vote).toBe(false);
		expect(json.vote_count).toBe(0);
		expect(app._sent.some(e => e.body.type === 'idea:updated')).toBe(true);
	});

});

describe('POST /:id/assign', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: undefined });
		const res = await req(app, 'POST', '/idea_1/assign', { body: { slot_id: 'slot_1', room_id: 'room_1' } });
		expect(res.status).toBe(403);
	});

	it('assigns slot and room with facilitator role', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/idea_1/assign', { body: { slot_id: 'slot_1', room_id: 'room_1' } });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.slot_id).toBe('slot_1');
		expect(json.room_id).toBe('room_1');
	});

	it('returns 409 when the DB throws a UNIQUE error', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
			assignThrowsUnique: true,
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/idea_1/assign', { body: { slot_id: 'slot_1', room_id: 'room_1' } });
		expect(res.status).toBe(409);
	});
});

describe('POST /merge', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: undefined });
		const res = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		expect(res.status).toBe(403);
	});

	it('returns 400 when primary_id is missing', async () => {
		const app = buildApp({ role: 'facilitator' });
		const res = await req(app, 'POST', '/merge', { body: { merge_ids: ['idea_2'] } });
		expect(res.status).toBe(400);
	});

	it('merges ideas: copies votes to primary and marks merged ids', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'Primary', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'Merged', status: 'open', vote_count: 1, description: '', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
			],
			votes: [{ idea_id: 'idea_2', attendee_id: 'att_voter', created_at: 1 }],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.primary.id).toBe('idea_1');
		expect(json.merged).toEqual(['idea_2']);
		const merged = db.ideas.find(i => i.id === 'idea_2');
		expect(merged.status).toBe('merged');
		expect(merged.merged_into_id).toBe('idea_1');
	});

	it('rolls the merged idea\'s votes into the primary vote_count', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'Primary', status: 'open', vote_count: 1, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'Merged', status: 'open', vote_count: 2, description: '', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 2, updated_at: 2 },
			],
			votes: [
				{ idea_id: 'idea_1', attendee_id: 'att_a', created_at: 1 },
				{ idea_id: 'idea_2', attendee_id: 'att_b', created_at: 1 },
				{ idea_id: 'idea_2', attendee_id: 'att_c', created_at: 1 },
			],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		const json = await res.json();
		// 3 distinct voters total (att_a + att_b + att_c).
		expect(json.primary.vote_count).toBe(3);
		expect(db.ideas.find(i => i.id === 'idea_1').vote_count).toBe(3);
	});

	it('does not double-count a voter who voted on both ideas', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'Primary', status: 'open', vote_count: 1, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'Merged', status: 'open', vote_count: 1, description: '', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 2, updated_at: 2 },
			],
			votes: [
				{ idea_id: 'idea_1', attendee_id: 'att_shared', created_at: 1 },
				{ idea_id: 'idea_2', attendee_id: 'att_shared', created_at: 1 },
			],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		const json = await res.json();
		// Same person on both -> still counts once.
		expect(json.primary.vote_count).toBe(1);
	});

	it('surfaces merged-in idea content on the primary', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'Primary', status: 'open', vote_count: 0, description: 'p', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'Duplicate topic', status: 'open', vote_count: 1, description: 'same thing', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 2, updated_at: 2 },
			],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		const json = await res.json();
		expect(json.primary.merged_ideas).toHaveLength(1);
		expect(json.primary.merged_ideas[0]).toMatchObject({ id: 'idea_2', title: 'Duplicate topic', description: 'same thing' });
	});

	it('keeps the merge tree flat by re-pointing grandchildren to the new primary', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'New primary', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'Old primary', status: 'open', vote_count: 0, description: '', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 2, updated_at: 2 },
				{ id: 'idea_3', title: 'Grandchild', status: 'merged', vote_count: 0, description: '', submitter_id: 'att_3', slot_id: null, room_id: null, merged_into_id: 'idea_2', created_at: 3, updated_at: 3 },
			],
		});
		const app = buildApp({ db, role: 'facilitator' });
		await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		expect(db.ideas.find(i => i.id === 'idea_2').merged_into_id).toBe('idea_1');
		expect(db.ideas.find(i => i.id === 'idea_3').merged_into_id).toBe('idea_1');
	});

	it('merges a new idea into a primary that already absorbed another idea (sequential merges accumulate)', async () => {
		const db = fakeDb({
			ideas: [
				{ id: 'idea_1', title: 'Primary', status: 'open', vote_count: 1, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 },
				{ id: 'idea_2', title: 'First merge', status: 'open', vote_count: 1, description: 'first', submitter_id: 'att_2', slot_id: null, room_id: null, merged_into_id: null, created_at: 2, updated_at: 2 },
				{ id: 'idea_3', title: 'Second merge', status: 'open', vote_count: 1, description: 'second', submitter_id: 'att_3', slot_id: null, room_id: null, merged_into_id: null, created_at: 3, updated_at: 3 },
			],
			votes: [
				{ idea_id: 'idea_1', attendee_id: 'att_a', created_at: 1 },
				{ idea_id: 'idea_2', attendee_id: 'att_b', created_at: 1 },
				{ idea_id: 'idea_3', attendee_id: 'att_c', created_at: 1 },
			],
		});
		const app = buildApp({ db, role: 'facilitator' });

		// First merge: idea_2 into idea_1.
		const first = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_2'] } });
		const firstJson = await first.json();
		expect(firstJson.primary.vote_count).toBe(2);
		expect(firstJson.primary.merged_ideas.map(m => m.id)).toEqual(['idea_2']);

		// Second merge: a NEW idea_3 into the already-merged-into primary idea_1.
		const second = await req(app, 'POST', '/merge', { body: { primary_id: 'idea_1', merge_ids: ['idea_3'] } });
		const secondJson = await second.json();
		// Votes accumulate across both merges (att_a + att_b + att_c).
		expect(secondJson.primary.vote_count).toBe(3);
		// Both previously-merged and newly-merged ideas surface on the primary.
		expect(secondJson.primary.merged_ideas.map(m => m.id).sort()).toEqual(['idea_2', 'idea_3']);
		// Both merged ideas point directly at the visible primary (flat tree).
		expect(db.ideas.find(i => i.id === 'idea_2').merged_into_id).toBe('idea_1');
		expect(db.ideas.find(i => i.id === 'idea_3').merged_into_id).toBe('idea_1');
		expect(db.ideas.find(i => i.id === 'idea_2').status).toBe('merged');
		expect(db.ideas.find(i => i.id === 'idea_3').status).toBe('merged');
	});
});

describe('DELETE /:id', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: undefined });
		const res = await req(app, 'DELETE', '/idea_1');
		expect(res.status).toBe(403);
	});

	it('soft-deletes the idea and broadcasts idea:removed', async () => {
		const db = fakeDb({
			ideas: [{ id: 'idea_1', title: 'T', status: 'open', vote_count: 0, description: '', submitter_id: 'att_1', slot_id: null, room_id: null, merged_into_id: null, created_at: 1, updated_at: 1 }],
		});
		const app = buildApp({ db, role: 'facilitator' });
		const res = await req(app, 'DELETE', '/idea_1');
		expect(res.status).toBe(200);
		expect(db.ideas.find(i => i.id === 'idea_1').status).toBe('removed');
		expect(app._sent.some(e => e.body.type === 'idea:removed' && e.body.id === 'idea_1')).toBe(true);
	});
});
