import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { endpoints } from '../lib/api.js';

export default function Header() {
	const navigate = useNavigate();
	const role = useStore((s) => s.role);
	const user = useStore((s) => s.user);
	const conferenceName = useStore((s) => s.conferenceName);
	const wsStatus = useStore((s) => s.wsStatus);
	const refreshMe = useStore((s) => s.refreshMe);

	async function handleLogout() {
		await endpoints.logout();
		await refreshMe();
		navigate('/');
	}

	const title = conferenceName ? `Open Spaces Live — ${conferenceName}` : 'Open Spaces Live';

	return (
		<header className="app-header">
			<span className="header-title">
				<Link to="/">{title}</Link>
			</span>
			<nav className="auth-section">
				<Link to="https://devopsdays.org/open-space-format/" target="_blank" className="header-link" rel="noopener noreferrer">About Open Spaces</Link>
				<Link to="/schedule" className="header-link">Schedule</Link>
				<Link to="/projector" className="header-link">Projector</Link>
				{(role === 'facilitator' || role === 'admin') && (
					<Link to="/dashboard" className="header-link">Dashboard</Link>
				)}
				{role === 'attendee' ? (
					<>
						<Link to="/login-code" className="header-link">Facilitator</Link>
						<Link to="/admin-login" className="header-link">Admin</Link>
					</>
				) : (
					<>
						<span className="role-pill">{user?.email || role}</span>
						<button type="button" onClick={handleLogout}>Logout</button>
					</>
				)}
				<span className={`ws-dot ws-${wsStatus}`} title={`live: ${wsStatus}`} />
			</nav>
		</header>
	);
}
