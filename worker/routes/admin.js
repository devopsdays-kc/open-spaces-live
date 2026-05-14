import { Hono } from 'hono';
import { sendEmailWithMailgun } from '../email.js';
import { nanoid, eventCode } from '../lib/ids.js';
import { broadcast } from '../lib/broadcast.js';
import { createMagicLink } from '../lib/auth.js';
import { requireAdmin, KV_FAC_SESSION_PREFIX } from '../middleware.js';

const app = new Hono();

app.use('*', requireAdmin);

// KV.list returns max 1000 keys per page; cursor-loop to get all.
async function kvListAll(kv, prefix) {
	const keys = [];
	let cursor;
	do {
		const result = await kv.list({ prefix, ...(cursor && { cursor }) });
		keys.push(...result.keys);
		cursor = result.list_complete ? undefined : result.cursor;
	} while (cursor);
	return keys;
}

app.get('/users', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT id, email, role FROM users ORDER BY email').all();
	return c.json(results);
});

app.post('/users', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const email = (body.email || '').toString().trim().toLowerCase();
	const role = body.role;
	if (!email || (role !== 'admin' && role !== 'facilitator')) {
		return c.json({ error: 'email and role (admin|facilitator) required' }, 400);
	}

	const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
	if (existing) return c.json({ error: 'User already exists' }, 409);

	const id = `usr_${nanoid(12)}`;
	await c.env.DB.prepare('INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)')
		.bind(id, email, role, Date.now()).run();

	if (role === 'admin') {
		const magicLink = await createMagicLink(
			c.env.KV,
			new URL(c.req.url).origin,
			{ email, role, user_id: id },
			60 * 60 * 24,
		);
		const inviter = c.get('user');
		await sendEmailWithMailgun(c.env, {
			to: email,
			subject: 'You have been invited as an Open Spaces admin',
			text: `Click to set up your admin account: ${magicLink}`,
			html: `<p>${inviter?.email || 'An admin'} invited you to administer Open Spaces.</p>
			       <p><a href="${magicLink}">${magicLink}</a></p>
			       <p>Link expires in 24 hours.</p>`,
		});
	}

	return c.json({ success: true, user: { id, email, role } }, 201);
});

app.delete('/users/:id', async (c) => {
	const { id } = c.req.param();
	const current = c.get('user');
	if (current?.user_id === id) return c.json({ error: 'You cannot delete your own account' }, 400);
	await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
	return c.json({ success: true });
});

app.post('/conference-name', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const name = (body.name || '').toString().trim().slice(0, 200);
	if (!name) return c.json({ error: 'name required' }, 400);
	await c.env.KV.put('conference_name', name);
	await broadcast(c.env, { type: 'conference:renamed', name });
	return c.json({ success: true, name });
});

app.post('/rotate-event-code', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const code = (body.code && body.code.toString().trim().toUpperCase()) || eventCode();
	const ttlHours = Number(body.ttl_hours) > 0 ? Number(body.ttl_hours) : 24;
	const expires_at = Date.now() + ttlHours * 60 * 60 * 1000;
	await c.env.KV.put('event_code', JSON.stringify({ code, expires_at }), {
		expirationTtl: Math.ceil(ttlHours * 60 * 60) + 60,
	});
	const keys = await kvListAll(c.env.KV, KV_FAC_SESSION_PREFIX);
	await Promise.all(keys.map((k) => c.env.KV.delete(k.name)));
	return c.json({ success: true, code, expires_at });
});

app.get('/event-code', async (c) => {
	const meta = await c.env.KV.get('event_code', 'json');
	return c.json(meta || { code: null });
});

app.post('/reset-votes', async (c) => {
	await c.env.DB.prepare(`DELETE FROM votes`).run();
	await c.env.DB.prepare(`UPDATE ideas SET vote_count = 0, updated_at = ?`).bind(Date.now()).run();
	await broadcast(c.env, { type: 'conference:votes_reset' });
	return c.json({ success: true });
});

app.get('/submissions-window', async (c) => {
	const data = await c.env.KV.get('submissions_window', 'json');
	return c.json(data || { open_at: null, close_at: null });
});

app.post('/submissions-window', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const open_at = body.open_at != null ? Number(body.open_at) : null;
	const close_at = body.close_at != null ? Number(body.close_at) : null;
	if ((open_at != null && isNaN(open_at)) || (close_at != null && isNaN(close_at))) {
		return c.json({ error: 'open_at and close_at must be numeric milliseconds' }, 400);
	}
	if (open_at && close_at && close_at <= open_at) {
		return c.json({ error: 'close_at must be after open_at' }, 400);
	}
	const payload = { open_at, close_at };
	await c.env.KV.put('submissions_window', JSON.stringify(payload));
	await broadcast(c.env, { type: 'conference:submissions_window_changed', ...payload });
	return c.json({ success: true, ...payload });
});

app.post('/full-reset', async (c) => {
	await c.env.DB.batch([
		c.env.DB.prepare(`DELETE FROM votes`),
		c.env.DB.prepare(`DELETE FROM ideas`),
		c.env.DB.prepare(`DELETE FROM slots`),
		c.env.DB.prepare(`DELETE FROM rooms`),
		c.env.DB.prepare(`DELETE FROM attendees`),
	]);
	await Promise.all([
		c.env.KV.delete('conference_name'),
		c.env.KV.delete('event_code'),
		c.env.KV.delete('submissions_window'),
	]);
	const keys = await kvListAll(c.env.KV, KV_FAC_SESSION_PREFIX);
	await Promise.all(keys.map((k) => c.env.KV.delete(k.name)));
	await broadcast(c.env, { type: 'conference:reset' });
	return c.json({ success: true });
});

export default app;
