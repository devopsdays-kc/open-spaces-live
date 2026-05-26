import { useState } from 'react';
import { endpoints } from '../lib/api.js';

export default function AdminLogin() {
	const [email, setEmail] = useState('');
	const [message, setMessage] = useState('');

	async function submit(e) {
		e.preventDefault();
		try {
			const res = await endpoints.adminLogin(email);
			setMessage(res.message || 'Check your inbox.');
			setEmail('');
		} catch (err) {
			setMessage(err.message);
		}
	}

	return (
		<div className="auth-card">
			<h2>Admin login</h2>
			<p>We'll email a magic link if this address is registered as an admin.</p>
			<form onSubmit={submit}>
				<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
				<button type="submit">Send link</button>
			</form>
			{message && <p className="message">{message}</p>}
		</div>
	);
}
