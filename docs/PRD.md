# Product Requirements Document (PRD): Open Spaces Live

## 1. Overview

**Open Spaces Live** is a real-time web application designed to facilitate the "Marketplace of Ideas" and session organization for DevOpsDays and other Open Spaces-style conferences. It replaces the traditional sticky-note-and-whiteboard system with a live, interactive digital platform where attendees see updates instantly without manual refreshes.

## 2. The Problem / Challenge

The traditional method of using physical sticky notes for idea submission and voting at Open Spaces conferences can be difficult to manage for facilitators, hard to read for attendees, and the resulting schedule is hard to communicate in real time. Organizers also face friction getting facilitators set up before the event starts.

## 3. The Solution

**Open Spaces Live** provides a dynamic, real-time web application that allows attendees to submit ideas, vote on them, and view the finalized schedule — all updating live via WebSocket. Facilitators and admins have a dedicated dashboard to manage the entire process, from creating time slots to merging ideas and drag-and-drop scheduling. A read-only projection view is available for the conference big screen.

## 4. User Roles & Personas

- **Participant (Anonymous):** Any attendee at the conference. No login required. Identified by a server-issued HMAC-signed browser cookie. Can view the idea board, submit ideas, and vote.
- **Facilitator:** A user who has entered the pre-shared event code at `/login-code`. Responsible for the smooth running of the Open Spaces track with access to moderation and scheduling tools.
- **Admin:** A user who has authenticated via Mailgun magic-link email. Has full control over the system including user management, conference customization, and facilitator code rotation.

## 5. Features & Functionality

### 5.1. Participant Features

- **View Idea Marketplace:** See all active ideas on a "post-it" style board, sorted by vote count.
- **Submit an Idea:** Anonymously submit a title and description for a new session idea. Rate-limited to 5 per 10 minutes.
- **Vote on an Idea:** Cast one vote per idea. Vote toggling (cast and remove) is supported. Rate-limited to 30 votes per minute.
- **Live Updates:** New ideas and vote counts update in real time via WebSocket — no manual refresh needed.
- **View Live Schedule:** View the finalized Open Spaces schedule in a grid format (time slots × rooms) that updates live as facilitators make assignments.

### 5.2. Facilitator Features

- **Authentication:** Enter a pre-shared event code at `/login-code`. No email required.
- **Dashboard Access:** Access a dedicated dashboard with Ideas, Schedule Builder, and Admin tabs.
- **Idea Moderation:**
  - **Remove:** Soft-delete inappropriate or duplicate ideas (status → `removed`).
  - **Merge:** Combine multiple similar ideas into a single session, preserving the union of all votes.
  - **Assign:** Assign an idea to a (slot, room) cell on the schedule grid.
- **Schedule Builder:** A drag-and-drop 2D grid (rooms × time slots) for assigning ideas to schedule cells. Conflict detection prevents double-booking at the database level.
- **Time Slot & Room Management:** Create, reorder, and delete time slots and rooms for the schedule.

### 5.3. Admin Features

- **All Facilitator Capabilities**
- **User Management:** Invite new admins via email, view all users, delete users.
- **Conference Customization:** Set a custom conference name displayed in the site header.
- **Facilitator Code Management:** Generate a new event code with a configurable TTL. Rotating the code immediately invalidates all active facilitator sessions.
- **Application Reset:**
  - **Reset Votes:** Clear all votes while preserving ideas and the schedule.
  - **Full Reset:** Truncate ideas, votes, slots, rooms, and attendees. Broadcasts a `conference:reset` event so all connected clients clear their state instantly.

### 5.4. Projection View

- A full-bleed, dark-theme view at `/projector` designed for a 1080p conference projector.
- Two modes: `?mode=ideas` (top-voted ideas as large cards) and `?mode=schedule` (full grid with current time slot highlighted).
- Auto-rotates between modes every 30 seconds if no `?mode` parameter is set.
- Fully WebSocket-subscribed — updates live without any interaction.

## 6. Technical Requirements

- **Frontend:** React 19 + Vite 8. Single-page application with React Router v7. Zustand v5 for global state. `@dnd-kit/core` for drag-and-drop in the Schedule Builder.
- **Backend:** Hono v4.12 running on a Cloudflare Worker.
- **Database:**
  - **Cloudflare D1 (SQLite):** Source of truth for all persistent data — attendees, ideas, votes, slots, rooms, users.
  - **Cloudflare KV:** Sessions (admin + facilitator), rate-limit counters, event code, conference name, magic-link tokens.
- **Real-time:** Cloudflare Durable Object (`EventRoom`) with hibernatable WebSockets. The Worker pokes the DO after every mutation; the DO fans out to all connected browsers. The DO holds no state — if it restarts, clients reconnect and re-fetch via REST.
- **Attendee Identity:** Server-issued HMAC-SHA256 signed HTTPOnly cookie (`os_attendee`). No login required for participants. Identity persists across sessions for up to 30 days.
- **Authentication:** Pre-shared event code for facilitators (12h session); Mailgun magic-link for admins (24h session).
- **Vote Integrity:** `INSERT OR IGNORE INTO votes` (PRIMARY KEY constraint) + `UPDATE ideas SET vote_count = vote_count + 1`. Atomic — no race conditions.
- **Deployment:** Cloudflare Workers, D1, KV, and Durable Objects — all on the free tier.

## 7. Out of Scope

- Multi-conference tenancy (the current design is for a single event; admin runs a full reset between events).
- In-app customization of conference branding (logo, colors).
- Different authentication providers (e.g., GitHub, Google) for admin.
- Participant login for tracking their own ideas and votes across devices.
- Mobile app.
- Notification emails for session assignments.
- Translations / i18n.
