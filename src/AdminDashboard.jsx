import { useState, useEffect, useCallback } from 'react';

function AdminDashboard({ conferenceName, onConferenceNameUpdate }) {
	const [users, setUsers] = useState([]);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState('facilitator');
	const [message, setMessage] = useState('');
	const [confName, setConfName] = useState(conferenceName || '');

	const handleNameSubmit = async (e) => {
		e.preventDefault();
		setMessage('');
		try {
			const response = await fetch('/api/admin/conference-name', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: confName }),
			});
			const data = await response.json();
			if (response.ok) {
				setMessage('Conference name updated successfully!');
				onConferenceNameUpdate(data.name);
			} else {
				throw new Error(data.error || 'Failed to update conference name.');
			}
		} catch (error) {
			setMessage(error.message);
		}
	};

	const handleResetVotes = async () => {
		if (window.confirm('Are you sure you want to reset all votes for unscheduled ideas? This action cannot be undone.')) {
			try {
				const response = await fetch('/api/admin/reset-votes', { method: 'POST' });
				const data = await response.json();
				if (response.ok) {
					setMessage(data.message);
				} else {
					throw new Error(data.error || 'Failed to reset votes.');
				}
			} catch (error) {
				setMessage(error.message);
			}
		}
	};

	const handleFullReset = async () => {
		const confirmation = prompt('This is a highly destructive action. To confirm, please type "RESET" in the box below.');
		if (confirmation === 'RESET') {
			try {
				const response = await fetch('/api/admin/full-reset', { method: 'POST' });
				const data = await response.json();
				if (response.ok) {
					setMessage(data.message);
					// Optionally, trigger a full page reload or state refresh
					window.location.reload();
				} else {
					throw new Error(data.error || 'Failed to perform full reset.');
				}
			} catch (error) {
				setMessage(error.message);
			}
		} else if (confirmation !== null) {
			alert('The confirmation text did not match. Action cancelled.');
		}
	};

	const fetchUsers = useCallback(async () => {
		try {
			const response = await fetch('/api/admin/users');
			if (response.ok) {
				const data = await response.json();
				setUsers(data);
			} else {
				throw new Error('Failed to fetch users.');
			}
		} catch (error) {
			setMessage(error.message);
		}
	}, []);

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	const handleInviteSubmit = async (e) => {
		e.preventDefault();
		setMessage('');
		try {
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
			});
			const data = await response.json();
			if (response.ok) {
				setMessage(data.message);
				setInviteEmail('');
				fetchUsers(); // Refresh the user list
			} else {
				throw new Error(data.error || 'Failed to send invitation.');
			}
		} catch (error) {
			setMessage(error.message);
		}
	};

	const handleDeleteUser = async (userId) => {
		if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
			try {
				const response = await fetch(`/api/admin/users/${userId}`, {
					method: 'DELETE',
				});
				const data = await response.json();
				if (response.ok) {
					setMessage(data.message);
					fetchUsers(); // Refresh the user list
				} else {
					throw new Error(data.error || 'Failed to delete user.');
				}
			} catch (error) {
				setMessage(error.message);
			}
		}
	};

	return (
		<div className="card admin-manager">
			<h3>Admin Controls</h3>

			<div className="admin-section">
				<h4>Conference Settings</h4>
				<form onSubmit={handleNameSubmit} className="conference-form">
					<div className="form-field">
						<label htmlFor="conference_name">Conference Name</label>
						<input
							id="conference_name"
							type="text"
							value={confName}
							onChange={(e) => setConfName(e.target.value)}
							placeholder="e.g., DevOpsDays Boston"
						/>
					</div>
					<button type="submit">Save Name</button>
				</form>
			</div>

			<div className="admin-section">
				<h4>Invite New User</h4>
				<form onSubmit={handleInviteSubmit} className="invite-form">
					<div className="form-field">
						<label htmlFor="invite_email">User Email</label>
						<input
							id="invite_email"
							type="email"
							value={inviteEmail}
							onChange={(e) => setInviteEmail(e.target.value)}
							placeholder="user@example.com"
							required
						/>
					</div>
					<div className="form-field">
						<label htmlFor="invite_role">Role</label>
						<select id="invite_role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
							<option value="facilitator">Facilitator</option>
							<option value="admin">Admin</option>
						</select>
					</div>
					<button type="submit">Send Invitation</button>
				</form>
				{message && <p className={message.includes('Failed') || message.includes('exist') || message.includes('Error') ? 'error-message' : 'message'}>{message}</p>}
			</div>
			<div className="admin-section">
				<h4>Current Users</h4>
				<ul className="user-list">
					{users.map((user) => (
						<li key={user.id}>
							<span>{user.email}</span>
							<span className="user-role">{user.role}</span>
							<button type="button" onClick={() => handleDeleteUser(user.id)} className="delete-button">Delete</button>
						</li>
					))}
				</ul>
			</div>
			<div className="admin-section danger-zone">
				<h4>Danger Zone</h4>
				<p>These actions are irreversible. Please proceed with caution.</p>
				<div className="danger-buttons">
					<button type="button" onClick={handleResetVotes} className="delete-button">Reset All Votes</button>
					<button type="button" onClick={handleFullReset} className="delete-button">Full Application Reset</button>
				</div>
			</div>
		</div>
	);
}

export default AdminDashboard;
