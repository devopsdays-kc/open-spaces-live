import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import scheduleApp from '../schedule.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeDo() {
	const sent = [];
	return {
		_sent: sent,
		EVENT_ROOM: {
			idFromName: () => 'main',
			get: () => ({
				fetch: async (_url, init) => {
					sent.push(JSON.parse(init.body));
					return new Response('ok');
				},
			}),
		},
	};
}

function makeDb() {
	const data = { slots: [], rooms: [], ideas: [] };

	return {
		data,
		prepare(sql) {
			const s = sql.trim().replace(/\s+/g, ' ').toUpperCase();

			// Returns the statement methods for given args (supports both
			// .prepare(sql).all() and .prepare(sql).bind(...).all() patterns).
			const methods = (...args) => ({
				async run() {
							// INSERT INTO slots
							if (s.startsWith('INSERT INTO SLOTS')) {
								const [id, start_time, duration_minutes, position, created_at] = args;
								data.slots.push({ id, start_time, duration_minutes, position, created_at });
								return { meta: { changes: 1 } };
							}
							// INSERT INTO rooms
							if (s.startsWith('INSERT INTO ROOMS')) {
								const [id, name, position, created_at] = args;
								data.rooms.push({ id, name, position, created_at });
								return { meta: { changes: 1 } };
							}
							// DELETE FROM slots
							if (s.startsWith('DELETE FROM SLOTS WHERE ID')) {
								const idx = data.slots.findIndex(s => s.id === args[0]);
								if (idx !== -1) data.slots.splice(idx, 1);
								return { meta: { changes: 1 } };
							}
							// DELETE FROM rooms
							if (s.startsWith('DELETE FROM ROOMS WHERE ID')) {
								const idx = data.rooms.findIndex(r => r.id === args[0]);
								if (idx !== -1) data.rooms.splice(idx, 1);
								return { meta: { changes: 1 } };
							}
							// PATCH slot
							if (s.startsWith('UPDATE SLOTS SET')) {
								const id = args[args.length - 1];
								const slot = data.slots.find(s => s.id === id);
								if (slot && args.length === 2) slot.position = args[0];
								return { meta: { changes: 1 } };
							}
							return { meta: { changes: 0 } };
						},

						async first() {
							// COUNT ideas with slot_id
							if (s.includes('COUNT(*) AS N FROM IDEAS WHERE SLOT_ID')) {
								return { n: data.ideas.filter(i => i.slot_id === args[0]).length };
							}
							// COUNT ideas with room_id
							if (s.includes('COUNT(*) AS N FROM IDEAS WHERE ROOM_ID')) {
								return { n: data.ideas.filter(i => i.room_id === args[0]).length };
							}
							// MAX position slots
							if (s.includes('MAX(POSITION)') && s.includes('FROM SLOTS')) {
								return { m: data.slots.length > 0 ? Math.max(...data.slots.map(s => s.position)) : -1 };
							}
							// MAX position rooms
							if (s.includes('MAX(POSITION)') && s.includes('FROM ROOMS')) {
								return { m: data.rooms.length > 0 ? Math.max(...data.rooms.map(r => r.position)) : -1 };
							}
							// SELECT slot by id
							if (s.includes('FROM SLOTS WHERE ID')) {
								return data.slots.find(s => s.id === args[0]) ?? null;
							}
							// SELECT room by id
							if (s.includes('FROM ROOMS WHERE ID')) {
								return data.rooms.find(r => r.id === args[0]) ?? null;
							}
							return null;
						},

						async all() {
							if (s.includes('FROM SLOTS')) return { results: [...data.slots] };
							if (s.includes('FROM ROOMS')) return { results: [...data.rooms] };
							if (s.includes('FROM IDEAS')) return { results: [...data.ideas] };
							return { results: [] };
						},
					});

			return {
				// Support .prepare(sql).all() with no args
				...methods(),
				bind: (...args) => methods(...args),
			};
		},
	};
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp(overrides = {}) {
	const doEnv = fakeDo();
	const app = new Hono();
	const env = {
		DB: overrides.db ?? makeDb(),
		EVENT_ROOM: doEnv.EVENT_ROOM,
	};

	app.use('*', async (c, next) => {
		c.set('attendeeId', 'att_test');
		c.set('role', overrides.role !== undefined ? overrides.role : 'facilitator');
		await next();
	});
	app.route('/', scheduleApp);
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
	it('returns {slots, rooms, sessions} shape', async () => {
		const app = buildApp({ role: undefined });
		const res = await req(app, 'GET', '/');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json).toHaveProperty('slots');
		expect(json).toHaveProperty('rooms');
		expect(json).toHaveProperty('sessions');
		expect(Array.isArray(json.slots)).toBe(true);
		expect(Array.isArray(json.rooms)).toBe(true);
		expect(Array.isArray(json.sessions)).toBe(true);
	});
});

describe('POST /slots', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: null });
		const res = await req(app, 'POST', '/slots', { body: { start_time: '09:00', duration_minutes: 60 } });
		expect(res.status).toBe(403);
	});

	it('creates a slot and returns 201', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/slots', { body: { start_time: '09:00', duration_minutes: 60 } });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.start_time).toBe('09:00');
		expect(json.duration_minutes).toBe(60);
		expect(typeof json.id).toBe('string');
		expect(typeof json.position).toBe('number');
	});

	it('broadcasts slot:changed', async () => {
		const app = buildApp();
		await req(app, 'POST', '/slots', { body: { start_time: '10:00', duration_minutes: 45 } });
		expect(app._sent.some(e => e.type === 'slot:changed')).toBe(true);
	});

	it('returns 400 when start_time is missing', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/slots', { body: { duration_minutes: 60 } });
		expect(res.status).toBe(400);
	});

	it('returns 400 when duration_minutes is missing', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/slots', { body: { start_time: '09:00' } });
		expect(res.status).toBe(400);
	});
});

describe('DELETE /slots/:id', () => {
	let db;
	beforeEach(() => {
		db = makeDb();
		db.data.slots.push({ id: 'slot_1', start_time: '09:00', duration_minutes: 60, position: 0, created_at: 1 });
	});

	it('deletes and returns {success: true} when no ideas are assigned', async () => {
		const app = buildApp({ db });
		const res = await req(app, 'DELETE', '/slots/slot_1');
		expect(res.status).toBe(200);
		expect((await res.json()).success).toBe(true);
		expect(db.data.slots).toHaveLength(0);
	});

	it('broadcasts slot:removed', async () => {
		const app = buildApp({ db });
		await req(app, 'DELETE', '/slots/slot_1');
		expect(app._sent.some(e => e.type === 'slot:removed' && e.id === 'slot_1')).toBe(true);
	});

	it('returns 409 when an idea is assigned to the slot', async () => {
		db.data.ideas.push({ id: 'idea_1', slot_id: 'slot_1', room_id: 'room_1' });
		const app = buildApp({ db });
		const res = await req(app, 'DELETE', '/slots/slot_1');
		expect(res.status).toBe(409);
	});
});

describe('POST /rooms', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: null });
		const res = await req(app, 'POST', '/rooms', { body: { name: 'Room A' } });
		expect(res.status).toBe(403);
	});

	it('creates a room and returns 201', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/rooms', { body: { name: 'Room A' } });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.name).toBe('Room A');
		expect(typeof json.id).toBe('string');
	});

	it('broadcasts room:changed', async () => {
		const app = buildApp();
		await req(app, 'POST', '/rooms', { body: { name: 'Room B' } });
		expect(app._sent.some(e => e.type === 'room:changed')).toBe(true);
	});

	it('returns 400 when name is missing', async () => {
		const app = buildApp();
		const res = await req(app, 'POST', '/rooms', { body: {} });
		expect(res.status).toBe(400);
	});
});

describe('DELETE /rooms/:id', () => {
	let db;
	beforeEach(() => {
		db = makeDb();
		db.data.rooms.push({ id: 'room_1', name: 'Room A', position: 0, created_at: 1 });
	});

	it('deletes and returns {success: true} when no ideas are assigned', async () => {
		const app = buildApp({ db });
		const res = await req(app, 'DELETE', '/rooms/room_1');
		expect(res.status).toBe(200);
		expect(db.data.rooms).toHaveLength(0);
	});

	it('broadcasts room:removed', async () => {
		const app = buildApp({ db });
		await req(app, 'DELETE', '/rooms/room_1');
		expect(app._sent.some(e => e.type === 'room:removed' && e.id === 'room_1')).toBe(true);
	});

	it('returns 409 when an idea is assigned to the room', async () => {
		db.data.ideas.push({ id: 'idea_1', slot_id: 'slot_1', room_id: 'room_1' });
		const app = buildApp({ db });
		const res = await req(app, 'DELETE', '/rooms/room_1');
		expect(res.status).toBe(409);
	});
});

describe('PATCH /slots/:id', () => {
	it('returns 403 without facilitator role', async () => {
		const app = buildApp({ role: null });
		const res = await req(app, 'PATCH', '/slots/slot_1', { body: { position: 1 } });
		expect(res.status).toBe(403);
	});

	it('updates the slot and broadcasts slot:changed', async () => {
		const db = makeDb();
		db.data.slots.push({ id: 'slot_1', start_time: '09:00', duration_minutes: 60, position: 0, created_at: 1 });
		const app = buildApp({ db });
		const res = await req(app, 'PATCH', '/slots/slot_1', { body: { position: 2 } });
		expect(res.status).toBe(200);
		expect(app._sent.some(e => e.type === 'slot:changed')).toBe(true);
	});

	it('returns 400 with an empty body', async () => {
		const app = buildApp();
		const res = await req(app, 'PATCH', '/slots/slot_1', { body: {} });
		expect(res.status).toBe(400);
	});
});
