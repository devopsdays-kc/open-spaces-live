import React, { useState, useEffect, useCallback } from 'react';

function AdminDashboard() {
	const [users, setUsers] = useState([]);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState('facilitator');
	const [message, setMessage] = useState('');

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
			// The API now returns a more detailed message, which we can display directly.
			if (response.ok) {
				setMessage(data.message);
				setInviteEmail('');
				fetchUsers(); // Refresh the user list
			} else {
				// The error from the API will be in data.error
				throw new Error(data.error || 'Failed to send invitation.');
			}
		} catch (error) {
			// Set the error message to be displayed
			setMessage(error.message);
		}
	};

	return (
		<div className="card admin-manager">
			<h3>Admin Controls</h3>
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
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export default AdminDashboard;
