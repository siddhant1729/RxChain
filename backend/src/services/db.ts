import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  block_number INTEGER NOT NULL,
  log_index    INTEGER NOT NULL,
  tx_hash      TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  batch_id     TEXT,
  addr1        TEXT,
  addr2        TEXT,
  args         TEXT    NOT NULL,
  timestamp    INTEGER NOT NULL,
  UNIQUE (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_events_batch ON events (batch_id);
CREATE INDEX IF NOT EXISTS idx_events_addr1 ON events (addr1);
CREATE INDEX IF NOT EXISTS idx_events_addr2 ON events (addr2);
CREATE INDEX IF NOT EXISTS idx_events_block ON events (block_number, log_index);
CREATE TABLE IF NOT EXISTS documents (
  hash          TEXT PRIMARY KEY,
  file_id       TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,
  stored_name   TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'upload',
  uploaded_at   INTEGER NOT NULL
);
`;

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATIONS);
  return db;
}
