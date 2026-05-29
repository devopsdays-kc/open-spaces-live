import { describe, it, expect } from 'vitest';
import { listIdeasWithMyVote, getIdea } from '../ideas.js';

function makeStmt(returnAll, returnFirst) {
	return {
		bind: () => ({
			all: async () => ({ results: returnAll }),
			first: async () => returnFirst,
		}),
	};
}

function fakeDb({ allRows = [], firstRow = null } = {}) {
	return {
		prepare: () => makeStmt(allRows, firstRow),
	};
}

describe('listIdeasWithMyVote', () => {
	it('returns empty array when there are no ideas', async () => {
		const db = fakeDb({ allRows: [] });
		const result = await listIdeasWithMyVote(db, 'att_1');
		expect(result).toEqual([]);
	});

	it('maps my_vote: 1 to true and my_vote: 0 to false', async () => {
		const rows = [
			{ id: 'idea_1', title: 'A', my_vote: 1 },
			{ id: 'idea_2', title: 'B', my_vote: 0 },
		];
		const db = fakeDb({ allRows: rows });
		const result = await listIdeasWithMyVote(db, 'att_1');
		expect(result[0].my_vote).toBe(true);
		expect(result[1].my_vote).toBe(false);
	});

	it('preserves all other fields on each row', async () => {
		const row = { id: 'idea_1', title: 'Hello', vote_count: 3, my_vote: 1 };
		const db = fakeDb({ allRows: [row] });
		const [result] = await listIdeasWithMyVote(db, 'att_1');
		expect(result.id).toBe('idea_1');
		expect(result.title).toBe('Hello');
		expect(result.vote_count).toBe(3);
	});

	it('passes empty string to the query when attendeeId is null', async () => {
		let captured;
		const db = {
			prepare: () => ({
				bind: (...args) => {
					// Only the main list query binds the attendee id; the merged-children
					// query binds no args. Capture the first (main) call.
					if (captured === undefined) captured = args;
					return { all: async () => ({ results: [] }) };
				},
			}),
		};
		await listIdeasWithMyVote(db, null);
		expect(captured).toEqual(['']);
	});
});

describe('getIdea', () => {
	it('returns the row when found', async () => {
		const idea = { id: 'idea_42', title: 'Test', vote_count: 0 };
		const db = fakeDb({ firstRow: idea });
		const result = await getIdea(db, 'idea_42');
		expect(result).toEqual(idea);
	});

	it('returns null when not found', async () => {
		const db = fakeDb({ firstRow: null });
		const result = await getIdea(db, 'idea_nope');
		expect(result).toBeNull();
	});
});
