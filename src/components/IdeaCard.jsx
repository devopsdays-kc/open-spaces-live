import { useStore } from '../lib/store.js';
import { endpoints } from '../lib/api.js';

export default function IdeaCard({ idea, selectable, selected, onSelectChange }) {
	const optimisticVote = useStore((s) => s.optimisticVote);
	const role = useStore((s) => s.role);

	async function toggleVote() {
		const wasVoted = idea.my_vote;
		optimisticVote(idea.id, wasVoted ? -1 : 1);
		try {
			if (wasVoted) await endpoints.unvote(idea.id);
			else await endpoints.vote(idea.id);
		} catch (err) {
			optimisticVote(idea.id, wasVoted ? 1 : -1);
			alert(err.message || 'Vote failed');
		}
	}

	const scheduled = !!idea.slot_id;

	return (
		<div className={`post-it ${scheduled ? 'scheduled' : ''}`}>
			{scheduled && <div className="scheduled-badge">Scheduled</div>}
			{selectable && (role === 'facilitator' || role === 'admin') && (
				<label className="select-corner">
					<input
						type="checkbox"
						checked={!!selected}
						onChange={(e) => onSelectChange?.(idea.id, e.target.checked)}
					/>
				</label>
			)}
			<h3>{idea.title}</h3>
			{idea.description && <p>{idea.description}</p>}
			{idea.merged_ideas?.length > 0 && (
				<div className="merged-ideas">
					<strong>Merged in:</strong>
					<ul>
						{idea.merged_ideas.map((merged) => (
							<li key={merged.id}>{merged.title}</li>
						))}
					</ul>
				</div>
			)}
			<div className="post-it-footer">
				<span className="vote-count">{idea.vote_count} vote{idea.vote_count === 1 ? '' : 's'}</span>
				<button
					type="button"
					onClick={toggleVote}
					className={`vote-button ${idea.my_vote ? 'voted' : ''}`}
					disabled={scheduled}
				>
					{idea.my_vote ? '✓ Voted' : 'Vote'}
				</button>
			</div>
		</div>
	);
}
