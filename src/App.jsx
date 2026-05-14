import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Marketplace from './routes/Marketplace.jsx';
import Schedule from './routes/Schedule.jsx';
import Projection from './routes/Projection.jsx';
import Dashboard from './routes/Dashboard.jsx';
import LoginCode from './routes/LoginCode.jsx';
import AdminLogin from './routes/AdminLogin.jsx';
import VerifyLogin from './routes/VerifyLogin.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import { useStore } from './lib/store.js';
import './App.css';

export default function App() {
	const ready = useStore((s) => s.ready);
	const bootstrap = useStore((s) => s.bootstrap);
	const connectLive = useStore((s) => s.connectLive);

	useEffect(() => {
		bootstrap().catch((err) => console.error('bootstrap failed', err));
	}, [bootstrap]);

	useEffect(() => {
		if (!ready) return undefined;
		return connectLive();
	}, [ready, connectLive]);

	const isProjection = typeof window !== 'undefined' && window.location.pathname.startsWith('/projector');

	return (
		<div className={`app-container ${isProjection ? 'projection-mode' : ''}`}>
			{!isProjection && <Header />}
			<main className="app-main">
				{!ready ? (
					<p className="loading">Loading…</p>
				) : (
					<Routes>
						<Route path="/" element={<Marketplace />} />
						<Route path="/schedule" element={<Schedule />} />
						<Route path="/projector" element={<Projection />} />
						<Route path="/login-code" element={<LoginCode />} />
						<Route path="/admin-login" element={<AdminLogin />} />
						<Route path="/verify-login" element={<VerifyLogin />} />
						<Route
							path="/dashboard"
							element={
								<ProtectedRoute allow={['facilitator', 'admin']}>
									<Dashboard />
								</ProtectedRoute>
							}
						/>
						<Route path="*" element={<p>Not found.</p>} />
					</Routes>
				)}
			</main>
		</div>
	);
}
