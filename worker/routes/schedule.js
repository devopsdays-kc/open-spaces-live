import { Hono } from 'hono';
import { nanoid } from '../lib/ids.js';
import { broadcast } from '../lib/broadcast.js';
import { requireFacilitator } from '../middleware.js';

const app = new Hono();

async function nextPosition(db, table) {
	const row = await db.prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM ${table}`).first();
	return (row?.m ?? -1) + 1;
}

function buildPatch(body, allowedFields) {
	const sets = [];
	const args = [];
	for (const f of allowedFields) {
		if (body[f] !== undefined) { sets.push(`${f} = ?`); args.push(body[f]); }
	}
	return { sets, args };
}

app.get('/', async (c) => {
	const db = c.env.DB;
	const [slotsRes, roomsRes, ideasRes] = await Promise.all([
		db.prepare('SELECT id, start_time, duration_minutes, position, created_at FROM slots ORDER BY position, start_time').all(),
		db.prepare('SELECT id, name, position, created_at FROM rooms ORDER BY position, name').all(),
		db.prepare(
			`SELECT id, title, description, vote_count, slot_id, room_id
			   FROM ideas
			  WHERE status = 'scheduled' AND slot_id IS NOT NULL AND room_id IS NOT NULL`,
		).all(),
	]);
	c.header('Cache-Control', 'no-store');
	return c.json({
		slots: slotsRes.results,
		rooms: roomsRes.results,
		sessions: ideasRes.results,
	});
});

app.get('/slots', requireFacilitator, async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM slots ORDER BY position, start_time').all();
	return c.json(results);
});

app.post('/slots', requireFacilitator, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const { start_time, duration_minutes } = body;
	if (!start_time || !duration_minutes) {
		return c.json({ error: 'start_time and duration_minutes required' }, 400);
	}
	const id = `slot_${nanoid(10)}`;
	const now = Date.now();
	const position = await nextPosition(c.env.DB, 'slots');
	await c.env.DB
		.prepare('INSERT INTO slots (id, start_time, duration_minutes, position, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(id, start_time, duration_minutes, position, now)
		.run();
	const slot = { id, start_time, duration_minutes, position, created_at: now };
	await broadcast(c.env, { type: 'slot:changed', slot });
	return c.json(slot, 201);
});

app.patch('/slots/:id', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const body = await c.req.json().catch(() => ({}));
	const { sets, args } = buildPatch(body, ['start_time', 'duration_minutes', 'position']);
	if (sets.length === 0) return c.json({ error: 'No updates' }, 400);
	await c.env.DB.prepare(`UPDATE slots SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
	const slot = await c.env.DB.prepare('SELECT * FROM slots WHERE id = ?').bind(id).first();
	await broadcast(c.env, { type: 'slot:changed', slot });
	return c.json(slot);
});

app.delete('/slots/:id', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const used = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE slot_id = ?').bind(id).first();
	if (used?.n > 0) {
		return c.json({ error: 'Unassign ideas from this slot before deleting' }, 409);
	}
	await c.env.DB.prepare('DELETE FROM slots WHERE id = ?').bind(id).run();
	await broadcast(c.env, { type: 'slot:removed', id });
	return c.json({ success: true });
});

app.get('/rooms', requireFacilitator, async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM rooms ORDER BY position, name').all();
	return c.json(results);
});

app.post('/rooms', requireFacilitator, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const name = (body.name || '').toString().trim();
	if (!name) return c.json({ error: 'name required' }, 400);
	const id = `room_${nanoid(10)}`;
	const now = Date.now();
	const position = await nextPosition(c.env.DB, 'rooms');
	await c.env.DB
		.prepare('INSERT INTO rooms (id, name, position, created_at) VALUES (?, ?, ?, ?)')
		.bind(id, name, position, now)
		.run();
	const room = { id, name, position, created_at: now };
	await broadcast(c.env, { type: 'room:changed', room });
	return c.json(room, 201);
});

app.patch('/rooms/:id', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const body = await c.req.json().catch(() => ({}));
	const { sets, args } = buildPatch(body, ['name', 'position']);
	if (sets.length === 0) return c.json({ error: 'No updates' }, 400);
	await c.env.DB.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
	const room = await c.env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();
	await broadcast(c.env, { type: 'room:changed', room });
	return c.json(room);
});

app.delete('/rooms/:id', requireFacilitator, async (c) => {
	const { id } = c.req.param();
	const used = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE room_id = ?').bind(id).first();
	if (used?.n > 0) {
		return c.json({ error: 'Unassign ideas from this room before deleting' }, 409);
	}
	await c.env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
	await broadcast(c.env, { type: 'room:removed', id });
	return c.json({ success: true });
});

export default app;
