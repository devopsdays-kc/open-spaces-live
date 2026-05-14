import { useEffect, useState } from 'react';
import { useStore, VISIBLE_STATUSES } from '../lib/store.js';
import { endpoints } from '../lib/api.js';
import IdeaCard from '../components/IdeaCard.jsx';

function useSubmissionsStatus() {
	const openAt = useStore((s) => s.submissionsOpenAt);
	const closeAt = useStore((s) => s.submissionsCloseAt);
	const [, tick] = useState(0);

	useEffect(() => {
		const next = [openAt, closeAt].filter(Boolean).find((t) => t > Date.now());
		if (!next) return;
		const id = setTimeout(() => tick((n) => n + 1), next - Date.now() + 50);
		return () => clearTimeout(id);
	}, [openAt, closeAt]);

	const now = Date.now();
	if (openAt && now < openAt) return { open: false, reason: `Submissions open ${new Date(openAt).toLocaleString()}` };
	if (closeAt && now > closeAt) return { open: false, reason: `Submissions closed ${new Date(closeAt).toLocaleString()}` };
	return { open: true, reason: null };
}

export default function Marketplace() {
	const ideas = useStore((s) => s.ideas);
	const submissions = useSubmissionsStatus();
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	async function submit(e) {
		e.preventDefault();
		setError('');
		if (!title.trim()) return;
		setSubmitting(true);
		try {
			await endpoints.submitIdea(title.trim(), description.trim());
			setTitle('');
			setDescription('');
		} catch (err) {
			setError(err.message || 'Failed to submit');
		} finally {
			setSubmitting(false);
		}
	}

	const open = ideas.filter((i) => VISIBLE_STATUSES.has(i.status));

	return (
		<>
			<div className="main-title-section">
				<h1>Marketplace of Ideas</h1>
				<p className="subtitle">Submit a topic. Vote for the ones you want to discuss. Updates are live.</p>
			</div>

			<div className="card new-idea-form">
				<h3>Got an Idea?</h3>
				{submissions.open ? (
					<form onSubmit={submit}>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="What's your idea?"
							maxLength={140}
							required
						/>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="A sentence or two of context (optional)"
							maxLength={2000}
						/>
						<button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Idea'}</button>
						{error && <p className="message error">{error}</p>}
					</form>
				) : (
					<p className="message">{submissions.reason}</p>
				)}
			</div>

			{open.length === 0 ? (
				<p className="empty">No ideas yet — be the first to add one!</p>
			) : (
				<div className="post-it-board">
					{open.map((idea) => (
						<IdeaCard key={idea.id} idea={idea} />
					))}
				</div>
			)}
		</>
	);
}
