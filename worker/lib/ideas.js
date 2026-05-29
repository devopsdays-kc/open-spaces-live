// Shared helpers for shaping idea rows + reading "did I vote on this?" state.

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

	const ideas = (results ?? []).map((r) => ({ ...r, my_vote: !!r.my_vote }));
	if (ideas.length === 0) return [];

	const ids = ideas.map((idea) => idea.id);
	const placeholders = ids.map(() => '?').join(',');
	const mergedQuery = await db
		.prepare(
			`SELECT id, title, merged_into_id
			   FROM ideas
			   WHERE status = 'merged' AND merged_into_id IN (${placeholders})`,
		)
		.bind(...ids)
		.all();

	const mergedMap = (mergedQuery.results ?? []).reduce((acc, row) => {
		acc[row.merged_into_id] = acc[row.merged_into_id] || [];
		acc[row.merged_into_id].push({ id: row.id, title: row.title });
		return acc;
	}, {});

	return ideas.map((idea) => ({
		...idea,
		merged_ideas: mergedMap[idea.id] ?? [],
	}));
}

export async function getIdea(db, id) {
	const idea = await db.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
	if (!idea) return null;
	const { results } = await db
		.prepare('SELECT id, title FROM ideas WHERE status = \'merged\' AND merged_into_id = ?')
		.bind(id)
		.all();
	return { ...idea, merged_ideas: results ?? [] };
}
