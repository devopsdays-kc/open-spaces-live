# Contributing to Open Spaces Live

## How Can I Contribute?

- **Reporting Bugs:** If you find a bug, please open an issue and provide as much detail as possible, including steps to reproduce.
- **Suggesting Enhancements:** If you have an idea for a new feature or an improvement to an existing one, open an issue to discuss it.
- **Pull Requests:** We welcome pull requests! Please open an issue first to discuss the change you'd like to make.

## Development Setup

The project is a monorepo managed with npm workspaces, running on Cloudflare Workers.

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 or later)
- [npm](https://www.npmjs.com/) (v11 or later)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A [Mailgun account](https://www.mailgun.com/) for email sending

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/open-spaces-live.git
    cd open-spaces-live
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Local Development

1.  **Cloudflare Setup:**
  - Log in to your Cloudflare account:
    ```bash
    npx wrangler login
    ```

2.  **Database Setup:**
  - Create the D1 database for local development:
    ```bash
    npx wrangler d1 create open-spaces-live-dev
    ```
  - Update your `wrangler.jsonc` file with the new database ID under `database_id`.
  - Apply the database migrations:
    ```bash
    npx wrangler d1 migrations apply DB --local
    ```

3.  **Secrets Setup:**
  - Create a `.dev.vars` file in the root of the project.
  - Add your Mailgun credentials to this file:
    ```
    MAILGUN_API_KEY="your-mailgun-api-key"
    MAILGUN_DOMAIN="your-mailgun-domain"
    MAILGUN_FROM="you@your-domain.com"
    ```

4.  **Run the application:**
    ```bash
    npm run dev
    ```
    This will start the Vite dev server for the React frontend and the Wrangler dev server for the backend, both running concurrently.

## Pull Request Process

1. Ensure any install or build dependencies are removed before the end of the layer when doing a build.
2. Update the README.md with details of changes to the interface, this includes new environment variables, exposed ports, useful file locations and container parameters.
3. Increase the version numbers in any examples and the README.md to the new version that this Pull Request would represent. The versioning scheme we use is [SemVer](http://semver.org/).
4. You may merge the Pull Request in once you have the sign-off of two other developers, or if you do not have permission to do that, you may request the second reviewer to merge it for you.

## Code of Conduct

Please note we have a code of conduct, please follow it in all your interactions with the project.
