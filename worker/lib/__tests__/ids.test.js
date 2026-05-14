import { describe, it, expect } from 'vitest';
import { nanoid, eventCode } from '../ids.js';

describe('id helpers', () => {
	it('nanoid returns the requested length', () => {
		expect(nanoid(8).length).toBe(8);
		expect(nanoid(16).length).toBe(16);
	});

	it('nanoid is unique enough', () => {
		const set = new Set();
		for (let i = 0; i < 1000; i++) set.add(nanoid(16));
		expect(set.size).toBe(1000);
	});

	it('eventCode looks like XXXX-XXXX', () => {
		const code = eventCode();
		expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
	});
});
