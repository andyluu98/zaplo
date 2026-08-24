/**
 * Proves the Phase-2 schema migration is idempotent and lossless on an EXISTING
 * populated DB (red-team H3): adding `channel` to chat_agent/chat_agent_thread and
 * rebuilding conversation_ai_state's PK to include `channel` must preserve every
 * Zalo row and survive running twice. The DDL here mirrors DatabaseService.migrate()
 * exactly; if that changes, update this test.
 */

import BetterSqlite3 from 'better-sqlite3';

type DB = InstanceType<typeof BetterSqlite3>;

/** Build the OLD (pre-Phase-2) schema + sample Zalo data. */
function seedOldDb(): DB {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE chat_agent (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE chat_agent_thread (
      chat_agent_id INTEGER NOT NULL, owner_zalo_id TEXT NOT NULL, thread_id TEXT NOT NULL,
      thread_type INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (chat_agent_id, thread_id)
    );
    CREATE TABLE conversation_ai_state (
      owner_zalo_id TEXT NOT NULL, thread_id TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0,
      paused_reason TEXT DEFAULT '', paused_at INTEGER DEFAULT 0, pinned_agent_id INTEGER DEFAULT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner_zalo_id, thread_id)
    );
  `);
  db.prepare(`INSERT INTO chat_agent (owner_zalo_id, name, enabled) VALUES (?,?,?)`).run('zalo1', 'Agent A', 1);
  db.prepare(`INSERT INTO chat_agent_thread (chat_agent_id, owner_zalo_id, thread_id) VALUES (?,?,?)`).run(1, 'zalo1', 'tX');
  db.prepare(`INSERT INTO conversation_ai_state (owner_zalo_id, thread_id, paused, paused_reason, paused_at, pinned_agent_id, updated_at)
              VALUES (?,?,?,?,?,?,?)`).run('zalo1', 'tX', 1, 'human replied', 12345, 7, 999);
  return db;
}

/** The exact idempotent migration from DatabaseService.migrate(). */
function runMigration(db: DB): void {
  const cols = (t: string) => db.prepare(`PRAGMA table_info(${t})`).all() as any[];

  const caCols = cols('chat_agent');
  if (caCols.length > 0 && !caCols.some((c) => c.name === 'channel')) {
    db.exec(`ALTER TABLE chat_agent ADD COLUMN channel TEXT NOT NULL DEFAULT 'zalo'`);
  }
  const catCols = cols('chat_agent_thread');
  if (catCols.length > 0 && !catCols.some((c) => c.name === 'channel')) {
    db.exec(`ALTER TABLE chat_agent_thread ADD COLUMN channel TEXT NOT NULL DEFAULT 'zalo'`);
  }
  const casCols = cols('conversation_ai_state');
  if (casCols.length > 0 && !casCols.some((c) => c.name === 'channel')) {
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE conversation_ai_state_new (
          channel TEXT NOT NULL DEFAULT 'zalo', owner_zalo_id TEXT NOT NULL, thread_id TEXT NOT NULL,
          paused INTEGER NOT NULL DEFAULT 0, paused_reason TEXT DEFAULT '', paused_at INTEGER DEFAULT 0,
          pinned_agent_id INTEGER DEFAULT NULL, updated_at INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (channel, owner_zalo_id, thread_id)
        );
        INSERT INTO conversation_ai_state_new
          (channel, owner_zalo_id, thread_id, paused, paused_reason, paused_at, pinned_agent_id, updated_at)
          SELECT 'zalo', owner_zalo_id, thread_id, paused, paused_reason, paused_at, pinned_agent_id, updated_at
          FROM conversation_ai_state;
        DROP TABLE conversation_ai_state;
        ALTER TABLE conversation_ai_state_new RENAME TO conversation_ai_state;
      `);
    });
    rebuild();
  }
}

const pkCols = (db: DB, t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);

describe('Phase-2 schema migration', () => {
  it('adds channel columns defaulting to zalo and preserves rows', () => {
    const db = seedOldDb();
    runMigration(db);

    const ca = db.prepare(`SELECT channel FROM chat_agent WHERE id=1`).get() as any;
    expect(ca.channel).toBe('zalo');
    const cat = db.prepare(`SELECT channel FROM chat_agent_thread WHERE chat_agent_id=1 AND thread_id='tX'`).get() as any;
    expect(cat.channel).toBe('zalo');
  });

  it('rebuilds conversation_ai_state PK to (channel, owner_zalo_id, thread_id) losslessly', () => {
    const db = seedOldDb();
    runMigration(db);

    expect(pkCols(db, 'conversation_ai_state')).toEqual(['channel', 'owner_zalo_id', 'thread_id']);
    const row = db.prepare(`SELECT * FROM conversation_ai_state WHERE owner_zalo_id='zalo1' AND thread_id='tX'`).get() as any;
    expect(row.channel).toBe('zalo');
    expect(row.paused).toBe(1);
    expect(row.paused_reason).toBe('human replied');
    expect(row.pinned_agent_id).toBe(7);
  });

  it('lets a page thread share a thread_id with a zalo thread without collision', () => {
    const db = seedOldDb();
    runMigration(db);
    // same owner+thread but different channel must be a distinct PK row
    db.prepare(`INSERT INTO conversation_ai_state (channel, owner_zalo_id, thread_id, paused) VALUES (?,?,?,?)`)
      .run('page', 'zalo1', 'tX', 0);
    const count = (db.prepare(`SELECT COUNT(*) n FROM conversation_ai_state WHERE owner_zalo_id='zalo1' AND thread_id='tX'`).get() as any).n;
    expect(count).toBe(2);
  });

  it('is idempotent — running twice makes no further change and does not throw', () => {
    const db = seedOldDb();
    runMigration(db);
    const before = db.prepare(`SELECT * FROM conversation_ai_state`).all();
    expect(() => runMigration(db)).not.toThrow();
    const after = db.prepare(`SELECT * FROM conversation_ai_state`).all();
    expect(after).toEqual(before);
    expect(pkCols(db, 'conversation_ai_state')).toEqual(['channel', 'owner_zalo_id', 'thread_id']);
  });
});
