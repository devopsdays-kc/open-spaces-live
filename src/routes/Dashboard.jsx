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
	const [primaryId, setPrimaryId] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	const visible = ideas.filter((i) => VISIBLE_STATUSES.has(i.status));
	const selectedIdeas = visible.filter((i) => selected.has(i.id));

	// The primary is the kept idea. Default to the highest-voted selection
	// (visible is already sorted by votes), but honor an explicit override.
	const effectivePrimaryId =
		primaryId && selected.has(primaryId) ? primaryId : selectedIdeas[0]?.id ?? null;
	const primaryIdea = selectedIdeas.find((i) => i.id === effectivePrimaryId) ?? null;
	const mergeTargets = selectedIdeas.filter((i) => i.id !== effectivePrimaryId);

	function onSelectChange(id, isOn) {
		setError(null);
		setSelected((prev) => {
			const next = new Set(prev);
			if (isOn) next.add(id); else next.delete(id);
			return next;
		});
	}

	function clearSelection() {
		setSelected(new Set());
		setPrimaryId(null);
		setError(null);
	}

	async function doMerge() {
		if (!primaryIdea || mergeTargets.length === 0) return;
		setBusy(true);
		setError(null);
		try {
			await endpoints.merge(primaryIdea.id, mergeTargets.map((i) => i.id));
			clearSelection();
			refreshIdeas();
		} catch (e) {
			setError(e.message || 'Merge failed');
		} finally {
			setBusy(false);
		}
	}

	async function doDelete() {
		const ids = [...selected];
		if (ids.length === 0) return;
		if (!confirm(`Remove ${ids.length} idea(s) from the board?`)) return;
		setBusy(true);
		setError(null);
		try {
			const results = await Promise.allSettled(ids.map((id) => endpoints.deleteIdea(id)));
			const failed = results.filter((r) => r.status === 'rejected').length;
			if (failed) setError(`${failed} idea(s) could not be removed.`);
			clearSelection();
			refreshIdeas();
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<div className="moderation-bar">
				<span>{selected.size} selected</span>
				<button type="button" onClick={doDelete} disabled={selected.size === 0 || busy} className="danger">
					Remove
				</button>
				{selected.size > 0 && (
					<button type="button" onClick={clearSelection} disabled={busy} className="ghost">
						Clear
					</button>
				)}
			</div>

			{selected.size >= 2 && primaryIdea && (
				<div className="merge-panel">
					<div className="merge-panel-summary">
						<strong>Merge {mergeTargets.length} idea{mergeTargets.length === 1 ? '' : 's'}</strong> into
						<span className="merge-primary-name"> {primaryIdea.title}</span>
						<span className="merge-hint"> — the others are kept as “merged in” under it, and their votes roll up.</span>
					</div>
					<ol className="merge-target-list">
						{mergeTargets.map((i) => (
							<li key={i.id}>{i.title}</li>
						))}
					</ol>
					<div className="merge-panel-actions">
						<button type="button" onClick={doMerge} disabled={busy} className="primary-action">
							{busy ? 'Merging…' : `Merge into “${primaryIdea.title}”`}
						</button>
						<span className="merge-tip">Tip: use “Make primary” on a card to choose which idea is kept.</span>
					</div>
				</div>
			)}

			{selected.size === 1 && (
				<p className="merge-help">Select at least one more idea to enable merging.</p>
			)}

			{error && <p className="moderation-error" role="alert">{error}</p>}

			<div className="post-it-board">
				{visible.map((idea) => (
					<IdeaCard
						key={idea.id}
						idea={idea}
						selectable
						selected={selected.has(idea.id)}
						onSelectChange={onSelectChange}
						isPrimary={selected.size >= 2 && idea.id === effectivePrimaryId}
						onMakePrimary={setPrimaryId}
					/>
				))}
			</div>
		</>
	);
}
