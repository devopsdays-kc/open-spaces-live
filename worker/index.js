import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { attendee, session } from './middleware.js';
import attendees from './routes/attendees.js';
import ideas from './routes/ideas.js';
import schedule from './routes/schedule.js';
import auth from './routes/auth.js';
import admin from './routes/admin.js';
import { handleWsUpgrade } from './routes/ws.js';

export { EventRoom } from './durable-objects/EventRoom.js';

const app = new Hono();
const api = new Hono();

api.use('*', secureHeaders({
	xFrameOptions: 'DENY',
	contentSecurityPolicy: { defaultSrc: ["'none'"] },
	permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
}));

api.use('*', session());
api.use('*', attendee());

api.route('/attendees', attendees);
api.route('/ideas', ideas);
api.route('/schedule', schedule);
api.route('/auth', auth);
api.route('/admin', admin);

api.get('/ws', handleWsUpgrade);

api.notFound((c) => c.json({ error: 'not found' }, 404));
api.onError((err, c) => {
	console.error('api error', err);
	return c.json({ error: 'internal error' }, 500);
});

app.route('/api', api);

export default app;
