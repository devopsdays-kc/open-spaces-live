-- Initial Schema for Open Spaces Live

-- Create the users table to store admin and facilitator accounts.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at INTEGER
);

-- Create the rooms table to define physical or virtual locations for sessions.
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER
);

-- Create the slots table to define the time slots for the conference schedule.
-- Each slot is associated with a room.
CREATE TABLE slots (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at INTEGER,
    roomId TEXT,
    FOREIGN KEY(roomId) REFERENCES rooms(id)
);
