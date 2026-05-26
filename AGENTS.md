# Open Spaces Live — Agent Roles

## Overview

This file defines specialized sub-agent roles for multi-agent Claude Code sessions on this repo — each agent owns a well-scoped slice of the codebase.

---

## Agent: backend-api

**Focus:** `worker/routes/**`, `worker/middleware.js`, `worker/lib/**` (excluding `broadcast.js`), `worker/index.js`

**Responsibilities:**
- Add or modify REST endpoints using Hono v4 route handlers
- Implement or update middleware (`bindings`, `attendee`, `session`, `requireFacilitator`, `requireAdmin`)
- Add rate-limit enforcement via `worker/lib/rateLimit.js`
- Write D1 query helpers in `worker/lib/ideas.js` and inline route queries
- Return correct HTTP status codes (401, 403, 409, 429) per the auth model

**Read before starting:** `worker/index.js`, `worker/middleware.js`, `docs/ARCHITECTURE.md`

**Key constraints:**
- All authenticated routes must run through `attendee()` middleware — never skip it
- Vote mutations must use `INSERT OR IGNORE` + `UPDATE vote_count` atomically — no read-modify-write
- `requireFacilitator` accepts facilitator OR admin role; `requireAdmin` accepts admin only
- Catch D1 `UNIQUE` constraint errors and return 409 (see `worker/routes/ideas.js` assign handler)

---

## Agent: frontend-ui

**Focus:** `src/**` (routes, components, lib, App.jsx, App.css)

**Responsibilities:**
- Build or update React page components in `src/routes/`
- Build or update shared UI components in `src/components/` (IdeaCard, Header, VoteButton, GridCell, etc.)
- Manage Zustand store slices in `src/lib/store.js`
- Wire API calls through `src/lib/api.js` — do not use `fetch` directly in components
- Handle drag-and-drop scheduling interactions via `@dnd-kit/core`

**Read before starting:** `src/App.jsx`, `src/lib/store.js`, `src/lib/api.js`

**Key constraints:**
- Pure JavaScript only — no TypeScript, no `.tsx` files
- Do not re-enable `react-hooks/set-state-in-effect` in ESLint; the rule is intentionally off
- State that needs real-time updates must subscribe to the WS store slice via `src/lib/ws.js`
- Use `reactHooks.configs.flat['recommended']` (not `recommended-latest`) if touching eslint.config.js

---

## Agent: data-layer

**Focus:** `migrations/**`, `worker/lib/ideas.js`, all D1 `.prepare().bind().run/first/all()` call sites

**Responsibilities:**
- Author new SQL migration files in `migrations/` (sequential naming: `000N_description.sql`)
- Update or add D1 query helper functions in `worker/lib/ideas.js`
- Audit existing queries for N+1 patterns or missing indexes
- Ensure new tables include appropriate unique indexes to enforce business invariants at the DB layer

**Read before starting:** `migrations/0000_initial_schema.sql`, `migrations/0001_attendees_ideas_votes.sql`, `migrations/0002_schedule_grid.sql`, `docs/ARCHITECTURE.md`

**Key constraints:**
- D1 is the source of truth — never replicate mutable state to KV or the Durable Object
- The `ideas(slot_id, room_id)` unique index is load-bearing — never drop it
- Migration files are append-only; fix mistakes with a new migration, not by editing existing ones
- Apply locally with `npm run db:migrate:local`, remotely with `npm run db:migrate:remote`

---

## Agent: realtime

**Focus:** `worker/durable-objects/EventRoom.js`, `worker/lib/broadcast.js`, `worker/routes/ws.js`, `src/lib/ws.js`

**Responsibilities:**
- Maintain the hibernatable WebSocket Durable Object (`EventRoom`)
- Implement or update the `/connect` and `/broadcast` endpoints inside `EventRoom`
- Keep the `broadcast()` helper in `worker/lib/broadcast.js` fire-and-forget (non-throwing)
- Maintain the WS client in `src/lib/ws.js` (exponential backoff reconnect, message dispatch into Zustand)

**Read before starting:** `worker/durable-objects/EventRoom.js`, `worker/lib/broadcast.js`, `worker/routes/ws.js`, `docs/ARCHITECTURE.md`

**Key constraints:**
- `EventRoom` MUST use `this.state.acceptWebSocket()` — NOT `new WebSocket()`. Hibernation is required for free-tier cost control.
- `broadcast()` must never throw — wrap DO fetch in try/catch and swallow errors
- Never store business state inside the DO — it is a pure pub/sub relay; all durable state lives in D1
- WS messages from the server must be JSON; the client parses and dispatches to the Zustand store

---

## Agent: test-writer

**Focus:** `**/__tests__/**/*.test.js`, `vitest.config.js`

**Responsibilities:**
- Write unit tests for `worker/lib/` helpers (cookies, rateLimit, ids, broadcast, ideas)
- Write route-level tests using Hono's `app.request()` for business logic coverage
- Keep tests in `node` environment (no DOM or Cloudflare runtime needed)
- Maintain fake implementations of D1, KV, and DO bindings

**How to fake D1/KV/DO:**

```js
// Fake D1
function fakeDb(rows = []) {
  return {
    prepare: (sql) => ({
      bind: (..._args) => ({
        run: async () => ({ success: true, meta: { last_row_id: 1 } }),
        first: async () => rows[0] ?? null,
        all: async () => ({ results: rows }),
      }),
    }),
    batch: async (stmts) => stmts.map(() => ({ success: true })),
  };
}

// Fake KV
function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.get(k) ?? null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list({ prefix }) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix));
      return { keys: keys.map(name => ({ name })) };
    },
  };
}

// Fake DO stub (for broadcast tests)
function fakeDo() {
  return { get: () => ({ fetch: async () => new Response('ok') }) };
}
```

**Key constraints:**
- Test files must live inside `__tests__/` directories next to the module under test
- `globalThis.crypto` is available in Node 20+ — no polyfill needed
- Do not use `vi.mock` for D1/KV — pass fakes via constructor or function argument instead
- Run `npm test` to confirm all tests pass before finishing

---

## Agent: docs-updater

**Focus:** `docs/**`, `CLAUDE.md`, `AGENTS.md`

**Responsibilities:**
- Keep `CLAUDE.md` accurate as the codebase evolves (commands, invariants, ESLint rules)
- Keep `AGENTS.md` accurate when agent focus areas or constraints change
- Update `docs/ARCHITECTURE.md` when new routes, tables, or DO behaviors are added
- Update `docs/DEPLOYMENT.md` when Wrangler config, secrets, or migration steps change
- Update `docs/PRD.md` when product requirements or feature scope changes

**Read before starting:** `docs/ARCHITECTURE.md`, `CLAUDE.md`, `wrangler.jsonc`, `package.json`

**Key constraints:**
- Do not create new `.md` files unless explicitly requested — update existing docs instead
- CLAUDE.md must stay under ~150 lines — it is a quick-reference card, not full documentation
- Verify any command snippets against `package.json` scripts before updating docs
- Do not document secrets values — reference `wrangler secret put` for secret management
