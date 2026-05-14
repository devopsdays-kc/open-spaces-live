import { Hono } from 'hono';

const app = new Hono();

app.get('/me', (c) => {
	return c.json({
		attendee_id: c.get('attendeeId'),
		role: c.get('role') || 'attendee',
	});
});

export default app;
