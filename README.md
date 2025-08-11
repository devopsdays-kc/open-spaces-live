# Open Spaces Live

![Version](https://img.shields.io/badge/version-v0.2.0-blue)
![React](https://img.shields.io/badge/React-v19.1.0-blue)
![Vite](https://img.shields.io/badge/Vite-v7.1.1-blue)

**Open Spaces Live** is a real-time web application for facilitating "Open Spaces" style conferences. It provides a live, interactive platform for attendees to submit ideas, vote on them, and view the finalized schedule, replacing the traditional sticky-note-and-whiteboard system.

![Open Spaces Live Screenshot](https://via.placeholder.com/800x400.png?text=Open+Spaces+Live+Screenshot)

## How It Works

The application is a serverless web app built on the Cloudflare ecosystem. It features a React frontend and a Hono backend, both served by a single Cloudflare Worker. It uses Cloudflare D1 for persistent data and Cloudflare KV for ephemeral data, with Mailgun for email-based authentication (all free services!!).

-   **[Product Requirements Document (PRD)](./docs/PRD.md):** Learn about the project's goals, user roles, and features.
-   **[System Architecture](./docs/ARCHITECTURE.md):** Get a technical overview of the application's components and data flow.

## Features

-   **Real-time Idea Marketplace:** A "post-it" style board where attendees can view and vote on ideas.
-   **Anonymous Idea Submission:** Anyone can submit an idea without needing an account.
-   **Facilitator Dashboard:** A secure area for facilitators and admins to manage the schedule.
-   **Session Management:** Create time slots, manage rooms, and assign ideas to the schedule.
-   **User Management:** Admins can invite and manage other facilitators and admins.
-   **Conference Customization:** Set the conference name to be displayed in the header.
-   **Application Reset:** Admins can reset votes or perform a full reset of the event data.

## Getting Started

To get the project up and running locally, please see the **[Contributing Guide](./CONTRIBUTING.md)** for detailed setup instructions.

## Deployment

For instructions on how to deploy this application to your own Cloudflare account, please see the **[Deployment Guide](./docs/DEPLOYMENT.md)**.

## Contributing

We welcome contributions from the community! Whether you're fixing a bug, proposing a new feature, or improving the documentation, your help is appreciated. Please read our **[Contributing Guide](./CONTRIBUTING.md)** to learn how you can get involved.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.






