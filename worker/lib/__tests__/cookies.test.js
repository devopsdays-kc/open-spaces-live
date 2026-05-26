import { describe, it, expect } from 'vitest';
import { sign, verify, hashIp } from '../cookies.js';

describe('cookie HMAC', () => {
	const secret = 'test-secret-32-chars-minimum-please';

	it('round-trips a valid signature', async () => {
		const signed = await sign(secret, 'attendee_abc123');
		const out = await verify(secret, signed);
		expect(out).toBe('attendee_abc123');
	});

	it('rejects a tampered payload', async () => {
		const signed = await sign(secret, 'attendee_abc123');
		const dot = signed.lastIndexOf('.');
		const tampered = 'attendee_HACKED' + signed.slice(dot);
		const out = await verify(secret, tampered);
		expect(out).toBeNull();
	});

	it('rejects a tampered signature', async () => {
		const signed = await sign(secret, 'attendee_abc123');
		const tampered = signed.slice(0, -2) + 'aa';
		const out = await verify(secret, tampered);
		expect(out).toBeNull();
	});

	it('rejects values without a separator', async () => {
		expect(await verify(secret, 'no-dot')).toBeNull();
		expect(await verify(secret, '')).toBeNull();
		expect(await verify(secret, null)).toBeNull();
	});

	it('produces stable hash for same IP', async () => {
		const a = await hashIp('1.2.3.4', 'salt');
		const b = await hashIp('1.2.3.4', 'salt');
		expect(a).toBe(b);
		const c = await hashIp('1.2.3.5', 'salt');
		expect(a).not.toBe(c);
	});
});
