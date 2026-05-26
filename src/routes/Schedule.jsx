import { useMemo } from 'react';
import { useStore } from '../lib/store.js';

export default function Schedule() {
	const slots = useStore((s) => s.slots);
	const rooms = useStore((s) => s.rooms);
	const sessions = useStore((s) => s.sessions);

	const byCell = useMemo(() => {
		const m = new Map();
		for (const s of sessions) m.set(`${s.slot_id}:${s.room_id}`, s);
		return m;
	}, [sessions]);

	if (slots.length === 0 || rooms.length === 0) {
		return (
			<div className="empty">
				<h2>Schedule</h2>
				<p>The grid will appear here once facilitators set up rooms and timeslots.</p>
			</div>
		);
	}

	return (
		<div className="schedule-page">
			<h2>Schedule</h2>
			<div className="grid-wrap">
				<table className="schedule-grid">
					<thead>
						<tr>
							<th>Time</th>
							{rooms.map((r) => (
								<th key={r.id}>{r.name}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{slots.map((slot) => (
							<tr key={slot.id}>
								<th className="time-cell">
									{slot.start_time}
									<small>{slot.duration_minutes} min</small>
								</th>
								{rooms.map((r) => {
									const session = byCell.get(`${slot.id}:${r.id}`);
									return (
										<td key={r.id} className={session ? 'filled' : 'empty-cell'}>
											{session ? (
												<>
													<strong>{session.title}</strong>
													{session.description && <p>{session.description}</p>}
													<span className="vote-count">{session.vote_count} votes</span>
												</>
											) : (
												<span className="dash">—</span>
											)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
