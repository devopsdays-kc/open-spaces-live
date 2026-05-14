import { getCookie, setCookie } from 'hono/cookie';
import { sign, verify, hashIp } from './lib/cookies.js';
import { nanoid } from './lib/ids.js';

const ATTENDEE_COOKIE = 'os_attendee';
const FACILITATOR_COOKIE = 'os_facilitator';
const ADMIN_COOKIE = 'session_id';

export const KV_SESSION_PREFIX = 'session:';
export const KV_FAC_SESSION_PREFIX = 'facilitator_session:';
export const KV_TOKEN_PREFIX = 'token:';

export function attendee() {
	return async (c, next) => {
		const secret = c.env.COOKIE_SECRET;
		const salt = c.env.ATTENDEE_SALT;
		if (!secret || !salt) return c.json({ error: 'Server misconfiguration' }, 500);

		const signed = getCookie(c, ATTENDEE_COOKIE);
		let attendeeId = signed ? await verify(secret, signed) : null;

		if (attendeeId) {
			await c.env.DB
				.prepare(`INSERT INTO attendees (id, created_at, last_seen, ip_hash) VALUES (?, ?, ?, '')
				          ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`)
				.bind(attendeeId, Date.now(), Date.now())
				.run();
		} else {
			attendeeId = nanoid(16);
			// cf-connecting-ip is authoritative on Cloudflare; x-forwarded-for is client-spoofable.
			const ip = c.req.header('cf-connecting-ip') || '';
			const ipHash = (await hashIp(ip, salt)) || '';
			const now = Date.now();
			await c.env.DB
				.prepare('INSERT INTO attendees (id, created_at, last_seen, ip_hash) VALUES (?, ?, ?, ?)')
				.bind(attendeeId, now, now, ipHash)
				.run();
			const cookieValue = await sign(secret, attendeeId);
			setCookie(c, ATTENDEE_COOKIE, cookieValue, {
				httpOnly: true,
				secure: true,
				sameSite: 'Lax',
				path: '/',
				maxAge: 60 * 60 * 24 * 30,
			});
			c.set('attendeeIssued', true);
		}
		c.set('attendeeId', attendeeId);
		await next();
	};
}

export function session() {
	return async (c, next) => {
		const adminSession = getCookie(c, ADMIN_COOKIE);
		if (adminSession) {
			const data = await c.env.KV.get(`${KV_SESSION_PREFIX}${adminSession}`, 'json');
			if (data) {
				c.set('user', { ...data, role: data.role || 'admin' });
				c.set('role', data.role);
			}
		}
		if (!c.get('role')) {
			const facSession = getCookie(c, FACILITATOR_COOKIE);
			if (facSession) {
				const data = await c.env.KV.get(`${KV_FAC_SESSION_PREFIX}${facSession}`, 'json');
				if (data) c.set('role', 'facilitator');
			}
		}
		await next();
	};
}

export const requireFacilitator = async (c, next) => {
	const role = c.get('role');
	if (role === 'facilitator' || role === 'admin') return next();
	return c.json({ error: 'Unauthorized' }, 403);
};

export const requireAdmin = async (c, next) => {
	if (c.get('role') === 'admin') return next();
	return c.json({ error: 'Forbidden' }, 403);
};

export const requireAttendee = async (c, next) => {
	if (!c.get('attendeeId')) return c.json({ error: 'Missing attendee cookie' }, 400);
	return next();
};

export { ATTENDEE_COOKIE, FACILITATOR_COOKIE, ADMIN_COOKIE };
