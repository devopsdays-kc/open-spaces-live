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
	return results.map((r) => ({ ...r, my_vote: !!r.my_vote }));
}

export async function getIdea(db, id) {
	return db.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
}
