// Thin fetch wrapper. Same-origin so cookies flow automatically.

async function request(path, init = {}) {
	const res = await fetch(path, {
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
		...init,
	});
	const text = await res.text();
	const data = text ? safeParse(text) : null;
	if (!res.ok) {
		const err = new Error((data && data.error) || res.statusText);
		err.status = res.status;
		err.body = data;
		throw err;
	}
	return data;
}

function safeParse(t) {
	try { return JSON.parse(t); } catch { return t; }
}

export const api = {
	get: (path) => request(path),
	post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
	patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
	del: (path) => request(path, { method: 'DELETE' }),
};

export const endpoints = {
	me: () => api.get('/api/auth/me'),
	ideas: () => api.get('/api/ideas'),
	submitIdea: (title, description) => api.post('/api/ideas', { title, description }),
	vote: (id) => api.post(`/api/ideas/${id}/vote`),
	unvote: (id) => api.del(`/api/ideas/${id}/vote`),
	assign: (id, slot_id, room_id) => api.post(`/api/ideas/${id}/assign`, { slot_id, room_id }),
	merge: (primary_id, merge_ids) => api.post('/api/ideas/merge', { primary_id, merge_ids }),
	deleteIdea: (id) => api.del(`/api/ideas/${id}`),

	schedule: () => api.get('/api/schedule'),
	listSlots: () => api.get('/api/schedule/slots'),
	createSlot: (start_time, duration_minutes) => api.post('/api/schedule/slots', { start_time, duration_minutes }),
	deleteSlot: (id) => api.del(`/api/schedule/slots/${id}`),
	listRooms: () => api.get('/api/schedule/rooms'),
	createRoom: (name) => api.post('/api/schedule/rooms', { name }),
	deleteRoom: (id) => api.del(`/api/schedule/rooms/${id}`),

	facilitatorLogin: (code) => api.post('/api/auth/facilitator-code', { code }),
	adminLogin: (email) => api.post('/api/auth/login', { email }),
	verify: (token) => api.get(`/api/auth/verify?token=${encodeURIComponent(token)}`),
	logout: () => api.post('/api/auth/logout'),

	users: () => api.get('/api/admin/users'),
	createUser: (email, role) => api.post('/api/admin/users', { email, role }),
	deleteUser: (id) => api.del(`/api/admin/users/${id}`),
	setConferenceName: (name) => api.post('/api/admin/conference-name', { name }),
	rotateEventCode: (opts = {}) => api.post('/api/admin/rotate-event-code', opts),
	getEventCode: () => api.get('/api/admin/event-code'),
	resetVotes: () => api.post('/api/admin/reset-votes'),
	fullReset: () => api.post('/api/admin/full-reset'),
	getSubmissionsWindow: () => api.get('/api/admin/submissions-window'),
	setSubmissionsWindow: (open_at, close_at) => api.post('/api/admin/submissions-window', { open_at, close_at }),
};
