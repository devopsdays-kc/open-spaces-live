// EventRoom: pubsub-only Durable Object for live updates.
// State of record stays in D1; this DO only fans out events to connected sockets.

export class EventRoom {
	constructor(state, env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/connect') {
			if (request.headers.get('Upgrade') !== 'websocket') {
				return new Response('expected websocket', { status: 426 });
			}
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);
			this.state.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}

		if (url.pathname === '/broadcast' && request.method === 'POST') {
			const event = await request.json();
			const payload = JSON.stringify(event);
			for (const ws of this.state.getWebSockets()) {
				try {
					ws.send(payload);
				} catch (err) {
					console.error('ws send failed', err);
				}
			}
			return new Response('ok');
		}

		return new Response('not found', { status: 404 });
	}

	webSocketMessage(ws, msg) {
		if (typeof msg === 'string' && msg === 'ping') {
			try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* socket closed */ }
		}
	}

	webSocketClose(ws, code, reason) {
		try { ws.close(code, reason); } catch { /* already closed */ }
	}

	webSocketError(ws, err) {
		console.error('ws error', err);
	}
}
