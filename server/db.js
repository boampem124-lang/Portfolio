const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbFile = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'db.sqlite');
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbFile);

db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  balance INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  points INTEGER,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS completions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  task_id TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  amount INTEGER,
  stripe_session TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT,
  type TEXT,
  expires_at INTEGER
);
`);

module.exports = db;
