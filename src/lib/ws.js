// WebSocket client with exponential-backoff reconnect.
// On every (re)connect, the consumer should re-fetch REST state to fill any
// gap between the previous disconnect and the new connection.

const MIN_DELAY = 1000;
const MAX_DELAY = 30000;

export function connectWs(onEvent, onStatus) {
	let ws = null;
	let delay = MIN_DELAY;
	let pingTimer = null;
	let stopped = false;

	function setStatus(status) {
		try { onStatus?.(status); } catch (err) { console.error('onStatus', err); }
	}

	function open() {
		if (stopped) return;
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
		setStatus('connecting');

		ws.addEventListener('open', () => {
			delay = MIN_DELAY;
			setStatus('open');
			pingTimer = setInterval(() => {
				try { ws.send('ping'); } catch { /* dead */ }
			}, 30000);
		});

		ws.addEventListener('message', (ev) => {
			let msg;
			try { msg = JSON.parse(ev.data); } catch { return; }
			if (msg && msg.type) onEvent(msg);
		});

		ws.addEventListener('close', () => {
			if (pingTimer) clearInterval(pingTimer);
			pingTimer = null;
			if (stopped) return;
			setStatus('closed');
			setTimeout(open, delay);
			delay = Math.min(delay * 2, MAX_DELAY);
		});

		ws.addEventListener('error', () => {
			try { ws.close(); } catch { /* ignore */ }
		});
	}

	open();

	return () => {
		stopped = true;
		if (pingTimer) clearInterval(pingTimer);
		try { ws?.close(); } catch { /* ignore */ }
	};
}
