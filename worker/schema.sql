CREATE TABLE IF NOT EXISTS profiles (
  key        TEXT PRIMARY KEY,          -- lower-cased username, so names are unique regardless of case
  name       TEXT NOT NULL,             -- username as the person typed it
  code_hash  TEXT NOT NULL,             -- SHA-256 of the private sync code
  created    INTEGER NOT NULL
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
  last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS presence_seen ON presence (last_seen);
