# Product Requirements Document (PRD): Open Spaces Live

## 1. Overview

**Open Spaces Live** is a real-time web application designed to facilitate the "Marketplace of Ideas" and session organization for DevOpsDays and other "Open Spaces" style conferences. It replaces the traditional sticky-note-and-whiteboard system with a live, interactive digital platform.

## 2. The Problem / Challenge

The traditional method of using physical sticky notes for idea submission and voting at Open Spaces conferences is often chaotic (but that's part of the charm!), sometimes difficult to manage for facilitators, hard to read for attendees, and hard to organize into rooms and communicate to participants. And ideas are ephemeral and usually lost after the event. But that also doesn't mean the traditional method is a bad thing, it's just that it's nice to have an option.

## 3. The Solution

**Open Spaces Live** provides a dynamic, real-time web application that allows attendees to submit ideas, vote on them, and view the finalized schedule. Facilitators and admins have a dedicated dashboard to manage the entire process, from creating time slots to merging ideas and assigning them to the schedule.

## 4. User Roles & Personas

- **Participant (Anonymous):** Any attendee at the conference. They can view the idea board, submit new ideas, and vote on existing ones.
- **Facilitator:** A logged-in user with elevated privileges. They are responsible for the smooth running of the Open Spaces track.
- **Admin:** A logged-in user with full control over the system. They have all facilitator capabilities plus user management and conference customization.

## 5. Features & Functionality

### 5.1. Participant Features
- **View Idea Marketplace:** See all active ideas on a "post-it" style board.
- **Submit an Idea:** Anonymously submit a title and description for a new session idea. Ideas are stored ephemerally for 72 hours.
- **Vote on an Idea:** Vote for any number of ideas, with a limit of one vote per idea per user.
- **View Live Schedule:** View the finalized Open Spaces schedule in a clear, tabular format that can be updated in real-time.

### 5.2. Facilitator Features
- **Authentication:** Secure login via a magic link sent to their email.
- **Dashboard Access:** Access a dedicated dashboard for managing the Open Spaces.
- **Time Slot Management:** Create, view, and delete time slots for the conference schedule.
- **Room Management:** Create, view, and delete rooms or tracks.
- **Idea Administration:**
  - **Remove:** Delete inappropriate or duplicate ideas.
  - **Merge:** Combine multiple similar ideas into a single, new session, aggregating their votes.
  - **Assign:** Assign an active idea to a specific time slot and room, officially adding it to the schedule.

### 5.3. Admin Features
- **All Facilitator Capabilities:** Admins can perform all actions available to facilitators.
- **User Management:**
  - **Invite Users:** Invite new facilitators or other admins to the system via an email invitation.
  - **View Users:** See a list of all registered users and their roles.
  - **Delete Users:** Remove users from the system.
  - **Conference Customization:** Set a custom name for the conference (e.g., "DevOpsDays Boston") that appears in the site header.
  - **Application Reset:**
    - **Reset Votes:** Clear all votes for ideas that have not yet been scheduled.
    - **Full Reset:** A destructive action that deletes all ideas, slots, and rooms, effectively resetting the conference to a blank state while preserving user accounts.

## 6. Technical Requirements

- **Frontend:** React (with Vite) for a dynamic single-page application.
- **Backend:** Hono running on a single Cloudflare Worker.
- **Database:**
  - **Cloudflare D1:** For persistent data such as users, time slots, and rooms.
  - **Cloudflare KV:** For ephemeral data, primarily the ideas which have a 24-hour TTL.
- **Authentication:** Magic link system using Mailgun for email delivery.
- **Deployment:** Deployed on Cloudflare's global network for high performance and availability.
- **Styling:** A clean, responsive dark theme.

## 7. Out of Scope (Future Considerations)

- Multi-conference tenancy (the current design is for a single event).
- In-app customization of conference branding (logo, colors).
- Real-time updates without manual refreshes (requires Durable Objects or similar).
- Different authentication providers (e.g., GitHub, Google).
- Participant login for tracking their own ideas and votes.
