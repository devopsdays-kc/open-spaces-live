import { describe, it, expect } from 'vitest';
import { rateLimit } from '../rateLimit.js';

function fakeKv() {
	const store = new Map();
	return {
		store,
		async get(k) { return store.get(k) ?? null; },
		async put(k, v) { store.set(k, v); },
	};
}

describe('rateLimit', () => {
	it('allows requests under the threshold', async () => {
		const kv = fakeKv();
		for (let i = 0; i < 5; i++) {
			const res = await rateLimit(kv, 'vote', 'attendee_1', [{ window: 60, max: 5 }]);
			expect(res.allowed).toBe(true);
		}
	});

	it('rejects once the threshold is hit', async () => {
		const kv = fakeKv();
		for (let i = 0; i < 5; i++) await rateLimit(kv, 'vote', 'attendee_1', [{ window: 60, max: 5 }]);
		const blocked = await rateLimit(kv, 'vote', 'attendee_1', [{ window: 60, max: 5 }]);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	it('respects the most restrictive window', async () => {
		const kv = fakeKv();
		const limits = [
			{ window: 60, max: 30 },
			{ window: 3600, max: 5 },
		];
		for (let i = 0; i < 5; i++) {
			const res = await rateLimit(kv, 'vote', 'a', limits);
			expect(res.allowed).toBe(true);
		}
		const blocked = await rateLimit(kv, 'vote', 'a', limits);
		expect(blocked.allowed).toBe(false);
	});

	it('separates counters by key', async () => {
		const kv = fakeKv();
		const limits = [{ window: 60, max: 1 }];
		expect((await rateLimit(kv, 'vote', 'a', limits)).allowed).toBe(true);
		expect((await rateLimit(kv, 'vote', 'a', limits)).allowed).toBe(false);
		expect((await rateLimit(kv, 'vote', 'b', limits)).allowed).toBe(true);
	});
});
