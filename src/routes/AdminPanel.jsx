import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.js';
import { endpoints } from '../lib/api.js';

function msToDatetimeLocal(ms) {
	if (!ms) return '';
	// Shift by local TZ offset so toISOString yields YYYY-MM-DDTHH:MM in local time.
	const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 16);
}

function datetimeLocalToMs(str) {
	return str ? new Date(str).getTime() : null;
}

export default function AdminPanel() {
	const conferenceName = useStore((s) => s.conferenceName);
	const submissionsOpenAt = useStore((s) => s.submissionsOpenAt);
	const submissionsCloseAt = useStore((s) => s.submissionsCloseAt);
	const refreshMe = useStore((s) => s.refreshMe);
	const refreshIdeas = useStore((s) => s.refreshIdeas);
	const refreshSchedule = useStore((s) => s.refreshSchedule);

	const [name, setName] = useState(conferenceName ?? '');
	const [eventCode, setEventCode] = useState(null);
	const [users, setUsers] = useState([]);
	const [winOpenAt, setWinOpenAt] = useState(() => msToDatetimeLocal(submissionsOpenAt));
	const [winCloseAt, setWinCloseAt] = useState(() => msToDatetimeLocal(submissionsCloseAt));
	const hasWindow = !!(submissionsOpenAt || submissionsCloseAt);

	useEffect(() => { setWinOpenAt(msToDatetimeLocal(submissionsOpenAt)); }, [submissionsOpenAt]);
	useEffect(() => { setWinCloseAt(msToDatetimeLocal(submissionsCloseAt)); }, [submissionsCloseAt]);
	useEffect(() => { setName(conferenceName ?? ''); }, [conferenceName]);

	async function load() {
		const [u, c] = await Promise.all([endpoints.users(), endpoints.getEventCode()]);
		setUsers(u);
		setEventCode(c);
	}
	useEffect(() => { load(); }, []);

	async function saveName() {
		await endpoints.setConferenceName(name);
		await refreshMe();
	}

	async function rotate() {
		const meta = await endpoints.rotateEventCode({ ttl_hours: 24 });
		setEventCode(meta);
		alert(`New facilitator code: ${meta.code}\nExpires ${new Date(meta.expires_at).toLocaleString()}`);
	}

	async function addUser(e) {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const email = form.get('email');
		const role = form.get('role');
		try {
			await endpoints.createUser(email, role);
			e.currentTarget.reset();
			load();
		} catch (err) {
			alert(err.message);
		}
	}

	async function removeUser(id) {
		if (!confirm('Delete this user?')) return;
		await endpoints.deleteUser(id);
		load();
	}

	async function saveSubmissionsWindow() {
		const open_at = datetimeLocalToMs(winOpenAt);
		const close_at = datetimeLocalToMs(winCloseAt);
		try {
			await endpoints.setSubmissionsWindow(open_at, close_at);
			await refreshMe();
		} catch (err) {
			alert(err.message);
		}
	}

	async function clearSubmissionsWindow() {
		await endpoints.setSubmissionsWindow(null, null);
		setWinOpenAt('');
		setWinCloseAt('');
		await refreshMe();
	}

	async function resetVotes() {
		if (!confirm('Reset all votes? This cannot be undone.')) return;
		await endpoints.resetVotes();
		refreshIdeas();
	}

	async function fullReset() {
		if (prompt('Type RESET to wipe ideas, votes, schedule, and attendees (admin users are preserved):') !== 'RESET') return;
		await endpoints.fullReset();
		refreshIdeas();
		refreshSchedule();
		refreshMe();
	}

	return (
		<div className="admin-panel">
			<section>
				<h3>Conference name</h3>
				<div className="row">
					<input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
					<button type="button" onClick={saveName}>Save</button>
				</div>
			</section>

			<section>
				<h3>Facilitator event code</h3>
				{eventCode?.code ? (
					<p>
						Current code: <code className="code-display">{eventCode.code}</code>
						{eventCode.expires_at && (
							<span className="dim"> (expires {new Date(eventCode.expires_at).toLocaleString()})</span>
						)}
					</p>
				) : (
					<p className="dim">No code set — facilitators can't log in until you rotate one.</p>
				)}
				<button type="button" onClick={rotate}>Generate new code</button>
			</section>

			<section>
				<h3>Submission window</h3>
				<p className="dim">Leave a field blank to remove that restriction. All times are your local timezone.</p>
				<div className="window-grid">
					<label>
						Open at
						<input type="datetime-local" value={winOpenAt} onChange={(e) => setWinOpenAt(e.target.value)} />
					</label>
					<label>
						Close at
						<input type="datetime-local" value={winCloseAt} onChange={(e) => setWinCloseAt(e.target.value)} />
					</label>
				</div>
				<div className="row">
					<button type="button" onClick={saveSubmissionsWindow}>Save window</button>
					{hasWindow && (
						<button type="button" className="link-danger" onClick={clearSubmissionsWindow}>Clear (always open)</button>
					)}
				</div>
				{hasWindow ? (
					<p className="dim">
						{[
							submissionsOpenAt && `Opens ${new Date(submissionsOpenAt).toLocaleString()}`,
							submissionsCloseAt && `Closes ${new Date(submissionsCloseAt).toLocaleString()}`,
						].filter(Boolean).join(' · ')}
					</p>
				) : (
					<p className="dim">No window set — submissions always open.</p>
				)}
			</section>

			<section>
				<h3>Admins</h3>
				<form onSubmit={addUser} className="row">
					<input type="email" name="email" placeholder="email@example.com" required />
					<select name="role" defaultValue="admin">
						<option value="admin">admin</option>
						<option value="facilitator">facilitator (legacy)</option>
					</select>
					<button type="submit">Invite</button>
				</form>
				<ul className="user-list">
					{users.map((u) => (
						<li key={u.id}>
							<span>{u.email}</span>
							<span className="role-pill">{u.role}</span>
							<button type="button" className="link-danger" onClick={() => removeUser(u.id)}>Delete</button>
						</li>
					))}
				</ul>
			</section>

			<section className="danger-zone">
				<h3>Danger zone</h3>
				<button type="button" className="danger" onClick={resetVotes}>Reset all votes</button>
				<button type="button" className="danger" onClick={fullReset}>Full reset</button>
			</section>
		</div>
	);
}
