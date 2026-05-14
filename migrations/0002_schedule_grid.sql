-- Reshape slots/rooms into a true 2D grid: slots = time rows, rooms = columns.
-- Each idea's (slot_id, room_id) addresses a single cell.

-- SQLite can't drop columns in older versions and D1 follows that. Recreate slots without roomId.
CREATE TABLE slots_new (
  id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER
);

INSERT INTO slots_new (id, start_time, duration_minutes, position, created_at)
  SELECT id, start_time, duration_minutes, 0, created_at FROM slots;

DROP TABLE slots;
ALTER TABLE slots_new RENAME TO slots;

ALTER TABLE rooms ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Prevent double-booking a single (slot, room) cell.
CREATE UNIQUE INDEX idx_ideas_cell
  ON ideas(slot_id, room_id)
  WHERE slot_id IS NOT NULL AND room_id IS NOT NULL;
