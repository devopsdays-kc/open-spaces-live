import React, { useState, useEffect } from 'react';
import './App.css';

function Schedule() {
	const [schedule, setSchedule] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchSchedule = async () => {
			try {
				const response = await fetch('/api/schedule');
				if (!response.ok) {
					throw new Error('Failed to fetch schedule');
				}
				const data = await response.json();
				setSchedule(data);
			} catch (err) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		};

		fetchSchedule();
	}, []);

	if (loading) return <div>Loading schedule...</div>;
	if (error) return <div>Error: {error}</div>;

	return (
		<div className="schedule-container">
			<h1>Conference Schedule</h1>
			<table className="schedule-table">
				<thead>
					<tr>
						<th>Time</th>
						<th>Room</th>
						<th>Session</th>
						<th>Votes</th>
					</tr>
				</thead>
				<tbody>
					{schedule.map(slot => (
						slot.sessions.length > 0 ? (
							slot.sessions.map((session, index) => (
								<tr key={session.id}>
									{index === 0 ? (
										<td rowSpan={slot.sessions.length} className="slot-time-cell">
											{slot.start_time}
											<br />
											<small>({slot.duration_minutes} mins)</small>
										</td>
									) : null}
									<td>{session.roomName}</td>
									<td>
										<strong>{session.title}</strong>
										<p>{session.description}</p>
									</td>
									<td>{session.votes}</td>
								</tr>
							))
						) : (
							<tr key={slot.id} className="empty-slot-row">
								<td className="slot-time-cell">
									{slot.start_time}
									<br />
									<small>({slot.duration_minutes} mins)</small>
								</td>
								<td colSpan="3">
									<em>No sessions scheduled in this slot.</em>
								</td>
							</tr>
						)
					))}
				</tbody>
			</table>
		</div>
	);
}

export default Schedule;
