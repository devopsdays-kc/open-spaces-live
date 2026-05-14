-- Move ideas + votes from KV into D1 for atomicity and audit.

CREATE TABLE attendees (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ip_hash TEXT
);

CREATE TABLE ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  submitter_id TEXT REFERENCES attendees(id),
  vote_count INTEGER NOT NULL DEFAULT 0,
  slot_id TEXT REFERENCES slots(id),
  room_id TEXT REFERENCES rooms(id),
  merged_into_id TEXT REFERENCES ideas(id),
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_ideas_slot ON ideas(slot_id, room_id);
CREATE INDEX idx_ideas_votes ON ideas(vote_count DESC);

CREATE TABLE votes (
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (idea_id, attendee_id)
);

CREATE INDEX idx_votes_attendee ON votes(attendee_id);
