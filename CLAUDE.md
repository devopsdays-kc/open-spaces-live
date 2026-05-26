# Open Spaces Live — Claude Code Guide

## Project overview

Open Spaces Live is a real-time web app that digitizes the physical sticky-note board used at DevOpsDays "Open Spaces" unconference sessions. Attendees submit and vote on session ideas; facilitators schedule them into a grid; a Durable Object fans out live updates over WebSocket. See `docs/ARCHITECTURE.md` for full design details.

## Commands

```bash
npm run dev                   # Vite dev server + worker via @cloudflare/vite-plugin
npm run build                 # Production build
npm run deploy                # wrangler deploy to Cloudflare
npm run db:migrate:local      # Apply D1 migrations locally
npm run db:migrate:remote     # Apply D1 migrations to production
npm run db:seed-admin         # Create initial admin user (scripts/seed-admin.js)
npm test                      # vitest run — all __tests__/**/*.test.js
npm run lint                  # ESLint v9 flat config, 0 warnings allowed
```

## Architecture overview

- **Backend**: Cloudflare Worker (Hono v4), D1 (SQLite), KV, Durable Object (`EventRoom`)
- **Frontend**: React 19, React Router v7, Zustand v5, dnd-kit v6
- **Tooling**: Vite v8, Vitest v4, ESLint v9 flat config, Wrangler v4
- Entry points: `worker/index.js` (Hono app + DO export), `src/main.jsx` (React)
- Full design: `docs/ARCHITECTURE.md` | Deployment: `docs/DEPLOYMENT.md`

### Key invariants — never violate these

1. **D1 is the source of truth.** Never write business state to the Durable Object.
2. **Broadcast is non-fatal.** `broadcast()` in `worker/lib/broadcast.js` wraps the DO fetch in try/catch; the REST response succeeds even if the WS push fails.
3. **Attendee cookie chain.** Every authenticated route must run through `attendee()` middleware. A missing or tampered cookie creates a new attendee row automatically — never skip this middleware.
4. **Atomic votes.** Vote insert = `INSERT OR IGNORE INTO votes` + `UPDATE ideas SET vote_count = vote_count + 1`. Never do a read-modify-write cycle.
5. **Cell uniqueness.** A unique index on `ideas(slot_id, room_id)` enforces no double-booking. The assign route catches `UNIQUE` errors and returns 409.
6. **HMAC cookie format.** Cookie value is `payload.base64url-sig`. `verify()` returns `null` on tamper — treat null as "no cookie".
7. **DO hibernation.** `EventRoom` uses `this.state.acceptWebSocket()` (hibernatable pattern), NOT `new WebSocket()`. This keeps free-tier costs near zero — do not break it.
8. **ESLint flat config.** `eslint.config.js` uses ESLint v9 flat config. Use `reactHooks.configs.flat['recommended']` — NOT `recommended-latest` (that pulls in React Compiler rules not applicable here).
9. **No TypeScript.** Pure JavaScript with JSDoc where needed. Do not introduce `.ts`/`.tsx` files.
10. **Rate limiting via KV.** Key shape: `rl:{action}:{key}:{window}:{bucket}`. Limits: vote 30/min + 200/hr per attendee; submit 5/10min + 15/hr per attendee; facilitator code 5/min + 30/hr per IP; ws-upgrade 20/min per IP. IP-based limits for vote/submit belong in Cloudflare WAF (not KV) — KV free tier is 1k writes/day and each vote already costs 2 KV writes.

## Testing

- Test runner: `vitest run` (environment: `node`)
- Test files: `**/__tests__/**/*.test.js`
- Web Crypto is available as `globalThis.crypto` in Node 20+
- Write tests for `worker/lib/` functions and route business logic via `app.request()`

**Fake D1** (plain object):

```js
const db = {
  prepare: (sql) => ({
    bind: (...args) => ({
      run: async () => ({ success: true }),
      first: async () => null,
      all: async () => ({ results: [] }),
    }),
  }),
  batch: async (stmts) => stmts.map(() => ({ success: true })),
};
```

**Fake KV** (Map-backed):

```js
const kv = {
  store: new Map(),
  async get(k) { return this.store.get(k) ?? null; },
  async put(k, v) { this.store.set(k, v); },
  async delete(k) { this.store.delete(k); },
  async list({ prefix }) {
    const keys = [...this.store.keys()].filter(k => k.startsWith(prefix));
    return { keys: keys.map(name => ({ name })) };
  },
};
```

## ESLint

Config: `eslint.config.js` (ESLint v9 flat config)

- `src/**/*.{js,jsx}`: browser globals, React hooks plugin
- `worker/**/*.js`, `scripts/**/*.js`: node + serviceworker globals
- `react-hooks/set-state-in-effect` is **intentionally off** — do not re-enable it
- `no-unused-vars` for worker: ignores `^_` prefix (args and vars)
- Run `npm run lint` before committing — 0 warnings allowed

## What NOT to do

- Do not add TypeScript or rename `.js`/`.jsx` to `.ts`/`.tsx`
- Do not write business state to the Durable Object — D1 is the source of truth
- Do not skip `attendee()` middleware on any route that touches user data
- Do not do read-modify-write for vote counts — use atomic SQL
- Do not replace `acceptWebSocket()` with `new WebSocket()` in `EventRoom.js`
- Do not add `wrangler.toml` — config lives in `wrangler.jsonc`
- Do not use `reactHooks.configs.flat['recommended-latest']` in eslint.config.js
- Do not `throw` inside `broadcast()` — it must remain fire-and-forget
- Do not add secrets to source — use `wrangler secret put` for `COOKIE_SECRET`, `ATTENDEE_SALT`, `MAILGUN_*`
