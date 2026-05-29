// Shared helpers for shaping idea rows + reading "did I vote on this?" state.

// Columns we surface for ideas that were merged into a visible primary. The
// merged rows stay in D1 (status='merged') so their content is never lost —
// we attach them to their primary so the UI can show "merged in" provenance.
const MERGED_CHILD_COLS = 'id, title, description, submitter_id, merged_into_id, created_at, updated_at';

export async function listIdeasWithMyVote(db, attendeeId) {
	const { results } = await db
		.prepare(
			`SELECT i.id, i.title, i.description, i.submitter_id, i.vote_count,
			        i.slot_id, i.room_id, i.merged_into_id, i.status,
			        i.created_at, i.updated_at,
			        CASE WHEN v.attendee_id IS NULL THEN 0 ELSE 1 END AS my_vote
			   FROM ideas i
			   LEFT JOIN votes v ON v.idea_id = i.id AND v.attendee_id = ?
			   WHERE i.status IN ('open', 'scheduled')
			   ORDER BY i.vote_count DESC, i.created_at ASC`,
		)
		.bind(attendeeId || '')
		.all();
	const ideas = results.map((r) => ({ ...r, my_vote: !!r.my_vote, merged_ideas: [] }));

	const byId = new Map(ideas.map((i) => [i.id, i]));
	const { results: merged } = await db
		.prepare(
			`SELECT ${MERGED_CHILD_COLS}
			   FROM ideas
			  WHERE status = 'merged' AND merged_into_id IS NOT NULL
			  ORDER BY created_at ASC`,
		)
		.bind()
		.all();
	for (const child of merged) {
		byId.get(child.merged_into_id)?.merged_ideas.push(child);
	}

	return ideas;
}

export async function getIdea(db, id) {
	const idea = await db.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
	if (!idea) return null;
	const { results } = await db
		.prepare(
			`SELECT ${MERGED_CHILD_COLS}
			   FROM ideas
			  WHERE merged_into_id = ? AND status = 'merged'
			  ORDER BY created_at ASC`,
		)
		.bind(id)
		.all();
	idea.merged_ideas = results ?? [];
	return idea;
}
