"""
Test: legacy auto-reply workflow -> default chat_agent migration (logic replica).
Mirrors the SQL in DatabaseService migration. Validates: creates a default agent with the
old assistant, disables the legacy workflow, is idempotent, and handles missing page_ids.
Run: C:\\Python312\\python.exe plans/reports/test-chat-agent-migration.py
"""
import sqlite3, json, time

PASS = FAIL = 0
def check(name, cond):
    global PASS, FAIL
    print(("  PASS  " if cond else "  FAIL  ") + name)
    PASS += 1 if cond else 0
    FAIL += 0 if cond else 1

def schema(con):
    con.executescript("""
    CREATE TABLE workflows (id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, page_ids TEXT DEFAULT '', nodes_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE chat_agent (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, name TEXT NOT NULL,
      assistant_id TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0, reply_mode TEXT NOT NULL DEFAULT 'auto',
      is_default INTEGER NOT NULL DEFAULT 0, default_scope_dm INTEGER NOT NULL DEFAULT 0, default_scope_group INTEGER NOT NULL DEFAULT 0,
      default_stranger_only INTEGER NOT NULL DEFAULT 0, autopause_on_human INTEGER NOT NULL DEFAULT 1, autoresume_minutes INTEGER NOT NULL DEFAULT 0,
      allow_manual_toggle INTEGER NOT NULL DEFAULT 1, trigger_keywords TEXT DEFAULT '', created_at INTEGER, updated_at INTEGER);
    """)

def migrate(con):
    """Replica of the DatabaseService migration."""
    rows = con.execute("SELECT id, page_ids, nodes_json, enabled FROM workflows WHERE id LIKE 'autoreply-%'").fetchall()
    migrated = 0
    for wid, page_ids, nodes_json, enabled in rows:
        owner = ''
        try: owner = (json.loads(page_ids or '[]') or [''])[0] or ''
        except Exception: owner = ''
        if not owner: owner = wid.replace('autoreply-', '', 1)
        if not owner: continue
        has = con.execute("SELECT COUNT(*) FROM chat_agent WHERE owner_zalo_id=? AND is_default=1", (owner,)).fetchone()[0]
        if has: continue
        assistant = ''
        try:
            assistant = next((n.get('config', {}).get('assistantId', '') for n in json.loads(nodes_json or '[]') if n.get('type') == 'ai.generateText'), '')
        except Exception: assistant = ''
        now = int(time.time() * 1000)
        con.execute("""INSERT INTO chat_agent (owner_zalo_id,name,assistant_id,enabled,reply_mode,is_default,default_scope_dm,default_scope_group,default_stranger_only,autopause_on_human,autoresume_minutes,allow_manual_toggle,trigger_keywords,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (owner, 'Agent chat mặc định', assistant, 1 if enabled else 0, 'auto', 1, 1, 0, 1, 1, 0, 1, '', now, now))
        con.execute("UPDATE workflows SET enabled=0 WHERE id=?", (wid,))
        migrated += 1
    con.commit()
    return migrated

con = sqlite3.connect(":memory:")
schema(con)
con.execute("INSERT INTO workflows (id, enabled, page_ids, nodes_json) VALUES (?,?,?,?)",
    ("autoreply-acc1", 1, json.dumps(["acc1"]), json.dumps([{"type": "trigger.message"}, {"type": "ai.generateText", "config": {"assistantId": "asst-9"}}, {"type": "zalo.sendMessage"}])))
con.execute("INSERT INTO workflows (id, enabled, page_ids, nodes_json) VALUES (?,?,?,?)",
    ("autoreply-acc2", 0, "", json.dumps([{"type": "ai.generateText", "config": {"assistantId": ""}}])))  # no page_ids, disabled
con.execute("INSERT INTO workflows (id, enabled, page_ids, nodes_json) VALUES (?,?,?,?)", ("user-flow-1", 1, json.dumps(["acc1"]), "[]"))  # normal workflow, untouched
con.commit()

n = migrate(con)
check("TC-01 migrated 2 auto-reply workflows", n == 2)
a1 = con.execute("SELECT assistant_id, is_default, default_scope_dm, default_scope_group, default_stranger_only, enabled FROM chat_agent WHERE owner_zalo_id='acc1'").fetchone()
check("TC-02 acc1 default agent: assistant=asst-9, default+dm+stranger, no group, enabled", a1 == ("asst-9", 1, 1, 0, 1, 1))
a2 = con.execute("SELECT owner_zalo_id, enabled FROM chat_agent WHERE owner_zalo_id='acc2'").fetchone()
check("TC-03 acc2 owner from id fallback, enabled mirrors workflow(0)", a2 == ("acc2", 0))
check("TC-04 legacy autoreply workflows disabled", con.execute("SELECT COUNT(*) FROM workflows WHERE id LIKE 'autoreply-%' AND enabled=1").fetchone()[0] == 0)
check("TC-05 normal workflow untouched", con.execute("SELECT enabled FROM workflows WHERE id='user-flow-1'").fetchone()[0] == 1)
n2 = migrate(con)
check("TC-06 idempotent: 2nd run migrates 0, no duplicate", n2 == 0 and con.execute("SELECT COUNT(*) FROM chat_agent").fetchone()[0] == 2)

print("=" * 50)
print(f"TOTAL: {PASS} PASS / {FAIL} FAIL out of {PASS + FAIL}")
