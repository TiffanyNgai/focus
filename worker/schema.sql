CREATE TABLE IF NOT EXISTS profiles (
  key        TEXT PRIMARY KEY,          -- lower-cased username, so names are unique regardless of case
  name       TEXT NOT NULL,             -- username as the person typed it
  code_hash  TEXT NOT NULL,             -- SHA-256 of the private sync code
  created    INTEGER NOT NULL,
  character  TEXT                       -- lounge character id, null until picked
);

CREATE TABLE IF NOT EXISTS sessions (
  profile  TEXT NOT NULL,
  id       TEXT NOT NULL,
  task     TEXT NOT NULL,
  ms       INTEGER NOT NULL,
  start_at INTEGER NOT NULL,
  end_at   INTEGER NOT NULL,
  source   TEXT NOT NULL,
  PRIMARY KEY (profile, id)
);

CREATE TABLE IF NOT EXISTS presence (
  client     TEXT PRIMARY KEY,          -- random id kept in each browser
  name       TEXT,                      -- null for people without a profile
  character  TEXT,
  status     TEXT,                      -- optional line typed when the session started
  started    INTEGER,                   -- when this session began: decides the seating order
  last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS presence_seen ON presence (last_seen);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  to_key         TEXT NOT NULL,
  from_key       TEXT NOT NULL,
  from_name      TEXT NOT NULL,
  from_character TEXT,
  kind           TEXT NOT NULL,        -- hello | luck | gotThis
  created        INTEGER NOT NULL,
  delivered      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_inbox ON messages (to_key, delivered, created);
CREATE INDEX IF NOT EXISTS messages_pair ON messages (from_key, to_key, created);
