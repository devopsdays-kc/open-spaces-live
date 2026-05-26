import { nanoid } from './ids.js';
import { KV_TOKEN_PREFIX } from '../middleware.js';

/**
 * Creates a one-time magic-link token in KV and returns the full URL.
 * @param {KVNamespace} kv
 * @param {string} origin - request origin (e.g. https://example.com)
 * @param {{ email: string, role: string, user_id: string }} user
 * @param {number} ttlSeconds
 * @returns {Promise<string>} the magic-link URL
 */
export async function createMagicLink(kv, origin, user, ttlSeconds) {
	const token = nanoid(32);
	await kv.put(
		`${KV_TOKEN_PREFIX}${token}`,
		JSON.stringify({ email: user.email, role: user.role, user_id: user.user_id }),
		{ expirationTtl: ttlSeconds },
	);
	return `${origin}/verify-login?token=${token}`;
}
