// Worker -> Durable Object broadcast helper.
//
// All mutation routes call broadcast(env, {type, ...payload}). The DO fans out
// to every connected WebSocket. Failure to broadcast is non-fatal: the REST
// response is still authoritative and clients can reconnect for state.

export async function broadcast(env, event) {
	if (!env.EVENT_ROOM) return;
	try {
		const id = env.EVENT_ROOM.idFromName('main');
		const stub = env.EVENT_ROOM.get(id);
		await stub.fetch('https://do/broadcast', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(event),
		});
	} catch (err) {
		console.error('broadcast failed', err);
	}
}
