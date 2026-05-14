import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../lib/api.js';
import { useStore } from '../lib/store.js';

export default function LoginCode() {
	const navigate = useNavigate();
	const refreshMe = useStore((s) => s.refreshMe);
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setError('');
		setBusy(true);
		try {
			await endpoints.facilitatorLogin(code.trim());
			await refreshMe();
			navigate('/dashboard');
		} catch (err) {
			setError(err.message || 'Invalid code');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="auth-card">
			<h2>Facilitator login</h2>
			<p>Enter the event code printed on your facilitator card.</p>
			<form onSubmit={submit}>
				<input
					type="text"
					value={code}
					onChange={(e) => setCode(e.target.value.toUpperCase())}
					placeholder="ABCD-EFGH"
					autoFocus
					required
				/>
				<button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
			</form>
			{error && <p className="message error">{error}</p>}
		</div>
	);
}
