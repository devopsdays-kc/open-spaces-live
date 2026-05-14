import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import authApp from '../auth.js';
import { FACILITATOR_COOKIE, ADMIN_COOKIE } from '../../middleware.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeKv(initial = {}) {
	const store = new Map(Object.entries(initial));
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

function fakeDb() {
	return {
		prepare: () => ({
			bind: () => ({ first: async () => null }),
		}),
	};
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp(overrides = {}) {
	const app = new Hono();
	const env = {
		DB: overrides.db ?? fakeDb(),
		KV: overrides.kv ?? fakeKv(),
		MAILGUN_API_KEY: 'fake',
		MAILGUN_DOMAIN: 'fake.mailgun.org',
		FROM_EMAIL: 'noreply@example.com',
	};

	app.use('*', async (c, next) => {
		c.set('attendeeId', overrides.attendeeId ?? 'att_test');
		c.set('role', overrides.role ?? undefined);
		c.set('user', overrides.user ?? undefined);
		await next();
	});
	app.route('/', authApp);
	app._env = env;
	return app;
}

async function req(app, method, path, opts = {}) {
	const { body, headers = {}, cookies = '' } = opts;
	const init = {
		method,
		headers: { 'content-type': 'application/json', cookie: cookies, ...headers },
	};
	if (body !== undefined) init.body = JSON.stringify(body);
	return app.request(path, init, app._env);
}

// ---------------------------------------------------------------------------
// /facilitator-code
// ---------------------------------------------------------------------------

describe('POST /facilitator-code', () => {
	it('returns {success:true} and sets the facilitator cookie for the correct code', async () => {
		const kv = fakeKv({
			event_code: JSON.stringify({ code: 'ABCD-1234', expires_at: null }),
		});
		const app = buildApp({ kv });
		const res = await req(app, 'POST', '/facilitator-code', { body: { code: 'ABCD-1234' } });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.success).toBe(true);
		expect(res.headers.get('set-cookie')).toMatch(FACILITATOR_COOKIE);
	});

	it('returns 401 for the wrong code', async () => {
		const kv = fakeKv({
			event_code: JSON.stringify({ code: 'ABCD-1234', expires_at: null }),
		});
		const app = buildApp({ kv });
		const res = await req(app, 'POST', '/facilitator-code', { body: { code: 'WRONG' } });
		expect(res.status).toBe(401);
	});

	it('returns 410 when the code is expired', async () => {
		const kv = fakeKv({
			event_code: JSON.stringify({ code: 'ABCD-1234', expires_at: Date.now() - 1000 }),
		});
		const app = buildApp({ kv });
		const res = await req(app, 'POST', '/facilitator-code', { body: { code: 'ABCD-1234' } });
		expect(res.status).toBe(410);
	});

	it('returns 404 when no event_code exists in KV', async () => {
		const kv = fakeKv({});
		const app = buildApp({ kv });
		const res = await req(app, 'POST', '/facilitator-code', { body: { code: 'ABCD-1234' } });
		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// /me
// ---------------------------------------------------------------------------

describe('GET /me', () => {
	it('returns the expected shape', async () => {
		const app = buildApp();
		const res = await req(app, 'GET', '/me');
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json).toHaveProperty('attendee_id');
		expect(json).toHaveProperty('role');
		expect(json).toHaveProperty('conference_name');
		expect(json).toHaveProperty('event_code_set');
	});

	it('returns event_code_set: true when an active code is stored', async () => {
		const kv = fakeKv({
			event_code: JSON.stringify({ code: 'XY12-ZW34', expires_at: Date.now() + 999999 }),
		});
		const app = buildApp({ kv });
		const res = await req(app, 'GET', '/me');
		const json = await res.json();
		expect(json.event_code_set).toBe(true);
	});

	it('returns event_code_set: false when no event code is stored', async () => {
		const app = buildApp({ kv: fakeKv() });
		const res = await req(app, 'GET', '/me');
		const json = await res.json();
		expect(json.event_code_set).toBe(false);
	});

	it('returns the attendee_id from context', async () => {
		const app = buildApp({ attendeeId: 'att_xyz' });
		const res = await req(app, 'GET', '/me');
		const json = await res.json();
		expect(json.attendee_id).toBe('att_xyz');
	});

	it('returns role: attendee as default', async () => {
		const app = buildApp({ role: undefined });
		const res = await req(app, 'GET', '/me');
		const json = await res.json();
		expect(json.role).toBe('attendee');
	});
});

// ---------------------------------------------------------------------------
// /logout
// ---------------------------------------------------------------------------

describe('POST /logout', () => {
	it('clears both cookies', async () => {
		const sessionId = 'sess_abc';
		const facId = 'fac_xyz';
		const kv = fakeKv({
			[`session:${sessionId}`]: JSON.stringify({ role: 'admin' }),
			[`facilitator_session:${facId}`]: JSON.stringify({ role: 'facilitator' }),
		});
		const app = buildApp({ kv });
		const cookies = `${ADMIN_COOKIE}=${sessionId}; ${FACILITATOR_COOKIE}=${facId}`;
		const res = await req(app, 'POST', '/logout', { cookies });
		expect(res.status).toBe(200);

		const setCookie = res.headers.get('set-cookie') ?? '';
		expect(setCookie).toMatch(new RegExp(`${FACILITATOR_COOKIE}=;|${FACILITATOR_COOKIE}="";`));
		expect(setCookie).toMatch(new RegExp(`${ADMIN_COOKIE}=;|${ADMIN_COOKIE}="";`));

		expect(kv.store.has(`session:${sessionId}`)).toBe(false);
		expect(kv.store.has(`facilitator_session:${facId}`)).toBe(false);
	});
});
