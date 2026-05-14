import { rateLimit } from '../lib/rateLimit.js';

export async function handleWsUpgrade(c) {
	if (c.req.header('Upgrade') !== 'websocket') {
		return c.json({ error: 'expected websocket upgrade' }, 426);
	}

	const ip = c.req.header('cf-connecting-ip') || 'unknown';
	const rl = await rateLimit(c.env.KV, 'ws-upgrade', ip, [{ window: 60, max: 20 }]);
	if (!rl.allowed) return c.json({ error: 'Too many connection attempts', retryAfter: rl.retryAfter }, 429);

	if (!c.env.EVENT_ROOM) {
		return c.json({ error: 'realtime not configured' }, 503);
	}
	const id = c.env.EVENT_ROOM.idFromName('main');
	const stub = c.env.EVENT_ROOM.get(id);
	return stub.fetch('https://do/connect', {
		headers: { Upgrade: 'websocket' },
	});
}
