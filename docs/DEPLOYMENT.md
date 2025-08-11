# Deploying Open Spaces Live to Cloudflare

This guide will walk you through deploying the Open Spaces Live application to your own Cloudflare account.

## Prerequisites

-   A [Cloudflare account](https://dash.cloudflare.com/sign-up).
-   [Node.js](https://nodejs.org/en/) (version 18.x or later) and `npm` installed.
-   [Git](https://git-scm.com/) installed on your local machine.

## Step 1: Clone the Repository

First, clone the project repository to your local machine and navigate into the directory.

```bash
git clone https://github.com/your-username/open-spaces-live.git
cd open-spaces-live
```

## Step 2: Install Dependencies

Install the necessary project dependencies using `npm`.

```bash
npm install
```

## Step 3: Authenticate with Wrangler

Wrangler is the command-line interface for Cloudflare Workers. You'll need to log in with your Cloudflare account.

```bash
npx wrangler login
```

This command will open a web browser, prompting you to log in to your Cloudflare account and authorize Wrangler.

## Step 4: Create Cloudflare Services

The application relies on three Cloudflare services: a D1 database for persistent data, a KV namespace for ephemeral data, and secrets for sensitive information.

### 1. Create a D1 Database

Run the following command to create a new D1 database. The name `open-spaces-live` is recommended as it matches the default project configuration.

```bash
npx wrangler d1 create open-spaces-live
```

After running the command, Wrangler will output the database details. **Copy the `database_id`** from the output.

### 2. Create a KV Namespace

Next, create a KV namespace for storing ideas and sessions.

```bash
npx wrangler kv namespace create "KV"
```

Wrangler will output the namespace details. **Copy the `id`** for the new namespace.

## Step 5: Configure `wrangler.jsonc`

Open the `wrangler.jsonc` file in the root of the project. You need to update it with the IDs for the D1 database and KV namespace you just created.

Find the `d1_databases` and `kv_namespaces` sections and replace the placeholder IDs with the ones you copied.

```jsonc
// wrangler.jsonc

{
  // ... other config ...
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "open-spaces-live",
      "database_id": "YOUR_D1_DATABASE_ID" // <-- PASTE YOUR D1 ID HERE
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "YOUR_KV_NAMESPACE_ID" // <-- PASTE YOUR KV ID HERE
    }
  ],
  // ... other config ...
}
```

## Step 6: Set Up Email Service (Mailgun)

The application uses an email service to send magic links for authentication. The default implementation uses Mailgun.

1.  Sign up for a [Mailgun account](https://www.mailgun.com/).
2.  Add and verify a domain that you own.
3.  Navigate to your domain settings and find your **API Key** and **Domain Name**.

### Configure Wrangler Secrets

Use Wrangler to securely store your Mailgun credentials. These will be available to your Worker as environment variables.

**NOTE: If your worker has not been deployed yet, you will be prompted to create a new worker.**

```bash
# Your Mailgun API Key (the one starting with 'key-')
npx wrangler secret put MAILGUN_API_KEY

# Your Mailgun domain (e.g., mg.yourdomain.com)
npx wrangler secret put MAILGUN_DOMAIN

# The 'from' email address you want to use (e.g., no-reply@mg.yourdomain.com)
npx wrangler secret put MAILGUN_FROM
```

Wrangler will prompt you to enter the value for each secret in your terminal.

## Step 7: Apply Database Migrations

Before deploying, you need to set up the database schema by applying the initial migration.

```bash
npm run db:migrate
```

This command reads the initial schema file from the `migrations/` directory and applies it to your D1 database, creating the necessary tables (`users`, `slots`, `rooms`).

## Step 8: Create the Initial Admin User

With the database schema in place, run the interactive script to create your administrator account.

```bash
npm run db:seed-admin
```

The script will prompt you to enter the email address for the initial admin user. Once you provide the email, it will be securely added to the database.

## Step 9: Deploy the Application

You are now ready to deploy! Run the following command:

```bash
npm run deploy
```

Wrangler will build the application, upload the assets, and deploy the Worker to your Cloudflare account. Once finished, it will provide you with the public URL for your application (e.g., `https://open-spaces-live.<your-subdomain>.workers.dev`).

Congratulations! Your instance of Open Spaces Live is now deployed.
