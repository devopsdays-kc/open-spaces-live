import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

let hasVerified = false;

function VerifyLogin({ onLoginSuccess }) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	useEffect(() => {
		if (hasVerified) {
			return;
		}
		hasVerified = true;

		const verifyToken = async () => {
			const token = searchParams.get('token');
			if (!token) {
				navigate('/');
				return;
			}

			try {
				const response = await fetch(`/api/auth/verify?token=${token}`);
				if (response.ok) {
					await onLoginSuccess();
					navigate('/');
				} else {
					console.error('Failed to verify token on initial attempt.');
					navigate('/login-failed');
				}
			} catch (error) {
				console.error('Error during token verification:', error);
				navigate('/login-failed');
			}
		};

		verifyToken();

		return () => {
			// Reset on cleanup if needed for specific SPA flows,
			// but for this one-shot login, we leave it true.
		};
	}, [searchParams, navigate, onLoginSuccess]);

	return <div>Verifying your login...</div>;
}

export default VerifyLogin;
