// HMAC-signed cookie helpers for attendee + facilitator sessions.
// Cookie format: <payload>.<base64url-hmac-sha256(payload)>.

const enc = new TextEncoder();

// CryptoKey is cached per isolate — importKey is called once on the first warm request.
const _keyCache = new Map();
async function getKey(secret) {
	if (!_keyCache.has(secret)) {
		const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
		_keyCache.set(secret, k);
	}
	return _keyCache.get(secret);
}

function base64urlEncode(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, payload) {
	const key = await getKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
	return base64urlEncode(new Uint8Array(sig));
}

export async function sign(secret, payload) {
	const sig = await hmac(secret, payload);
	return `${payload}.${sig}`;
}

export async function verify(secret, signedValue) {
	if (!signedValue || typeof signedValue !== 'string') return null;
	const dot = signedValue.lastIndexOf('.');
	if (dot <= 0) return null;
	const payload = signedValue.slice(0, dot);
	const sig = signedValue.slice(dot + 1);
	const expected = await hmac(secret, payload);
	if (sig.length !== expected.length) return null;
	let diff = 0;
	for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
	return diff === 0 ? payload : null;
}

export async function hashIp(ip, salt) {
	if (!ip) return null;
	const data = enc.encode(`${ip}:${salt}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64urlEncode(new Uint8Array(digest));
}
