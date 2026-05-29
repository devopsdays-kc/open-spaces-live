import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, VISIBLE_STATUSES } from '../lib/store.js';

const MODES = ['ideas', 'schedule'];
const DEFAULT_ROTATE_MS = 30000;
const MIN_ROTATE_MS = 5000;

// Auto-rotation is opt-in. Without `?rotate`, the projector stays on the chosen
// view so it never flips to the schedule on its own (see issue #3). `?rotate`
// enables cycling for unattended displays; `?rotate=45` sets a 45s interval.
function parseRotate(params) {
	if (!params.has('rotate')) return 0;
	const raw = params.get('rotate');
	const seconds = Number.parseInt(raw ?? '', 10);
	if (Number.isFinite(seconds) && seconds > 0) return Math.max(seconds * 1000, MIN_ROTATE_MS);
	return DEFAULT_ROTATE_MS;
}

export default function Projection() {
	const [params] = useSearchParams();
	const forced = params.get('mode');
	const rotateMs = parseRotate(params);
	const [mode, setMode] = useState(forced && MODES.includes(forced) ? forced : 'ideas');

	useEffect(() => {
		if (forced || !rotateMs) return undefined;
		const t = setInterval(() => {
			setMode((m) => (m === 'ideas' ? 'schedule' : 'ideas'));
		}, rotateMs);
		return () => clearInterval(t);
	}, [forced, rotateMs]);

	return (
		<div className="projection">
			{mode === 'ideas' ? <ProjectionIdeas /> : <ProjectionSchedule />}
		</div>
	);
}

function ProjectionIdeas() {
	const ideas = useStore((s) => s.ideas);
	const conf = useStore((s) => s.conferenceName);
	const top = ideas.filter((i) => VISIBLE_STATUSES.has(i.status)).slice(0, 12);

	return (
		<>
			<h1 className="projection-title">{conf || 'Open Spaces'} — Marketplace</h1>
			<div className="projection-board">
				{top.map((i) => (
					<div key={i.id} className={`projection-card ${i.slot_id ? 'scheduled' : ''}`}>
						<div className="big-votes">{i.vote_count}</div>
						<h2>{i.title}</h2>
						{i.description && <p>{i.description}</p>}
					</div>
				))}
				{top.length === 0 && <p className="empty">Awaiting first idea…</p>}
			</div>
		</>
	);
}

function ProjectionSchedule() {
	const slots = useStore((s) => s.slots);
	const rooms = useStore((s) => s.rooms);
	const sessions = useStore((s) => s.sessions);
	const conf = useStore((s) => s.conferenceName);
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 30000);
		return () => clearInterval(t);
	}, []);

	const byCell = useMemo(() => {
		const m = new Map();
		for (const s of sessions) m.set(`${s.slot_id}:${s.room_id}`, s);
		return m;
	}, [sessions]);

	const currentSlot = slots.find((s) => isCurrent(s, now));

	return (
		<>
			<h1 className="projection-title">{conf || 'Open Spaces'} — Schedule</h1>
			<table className="projection-grid">
				<thead>
					<tr>
						<th>Time</th>
						{rooms.map((r) => <th key={r.id}>{r.name}</th>)}
					</tr>
				</thead>
				<tbody>
					{slots.map((slot) => (
						<tr key={slot.id} className={currentSlot?.id === slot.id ? 'now' : ''}>
							<th>{slot.start_time}</th>
							{rooms.map((r) => {
								const session = byCell.get(`${slot.id}:${r.id}`);
								return (
									<td key={r.id} className={session ? 'filled' : 'empty-cell'}>
										{session ? session.title : ''}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}

function isCurrent(slot, now) {
	const parts = (slot.start_time || '').split(':');
	if (parts.length < 2) return false;
	const h = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	if (Number.isNaN(h) || Number.isNaN(m)) return false;
	const start = new Date(now);
	start.setHours(h, m, 0, 0);
	const end = new Date(start.getTime() + (slot.duration_minutes || 0) * 60000);
	return now >= start && now < end;
}
