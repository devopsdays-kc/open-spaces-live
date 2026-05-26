import { useState } from 'react';
import { useStore, VISIBLE_STATUSES } from '../lib/store.js';
import { endpoints } from '../lib/api.js';
import IdeaCard from '../components/IdeaCard.jsx';
import ScheduleBuilder from './ScheduleBuilder.jsx';
import AdminPanel from './AdminPanel.jsx';

const TABS = ['ideas', 'schedule', 'admin'];

export default function Dashboard() {
	const role = useStore((s) => s.role);
	const [tab, setTab] = useState('ideas');

	return (
		<div className="dashboard">
			<nav className="dashboard-tabs">
				{TABS.filter((t) => t !== 'admin' || role === 'admin').map((t) => (
					<button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
						{t === 'ideas' ? 'Ideas' : t === 'schedule' ? 'Schedule Builder' : 'Admin'}
					</button>
				))}
			</nav>
			{tab === 'ideas' && <IdeaModeration />}
			{tab === 'schedule' && <ScheduleBuilder />}
			{tab === 'admin' && role === 'admin' && <AdminPanel />}
		</div>
	);
}

function IdeaModeration() {
	const ideas = useStore((s) => s.ideas);
	const refreshIdeas = useStore((s) => s.refreshIdeas);
	const [selected, setSelected] = useState(new Set());

	function onSelectChange(id, isOn) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (isOn) next.add(id); else next.delete(id);
			return next;
		});
	}

	async function doMerge() {
		const ids = [...selected];
		if (ids.length < 2) {
			alert('Select at least two ideas to merge.');
			return;
		}
		const primary = ids[0];
		const rest = ids.slice(1);
		if (!confirm(`Merge ${rest.length} idea(s) into "${ideas.find((i) => i.id === primary)?.title}"?`)) return;
		try {
			await endpoints.merge(primary, rest);
			setSelected(new Set());
			refreshIdeas();
		} catch (e) {
			alert(e.message);
		}
	}

	async function doDelete() {
		const ids = [...selected];
		if (ids.length === 0) return;
		if (!confirm(`Remove ${ids.length} idea(s) from the board?`)) return;
		await Promise.allSettled(ids.map((id) => endpoints.deleteIdea(id).catch((e) => console.error(e))));
		setSelected(new Set());
		refreshIdeas();
	}

	const visible = ideas.filter((i) => VISIBLE_STATUSES.has(i.status));

	return (
		<>
			<div className="moderation-bar">
				<span>{selected.size} selected</span>
				<button type="button" onClick={doMerge} disabled={selected.size < 2}>Merge (first = primary)</button>
				<button type="button" onClick={doDelete} disabled={selected.size === 0} className="danger">Remove</button>
			</div>
			<div className="post-it-board">
				{visible.map((idea) => (
					<IdeaCard
						key={idea.id}
						idea={idea}
						selectable
						selected={selected.has(idea.id)}
						onSelectChange={onSelectChange}
					/>
				))}
			</div>
		</>
	);
}
