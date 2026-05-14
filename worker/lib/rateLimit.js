export async function rateLimit(kv, action, key, limits) {
	const now = Math.floor(Date.now() / 1000);
	const entries = limits.map(({ window, max }) => {
		const bucket = Math.floor(now / window);
		return { k: `rl:${action}:${key}:${window}:${bucket}`, window, max, bucket };
	});

	// Read all buckets in parallel first, then decide, then write.
	// Two-pass avoids incrementing early windows when a later window blocks.
	const counts = await Promise.all(entries.map(({ k }) => kv.get(k).then((v) => parseInt(v || '0', 10))));

	for (let i = 0; i < entries.length; i++) {
		if (counts[i] >= entries[i].max) {
			const { bucket, window } = entries[i];
			return { allowed: false, retryAfter: (bucket + 1) * window - now };
		}
	}

	await Promise.all(
		entries.map(({ k, window }, i) => kv.put(k, String(counts[i] + 1), { expirationTtl: window + 5 })),
	);
	return { allowed: true };
}
