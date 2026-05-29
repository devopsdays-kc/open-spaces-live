import { useStore } from '../lib/store.js';
import { endpoints } from '../lib/api.js';

export default function IdeaCard({ idea, selectable, selected, onSelectChange, isPrimary, onMakePrimary }) {
	const optimisticVote = useStore((s) => s.optimisticVote);
	const role = useStore((s) => s.role);
	const canModerate = selectable && (role === 'facilitator' || role === 'admin');

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
		<div className={`post-it ${scheduled ? 'scheduled' : ''} ${canModerate && selected ? 'selected' : ''} ${isPrimary ? 'primary' : ''}`}>
			{scheduled && <div className="scheduled-badge">Scheduled</div>}
			{isPrimary && <div className="primary-badge">Primary</div>}
			{canModerate && (
				<label className="select-corner">
					<input
						type="checkbox"
						checked={!!selected}
						onChange={(e) => onSelectChange?.(idea.id, e.target.checked)}
					/>
				</label>
			)}
			{canModerate && selected && onMakePrimary && (
				<button
					type="button"
					className={`make-primary ${isPrimary ? 'is-primary' : ''}`}
					onClick={() => onMakePrimary(idea.id)}
					disabled={isPrimary}
					title={isPrimary ? 'This idea will be kept as the primary' : 'Keep this idea as the primary when merging'}
				>
					{isPrimary ? '★ Primary' : '☆ Make primary'}
				</button>
			)}
			<h3>{idea.title}</h3>
			{idea.description && <p>{idea.description}</p>}
			{idea.merged_ideas?.length > 0 && (
				<div className="merged-ideas">
					<span className="merged-ideas-label">Merged in</span>
					<ul>
						{idea.merged_ideas.map((m) => (
							<li key={m.id} className="merged-idea">
								<span className="merged-tag">merged</span>
								<span className="merged-idea-title">{m.title}</span>
								{m.description && <span className="merged-idea-desc">{m.description}</span>}
							</li>
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
