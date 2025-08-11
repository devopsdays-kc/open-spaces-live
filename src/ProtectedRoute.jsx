import React from 'react';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ user, allowedRoles, children }) {
	if (!user) {
		// If user is not logged in, redirect to home page
		return <Navigate to="/" replace />;
	}

	if (!allowedRoles.includes(user.role)) {
		// If user role is not allowed, redirect to home page
		return <Navigate to="/" replace />;
	}

	return children;
}

export default ProtectedRoute;
