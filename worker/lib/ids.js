// Compact URL-safe ID generator. Uses crypto.getRandomValues for entropy.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function nanoid(length = 16) {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = '';
	for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return out;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function eventCode() {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	let out = '';
	for (let i = 0; i < 8; i++) {
		if (i === 4) out += '-';
		out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return out;
}
