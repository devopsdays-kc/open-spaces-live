import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { sendEmailWithMailgun } from '../email.js';
import { rateLimit } from '../lib/rateLimit.js';
import { nanoid } from '../lib/ids.js';
import { createMagicLink } from '../lib/auth.js';
import { FACILITATOR_COOKIE, ADMIN_COOKIE, KV_SESSION_PREFIX, KV_FAC_SESSION_PREFIX, KV_TOKEN_PREFIX } from '../middleware.js';

const app = new Hono();

// Facilitator: short event code -> session cookie. No email.
app.post('/facilitator-code', async (c) => {
	const ip = c.req.header('cf-connecting-ip') || 'unknown';
	const rl = await rateLimit(c.env.KV, 'fac-code', ip, [
		{ window: 60, max: 5 },
		{ window: 3600, max: 30 },
	]);
	if (!rl.allowed) return c.json({ error: 'Too many attempts', retryAfter: rl.retryAfter }, 429);

	const body = await c.req.json().catch(() => ({}));
	const code = (body.code || '').toString().trim().toUpperCase();
	if (!code) return c.json({ error: 'code required' }, 400);

	const active = await c.env.KV.get('event_code', 'json');
	if (!active || !active.code) return c.json({ error: 'No event code is set' }, 404);
	if (active.expires_at && active.expires_at < Date.now()) return c.json({ error: 'Code expired' }, 410);
	if (active.code.toUpperCase() !== code) return c.json({ error: 'Invalid code' }, 401);

	const sessionId = nanoid(20);
	await c.env.KV.put(
		`${KV_FAC_SESSION_PREFIX}${sessionId}`,
		JSON.stringify({ role: 'facilitator', created_at: Date.now() }),
		{ expirationTtl: 60 * 60 * 12 },
	);
	setCookie(c, FACILITATOR_COOKIE, sessionId, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: 60 * 60 * 12,
	});
	return c.json({ success: true });
});

// Admin: existing Mailgun magic-link flow, gated so only role=admin users get sessions.
app.post('/login', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const email = (body.email || '').toString().trim().toLowerCase();
	if (!email) return c.json({ error: 'Email required' }, 400);

	const ip = c.req.header('cf-connecting-ip') || 'unknown';
	const rl = await rateLimit(c.env.KV, 'admin-login', ip, [
		{ window: 60, max: 5 },
		{ window: 3600, max: 20 },
	]);
	if (!rl.allowed) return c.json({ error: 'Too many attempts', retryAfter: rl.retryAfter }, 429);

	const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

	// Always respond success to avoid user enumeration; only actually email admins.
	if (user && user.role === 'admin') {
		const magicLink = await createMagicLink(
			c.env.KV,
			new URL(c.req.url).origin,
			{ email: user.email, role: user.role, user_id: user.id },
			900,
		);
		const result = await sendEmailWithMailgun(c.env, {
			to: email,
			subject: 'Your Open Spaces admin login link',
			text: `Click to log in: ${magicLink}`,
			html: `<p>Click to log in:</p><p><a href="${magicLink}">${magicLink}</a></p><p>Expires in 15 minutes.</p>`,
		});
		if (!result.success) console.error('Mailgun failed', result.error);
	}

	return c.json({ success: true, message: 'If an admin account exists for that email, a magic link has been sent.' });
});

app.get('/verify', async (c) => {
	const token = c.req.query('token');
	if (!token) return c.json({ error: 'token required' }, 400);

	const data = await c.env.KV.get(`${KV_TOKEN_PREFIX}${token}`, 'json');
	if (!data) return c.json({ error: 'Invalid or expired token' }, 400);
	await c.env.KV.delete(`${KV_TOKEN_PREFIX}${token}`);
	if (data.role !== 'admin') return c.json({ error: 'Not an admin token' }, 403);

	const sessionId = nanoid(24);
	await c.env.KV.put(
		`${KV_SESSION_PREFIX}${sessionId}`,
		JSON.stringify({ email: data.email, role: 'admin', user_id: data.user_id }),
		{ expirationTtl: 60 * 60 * 24 },
	);
	setCookie(c, ADMIN_COOKIE, sessionId, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: 60 * 60 * 24,
	});
	return c.json({ success: true });
});

app.post('/logout', async (c) => {
	const facilitator = getCookie(c, FACILITATOR_COOKIE);
	if (facilitator) await c.env.KV.delete(`${KV_FAC_SESSION_PREFIX}${facilitator}`);
	const admin = getCookie(c, ADMIN_COOKIE);
	if (admin) await c.env.KV.delete(`${KV_SESSION_PREFIX}${admin}`);
	setCookie(c, FACILITATOR_COOKIE, '', { path: '/', expires: new Date(0) });
	setCookie(c, ADMIN_COOKIE, '', { path: '/', expires: new Date(0) });
	return c.json({ success: true });
});

app.get('/me', async (c) => {
	const [conferenceName, eventCodeMeta, submissionsWindow] = await Promise.all([
		c.env.KV.get('conference_name'),
		c.env.KV.get('event_code', 'json'),
		c.env.KV.get('submissions_window', 'json'),
	]);
	const eventCodeSet = !!(eventCodeMeta && eventCodeMeta.code && (!eventCodeMeta.expires_at || eventCodeMeta.expires_at > Date.now()));
	const user = c.get('user') || null;
	return c.json({
		attendee_id: c.get('attendeeId'),
		role: c.get('role') || 'attendee',
		user: user ? { email: user.email, role: 'admin' } : null,
		conference_name: conferenceName,
		event_code_set: eventCodeSet,
		submissions_open_at: submissionsWindow?.open_at ?? null,
		submissions_close_at: submissionsWindow?.close_at ?? null,
	});
});

export default app;
