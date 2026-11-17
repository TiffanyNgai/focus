-- Lounge: characters, session status, seating order, and cheers between people.
-- Apply to an existing database once, before deploying the new worker:
--   npx wrangler d1 execute focus --local  --file=migrations/0002_lounge.sql   (local test)
--   npx wrangler d1 execute focus --remote --file=migrations/0002_lounge.sql   (production, after approval)

ALTER TABLE profiles ADD COLUMN character TEXT;
ALTER TABLE presence ADD COLUMN character TEXT;
ALTER TABLE presence ADD COLUMN status TEXT;
ALTER TABLE presence ADD COLUMN started INTEGER;

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  to_key         TEXT NOT NULL,        -- recipient, lower-cased username
  from_key       TEXT NOT NULL,
  from_name      TEXT NOT NULL,
  from_character TEXT,
  kind           TEXT NOT NULL,        -- hello | luck | gotThis
  created        INTEGER NOT NULL,
  delivered      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_inbox ON messages (to_key, delivered, created);
CREATE INDEX IF NOT EXISTS messages_pair ON messages (from_key, to_key, created);
