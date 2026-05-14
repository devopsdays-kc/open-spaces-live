import { describe, it, expect, vi } from 'vitest';
import { broadcast } from '../broadcast.js';

function fakeDo() {
	const sent = [];
	return {
		EVENT_ROOM: {
			idFromName: () => 'main',
			get: () => ({
				fetch: async (url, init) => {
					sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
					return new Response('ok');
				},
			}),
		},
		_sent: sent,
	};
}

describe('broadcast', () => {
	it('sends a POST to the DO with the correct JSON body', async () => {
		const env = fakeDo();
		await broadcast(env, { type: 'idea:added', idea: { id: 'idea_1' } });
		expect(env._sent).toHaveLength(1);
		expect(env._sent[0].url).toBe('https://do/broadcast');
		expect(env._sent[0].body).toEqual({ type: 'idea:added', idea: { id: 'idea_1' } });
	});

	it('sets the correct content-type header', async () => {
		const env = fakeDo();
		await broadcast(env, { type: 'slot:changed' });
		expect(env._sent[0].headers['content-type']).toBe('application/json');
	});

	it('does not throw when EVENT_ROOM is undefined', async () => {
		await expect(broadcast({}, { type: 'idea:added' })).resolves.toBeUndefined();
	});

	it('swallows errors when the DO fetch throws', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = {
			EVENT_ROOM: {
				idFromName: () => 'main',
				get: () => ({
					fetch: async () => { throw new Error('DO unavailable'); },
				}),
			},
		};
		await expect(broadcast(env, { type: 'idea:added' })).resolves.toBeUndefined();
		expect(consoleSpy).toHaveBeenCalledWith('broadcast failed', expect.any(Error));
		consoleSpy.mockRestore();
	});
});
