import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { sendEmailWithMailgun } from './email.js';

const app = new Hono();
const api = new Hono();

// Middleware to make bindings available
api.use('*', async (c, next) => {
	c.set('db', c.env.DB);
	c.set('kv', c.env.KV);
	c.set('env', c.env); // Make the whole env available for the email function
	await next();
});

// Auth middleware to check for a valid session
api.use('*', async (c, next) => {
	const sessionId = getCookie(c, 'session_id');
	if (sessionId) {
		const session = await c.env.KV.get(`session:${sessionId}`, 'json');
		if (session) {
			c.set('user', session);
		}
	}
	await next();
});

// Middleware to protect routes for facilitators/admins
const requireFacilitator = async (c, next) => {
	const user = c.get('user');
	if (user && (user.role === 'facilitator' || user.role === 'admin')) {
		await next();
	} else {
		return c.json({ error: 'Unauthorized' }, 403);
	}
};

// Middleware to protect routes for admins only
const requireAdmin = async (c, next) => {
	const user = c.get('user');
	if (user && user.role === 'admin') {
		await next();
	} else {
		return c.json({ error: 'Forbidden' }, 403);
	}
};


// Remove in-memory stores
// const tokenStore = new Map();
// const sessionStore = new Map();

api.post('/auth/login', async (c) => {
	const db = c.get('db');
	const env = c.get('env');
	const { email } = await c.req.json();
	if (!email) {
		return c.json({ error: 'Email is required' }, 400);
	}

	let user;
	try {
		user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
	} catch (e) {
		console.error('Failed to query for user:', e);
		return c.json({ error: 'Database error' }, 500);
	}

	if (!user) {
		// To prevent user enumeration, we return a generic success message
		// even if the user does not exist.
		console.log(`Login attempt for non-existent user: ${email}`);
		return c.json({ success: true, message: 'If an account exists for this email, a magic link has been sent.' });
	}

	const role = user.role; // Get role from the database
	if (!role) {
		return c.json({ error: 'Access denied' }, 403);
	}

	const token = crypto.randomUUID();
	const magicLink = `${new URL(c.req.url).origin}/verify-login?token=${token}`;

	// TEMPORARY: Log the magic link for testing.
	console.log(`Magic Link for ${email}: ${magicLink}`);

	await c.env.KV.put(`token:${token}`, JSON.stringify({ email, role }), {
		expirationTtl: 900, // 15 minutes
	});

	// --- Send email instead of returning link ---
	const emailResult = await sendEmailWithMailgun(env, {
		to: email,
		subject: 'Your Open Spaces Login Link',
		text: `Click the link to log in: ${magicLink}`,
		html: `<p>Click the link below to log in to Open Spaces Live.</p><p><a href="${magicLink}">${magicLink}</a></p><p>This link will expire in 15 minutes.</p>`,
	});

	if (!emailResult.success) {
		console.error("Failed to send magic link email:", emailResult.error);
		// Do not expose email sending failure to the client for security.
	}

	return c.json({ success: true, message: 'If an account exists for this email, a magic link has been sent.' });
});

api.get('/auth/verify', async (c) => {
	const kv = c.get('kv');
	const { token } = c.req.query();

	if (!token) {
		return c.json({ error: 'Token is required' }, 400);
	}

	const tokenData = await kv.get(`token:${token}`, 'json');

	if (!tokenData) {
		return c.json({ error: 'Invalid or expired token' }, 400);
	}

	await kv.delete(`token:${token}`);

	const sessionId = crypto.randomUUID();
	await kv.put(`session:${sessionId}`, JSON.stringify({ email: tokenData.email, role: tokenData.role }), {
		expirationTtl: 86400, // 24 hours
	});

	setCookie(c, 'session_id', sessionId, {
		httpOnly: true,
		secure: true, // Secure cookie for production
		sameSite: 'Lax',
		path: '/',
		maxAge: 86400, // 24 hours
	});

	return c.json({ success: true });
});

api.get('/auth/me', async (c) => {
	const user = c.get('user');
	return c.json({ user });
});

api.post('/auth/logout', async (c) => {
	const kv = c.get('kv');
	const sessionId = getCookie(c, 'session_id');
	if (sessionId) {
		await kv.delete(`session:${sessionId}`);
	}
	setCookie(c, 'session_id', '', { expires: new Date(0), path: '/' });
	return c.json({ success: true });
});

// Slot management endpoints (protected for facilitators/admins)
api.get('/slots', requireFacilitator, async (c) => {
	const db = c.get('db');
	const { results } = await db.prepare(
		'SELECT slots.*, rooms.name as roomName FROM slots LEFT JOIN rooms ON slots.roomId = rooms.id ORDER BY slots.start_time, rooms.name'
	).all();
	return c.json(results);
});

api.post('/slots', requireFacilitator, async (c) => {
	const db = c.get('db');
	const { start_time, duration_minutes, roomId } = await c.req.json();
	if (!start_time || !duration_minutes || !roomId) {
		return c.json({ error: 'Start time, duration, and room are required' }, 400);
	}

	const id = `slot_${crypto.randomUUID()}`;
	const now = Date.now();

	await db
		.prepare('INSERT INTO slots (id, start_time, duration_minutes, created_at, roomId) VALUES (?, ?, ?, ?, ?)')
		.bind(id, start_time, duration_minutes, now, roomId)
		.run();

	return c.json({ id, start_time, duration_minutes, roomId }, 201);
});

api.delete('/slots/:id', requireFacilitator, async (c) => {
	const db = c.get('db');
	const { id } = c.req.param();
	await db.prepare('DELETE FROM slots WHERE id = ?').bind(id).run();
	return c.json({ success: true });
});

api.patch('/slots/:id', requireFacilitator, async (c) => {
	const db = c.get('db');
	const { id } = c.req.param();
	const { roomId } = await c.req.json();

	if (!roomId) {
		return c.json({ error: 'Room ID is required' }, 400);
	}

	await db.prepare('UPDATE slots SET roomId = ? WHERE id = ?')
		.bind(roomId, id)
		.run();

	return c.json({ success: true });
});

// Room management endpoints (protected for facilitators/admins)
api.get('/rooms', requireFacilitator, async (c) => {
    const db = c.get('db');
    const { results } = await db.prepare('SELECT * FROM rooms ORDER BY name').all();
    return c.json(results);
});

api.post('/rooms', requireFacilitator, async (c) => {
    const db = c.get('db');
    const { name } = await c.req.json();

    if (!name) {
        return c.json({ error: 'Room name is required' }, 400);
    }

    const id = `room_${crypto.randomUUID()}`;
    const now = Date.now();
    await db.prepare('INSERT INTO rooms (id, name, created_at) VALUES (?, ?, ?)')
        .bind(id, name, now)
        .run();

    return c.json({ id, name }, 201);
});

api.delete('/rooms/:id', requireFacilitator, async (c) => {
    const db = c.get('db');
    const { id } = c.req.param();

    const existingSlots = await db.prepare('SELECT id FROM slots WHERE roomId = ?').bind(id).all();
    if (existingSlots.results.length > 0) {
        return c.json({ error: 'Cannot delete a room that has time slots assigned to it.' }, 409);
    }

    await db.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Admin endpoints
api.get('/admin/users', requireAdmin, async (c) => {
	const db = c.get('db');
	try {
		const { results } = await db.prepare('SELECT id, email, role FROM users ORDER BY email').all();
		return c.json(results);
	} catch (e) {
		console.error('Failed to fetch users:', e);
		return c.json({ error: 'Database error while fetching users' }, 500);
	}
});

api.post('/admin/users', requireAdmin, async (c) => {
	const db = c.get('db');
	const env = c.get('env');
	const { email, role } = await c.req.json();

	if (!email || !role) {
		return c.json({ error: 'Email and role are required' }, 400);
	}

	if (role !== 'admin' && role !== 'facilitator') {
		return c.json({ error: 'Invalid role specified' }, 400);
	}

	try {
		// Check if user already exists
		const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
		if (existingUser) {
			return c.json({ error: 'User with this email already exists' }, 409);
		}

		const id = `usr_${crypto.randomUUID()}`;
		await db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').bind(id, email, role).run();

		// --- Send invitation email ---
		const token = crypto.randomUUID();
		const magicLink = `${new URL(c.req.url).origin}/verify-login?token=${token}`;

		// TEMPORARY: Log the magic link for testing.
		console.log(`Invite Link for ${email}: ${magicLink}`);

		await c.env.KV.put(`token:${token}`, JSON.stringify({ email, role }), {
			expirationTtl: 86400 * 7, // Invitation link valid for 7 days
		});

		const inviter = c.get('user');

		const emailResult = await sendEmailWithMailgun(env, {
			to: email,
			subject: 'You have been invited to Open Spaces Live!',
			text: `You have been invited to join Open Spaces Live as a ${role}. Click the link to log in: ${magicLink}`,
			html: `<p>You have been invited by ${inviter.email} to join Open Spaces Live as a <strong>${role}</strong>.</p><p>Click the link below to log in and get started:</p><p><a href="${magicLink}">${magicLink}</a></p><p>This invitation link is valid for 7 days.</p>`,
		});

		if (!emailResult.success) {
			console.error("Failed to send invitation email:", emailResult.error);
			// Let the admin know the email failed so they can take action.
			return c.json({ error: `User created, but failed to send invitation email. Please ask the user to try the login page. Error: ${emailResult.error}` }, 500);
		}


		return c.json({ success: true, message: `User ${email} created with role ${role} and an invitation has been sent.` }, 201);
	} catch (e) {
		console.error('Failed to create user:', e);
		return c.json({ error: 'Database error while creating user' }, 500);
	}
});

api.delete('/admin/users/:id', requireAdmin, async (c) => {
	const db = c.get('db');
	const { id } = c.req.param();
	const currentUser = c.get('user');

	if (id === currentUser.id) {
		return c.json({ error: 'You cannot delete your own account.' }, 400);
	}

	try {
		const { success } = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
		if (success) {
			return c.json({ success: true, message: 'User deleted successfully.' });
		} else {
			return c.json({ error: 'User not found or could not be deleted.' }, 404);
		}
	} catch (e) {
		console.error('Failed to delete user:', e);
		return c.json({ error: 'Database error while deleting user.' }, 500);
	}
});

// Idea management endpoints (public)
api.get('/ideas', async (c) => {
	const kv = c.get('kv');
	// Only list keys with the 'idea:' prefix
	const { keys } = await kv.list({ prefix: 'idea:' });
	const ideas = await Promise.all(keys.map(({ name }) => kv.get(name, 'json')));
	return c.json(ideas);
});

api.post('/ideas', async (c) => {
	const kv = c.get('kv');
	const { title, description } = await c.req.json();
	const user = c.get('user'); // We'll add user auth to this later

	if (!title || !description) {
		return c.json({ error: 'Title and description are required' }, 400);
	}

	const id = crypto.randomUUID();
	const newIdea = {
		id,
		title,
		description,
		author: user?.email || 'anonymous',
		votes: 0,
		voters: [],
		createdAt: new Date().toISOString(),
		status: 'active', // Add a status field
		slotId: null, // To be assigned by facilitator
		roomId: null, // To be assigned by facilitator
	};

	// Add the 'idea:' prefix when storing a new idea
	await kv.put(`idea:${id}`, JSON.stringify(newIdea), { expirationTtl: 86400 }); // 24-hour expiry
	return c.json(newIdea, 201);
});

api.post('/ideas/:id/vote', async (c) => {
	const kv = c.get('kv');
	const { id } = c.req.param();
	const user = c.get('user'); // We'll add user auth to this later
	const voterId = user?.email || c.req.header('X-Forwarded-For') || 'anonymous'; // Use email or IP as a temporary identifier

	// Use the 'idea:' prefix to get the correct item
	const idea = await kv.get(`idea:${id}`, 'json');
	if (!idea) {
		return c.json({ error: 'Idea not found' }, 404);
	}

	if (idea.voters.includes(voterId)) {
		// Allow un-voting
		idea.votes--;
		idea.voters = idea.voters.filter((v) => v !== voterId);
	} else {
		idea.votes++;
		idea.voters.push(voterId);
	}

	// Use the 'idea:' prefix when updating the item
	await kv.put(`idea:${id}`, JSON.stringify(idea), { expirationTtl: 86400 });
	return c.json(idea);
});

api.delete('/ideas/:id', requireFacilitator, async (c) => {
    const kv = c.get('kv');
    const { id } = c.req.param();

    // Ensure the key exists before deleting
    const idea = await kv.get(`idea:${id}`);
    if (!idea) {
        return c.json({ error: 'Idea not found' }, 404);
    }

    await kv.delete(`idea:${id}`);
    return c.json({ success: true, message: 'Idea deleted' });
});

api.post('/ideas/merge', requireFacilitator, async (c) => {
    const kv = c.get('kv');
    const { ideaIds, newTitle, newDescription } = await c.req.json();
    const user = c.get('user');

    if (!ideaIds || ideaIds.length < 2 || !newTitle || !newDescription) {
        return c.json({ error: 'Requires at least two idea IDs and a new title/description' }, 400);
    }

    let totalVotes = 0;
    const allVoters = new Set();
    const originalIdeas = [];

    for (const ideaId of ideaIds) {
        const idea = await kv.get(`idea:${ideaId}`, 'json');
        if (idea) {
            totalVotes += idea.votes;
            idea.voters.forEach(voter => allVoters.add(voter));
            originalIdeas.push(idea);
        }
    }

    if (originalIdeas.length !== ideaIds.length) {
        return c.json({ error: 'One or more ideas not found' }, 404);
    }

    // Create the new merged idea
    const mergedIdeaId = crypto.randomUUID();
    const mergedIdea = {
        id: mergedIdeaId,
        title: newTitle,
        description: newDescription,
        author: user?.email || 'facilitator',
        votes: allVoters.size, // Votes are unique voters
        voters: [...allVoters],
        createdAt: new Date().toISOString(),
        status: 'active',
        mergedFrom: ideaIds, // Keep track of original ideas
    };
    await kv.put(`idea:${mergedIdeaId}`, JSON.stringify(mergedIdea), { expirationTtl: 86400 });

    // Mark original ideas as merged
    for (const idea of originalIdeas) {
        idea.status = 'merged';
        idea.mergedInto = mergedIdeaId;
        await kv.put(`idea:${idea.id}`, JSON.stringify(idea), { expirationTtl: 86400 });
    }

    return c.json({ success: true, mergedIdea });
});

api.post('/ideas/:id/assign', requireFacilitator, async (c) => {
    const kv = c.get('kv');
    const { id } = c.req.param();
    const { slotId, roomId } = await c.req.json();

    if (!slotId || !roomId) {
        return c.json({ error: 'Slot ID and Room ID are required' }, 400);
    }

    const idea = await kv.get(`idea:${id}`, 'json');
    if (!idea) {
        return c.json({ error: 'Idea not found' }, 404);
    }

    idea.slotId = slotId;
    idea.roomId = roomId;

    await kv.put(`idea:${id}`, JSON.stringify(idea), { expirationTtl: 86400 });

    return c.json({ success: true, idea });
});

// Public endpoint to fetch the final schedule
api.get('/schedule', async (c) => {
	const kv = c.get('kv');
	const db = c.get('db');

	try {
		const [slotsRes, roomsRes, ideasRes] = await Promise.all([
			db.prepare('SELECT slots.*, rooms.name as roomName FROM slots JOIN rooms ON slots.roomId = rooms.id ORDER BY slots.start_time, rooms.name').all(),
			db.prepare('SELECT * FROM rooms ORDER BY name').all(),
			kv.list({ prefix: 'idea:' })
		]);

		const slots = slotsRes.results;
		const rooms = roomsRes.results;
		const ideaKeys = ideasRes.keys;

		const ideaPromises = ideaKeys.map(({ name }) => kv.get(name, 'json'));
		const allIdeas = await Promise.all(ideaPromises);

		const roomsMap = new Map(rooms.map(room => [room.id, room]));

		const schedule = slots.map(slot => ({
			...slot,
			sessions: []
		}));

		const slotsMap = new Map(schedule.map(slot => [slot.id, slot]));

		allIdeas
			.filter(idea => idea && idea.status === 'active' && idea.slotId && idea.roomId)
			.forEach(idea => {
				const slot = slotsMap.get(idea.slotId);
				if (slot) {
					slot.sessions.push({
						...idea,
						roomName: roomsMap.get(idea.roomId)?.name
					});
				}
			});

		return c.json(schedule);

	} catch (error) {
		console.error('Failed to build schedule:', error);
		return c.json({ error: 'Failed to retrieve schedule data.' }, 500);
	}
});


app.route('/api', api);

export default app;