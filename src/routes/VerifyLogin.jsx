import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endpoints } from '../lib/api.js';
import { useStore } from '../lib/store.js';

export default function VerifyLogin() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const refreshMe = useStore((s) => s.refreshMe);
	const [status, setStatus] = useState('working');

	useEffect(() => {
		const token = params.get('token');
		if (!token) {
			setStatus('failed');
			return;
		}
		(async () => {
			try {
				await endpoints.verify(token);
				await refreshMe();
				setStatus('ok');
				navigate('/dashboard');
			} catch (err) {
				console.error(err);
				setStatus('failed');
			}
		})();
	}, [params, refreshMe, navigate]);

	if (status === 'failed') return <p>Login link is invalid or expired. <a href="/admin-login">Try again</a>.</p>;
	if (status === 'ok') return <p>Logged in. Redirecting…</p>;
	return <p>Verifying…</p>;
}
