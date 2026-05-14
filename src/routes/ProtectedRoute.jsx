import { Navigate } from 'react-router-dom';
import { useStore } from '../lib/store.js';

export default function ProtectedRoute({ allow, children }) {
	const role = useStore((s) => s.role);
	const ready = useStore((s) => s.ready);
	if (!ready) return <p className="loading">Loading…</p>;
	if (!allow.includes(role)) return <Navigate to="/login-code" replace />;
	return children;
}
