import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let connection: DatabaseSync | undefined;
export function db() {
  if (!connection) {
    const path = process.env.DATABASE_PATH || './data/tracker.sqlite';
    // The user-configured database is runtime state, never a build-traced asset.
    if (path !== ':memory:')
      mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true });
    connection = new DatabaseSync(path);
    connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    connection.exec(
      'CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    if (!connection.prepare('SELECT 1 FROM migrations WHERE version=1').get()) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        connection.exec(readFileSync(resolve('migrations/001_initial.sql'), 'utf8'));
        connection.prepare('INSERT INTO migrations VALUES(1,?)').run(new Date().toISOString());
        connection.exec('COMMIT');
      } catch (e) {
        connection.exec('ROLLBACK');
        throw e;
      }
    }
  }
  return connection;
}
export function closeDb() {
  connection?.close();
  connection = undefined;
}
