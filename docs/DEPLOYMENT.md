# Deploying Open Spaces Live to Cloudflare

This guide walks you through deploying Open Spaces Live to your own Cloudflare account.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up).
- [Node.js](https://nodejs.org/en/) (version 20.x or later) and `npm` installed.
- [Git](https://git-scm.com/) installed on your local machine.
- A [Mailgun account](https://www.mailgun.com/) with a verified sending domain (required for admin login).

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/open-spaces-live.git
cd open-spaces-live
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Authenticate with Wrangler

```bash
npx wrangler login
```

This opens a browser window to authorize Wrangler with your Cloudflare account.

## Step 4: Create Cloudflare Services

The application requires a D1 database and a KV namespace. The EventRoom Durable Object is declared in `wrangler.jsonc` and is created automatically on first deploy — no manual provisioning needed.

### Create a D1 Database

```bash
npx wrangler d1 create open-spaces-live-db
```

Copy the `database_id` from the output.

### Create a KV Namespace

```bash
npx wrangler kv namespace create "KV"
```

Copy the `id` from the output.

## Step 5: Configure `wrangler.jsonc`

Open `wrangler.jsonc` and replace the placeholder IDs with your own:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "open-spaces-live-db",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "YOUR_KV_NAMESPACE_ID"
    }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "EVENT_ROOM", "class_name": "EventRoom" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_classes": [] },
    { "tag": "v2", "new_sqlite_classes": ["EventRoom"] }
  ]
}
```

The `durable_objects` and `migrations` sections are already present in the repo — only the D1 `database_id` and KV `id` need to be replaced.

## Step 6: Set Wrangler Secrets

These environment variables are stored securely as Wrangler secrets and are never committed to source control.

**NOTE: If the Worker has not been deployed yet, `wrangler secret put` will prompt you to create it. You can deploy first (Step 9) and then set secrets, or set them now and accept the creation prompt.**

```bash
# HMAC key for attendee identity cookies — use a long random string (32+ chars)
# via this link: https://www.random.org/strings/?num=10&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new
npx wrangler secret put COOKIE_SECRET

# Salt for hashing cf-connecting-ip (audit only) — rotate per event if desired
# via this linke: https://www.random.org/strings/?num=10&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new
npx wrangler secret put ATTENDEE_SALT

# Mailgun credentials — required for admin magic-link login
npx wrangler secret put MAILGUN_API_KEY
npx wrangler secret put MAILGUN_DOMAIN
npx wrangler secret put MAILGUN_FROM
```

Wrangler prompts you to enter each value interactively. To generate a cryptographically random value for `COOKIE_SECRET` and `ATTENDEE_SALT`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Step 7: Apply Database Migrations

There are three migration files that must be applied in order. The `db:migrate` commands apply all pending migrations automatically.

**For local development:**

```bash
npm run db:migrate:local
```

**For production:**

```bash
npm run db:migrate:remote
```

The three migration files create:

- `0000_initial_schema.sql` — `users`, `slots`, `rooms` tables
- `0001_attendees_ideas_votes.sql` — `attendees`, `ideas`, `votes` tables
- `0002_schedule_grid.sql` — reshapes `slots` to pure time rows, adds `position` columns to slots and rooms, creates the `UNIQUE INDEX ON ideas(slot_id, room_id)` that prevents double-booking

## Step 8: Create the Initial Admin User

With the schema in place, run the interactive seed script:

```bash
npm run db:seed-admin
```

The script prompts for the admin's email address and inserts it into the `users` table with `role = 'admin'`.

## Step 9: Deploy the Application

```bash
npm run deploy
```

Wrangler builds the frontend, uploads static assets, and deploys the Worker. When finished it prints the public URL (e.g., `https://open-spaces-live.<your-subdomain>.workers.dev`).

On the first deploy, Cloudflare creates the EventRoom Durable Object class automatically based on the `migrations` in `wrangler.jsonc`.

## Step 10: Set the Facilitator Event Code

After deploying, an admin must generate a facilitator event code before facilitators can log in:

1. Open your deployment URL and navigate to `/admin-login`.
2. Enter your admin email address. Check your inbox for the magic link.
3. Click the link — you are redirected to `/dashboard`.
4. Open the **Admin** tab.
5. Under **Facilitator event code**, click **Generate new code**.
6. Share the displayed code (e.g., `ABCD-1234`) with your facilitators before the event.

Facilitators enter this code at `/login-code` to access the dashboard. You can rotate the code at any time from the Admin tab — this immediately invalidates all active facilitator sessions.

## Local Development

To run the full stack locally (Worker + D1 + KV + DO):

```bash
npm run db:migrate:local   # apply migrations to local D1 (once, or after schema changes)
npm run dev                # starts Vite + Wrangler dev server
```

The dev server proxies the frontend through the local Worker. D1, KV, and the Durable Object are all emulated locally by Wrangler. No Cloudflare account required for local development after the initial setup.

## Environment Summary

| Secret | Required | Description |
| --- | --- | --- |
| `COOKIE_SECRET` | Yes | HMAC-SHA256 key for attendee identity cookies |
| `ATTENDEE_SALT` | Yes | Salt for hashing `cf-connecting-ip` (audit only) |
| `MAILGUN_API_KEY` | Yes | Mailgun API key for admin magic-link emails |
| `MAILGUN_DOMAIN` | Yes | Your Mailgun sending domain |
| `MAILGUN_FROM` | Yes | The `From` address for outbound emails |
