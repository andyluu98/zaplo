"""
Chat Agent module DB round-trip tests (mirrors test-agent-db.py).
Pure sqlite3 — applies the exact schema from DatabaseService.createTables()
for the 4 chat-agent tables + a minimal messages table with sent_by.
Run: C:\\Python312\\python.exe plans/reports/test-chat-agent-db.py
"""
import sqlite3, sys, time

# ── helpers ──────────────────────────────────────────────────────────────────
results = []
def ok(name): results.append(("PASS", name)); print(f"  PASS  {name}")
def fail(name, reason): results.append(("FAIL", name)); print(f"  FAIL  {name} — {reason}")

def fresh_mem():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.executescript("""
    CREATE TABLE chat_agent (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, name TEXT NOT NULL,
        assistant_id TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0,
        reply_mode TEXT NOT NULL DEFAULT 'auto', is_default INTEGER NOT NULL DEFAULT 0,
        default_scope_dm INTEGER NOT NULL DEFAULT 0, default_scope_group INTEGER NOT NULL DEFAULT 0,
        default_stranger_only INTEGER NOT NULL DEFAULT 0, autopause_on_human INTEGER NOT NULL DEFAULT 1,
        autoresume_minutes INTEGER NOT NULL DEFAULT 0, allow_manual_toggle INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE chat_agent_thread (
        chat_agent_id INTEGER NOT NULL, owner_zalo_id TEXT NOT NULL, thread_id TEXT NOT NULL,
        thread_type INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (chat_agent_id, thread_id)
    );
    CREATE TABLE chat_agent_label (
        chat_agent_id INTEGER NOT NULL, label_id INTEGER NOT NULL,
        PRIMARY KEY (chat_agent_id, label_id)
    );
    CREATE TABLE conversation_ai_state (
        owner_zalo_id TEXT NOT NULL, thread_id TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0,
        paused_reason TEXT DEFAULT '', paused_at INTEGER DEFAULT 0, pinned_agent_id INTEGER DEFAULT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner_zalo_id, thread_id)
    );
    CREATE INDEX idx_chat_agent_thread ON chat_agent_thread(thread_id);
    CREATE INDEX idx_chat_agent_owner ON chat_agent(owner_zalo_id);
    -- minimal messages table (must carry sent_by, like the migration adds)
    CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, msg_id TEXT NOT NULL, owner_zalo_id TEXT NOT NULL,
        thread_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', timestamp INTEGER NOT NULL,
        sent_by TEXT
    );
    """)
    return con

# ─── Replicate DatabaseService chat-agent CRUD ──────────────────────────────
def save_chat_agent(con, a):
    now = int(time.time() * 1000)
    if a.get("id"):
        con.execute(
            "UPDATE chat_agent SET name=?, assistant_id=?, enabled=?, reply_mode=?, is_default=?, default_scope_dm=?, default_scope_group=?, default_stranger_only=?, autopause_on_human=?, autoresume_minutes=?, allow_manual_toggle=?, updated_at=? WHERE id=? AND owner_zalo_id=?",
            [a["name"], a.get("assistant_id",""), a.get("enabled",0), a.get("reply_mode","auto"), a.get("is_default",0),
             a.get("default_scope_dm",0), a.get("default_scope_group",0), a.get("default_stranger_only",0),
             a.get("autopause_on_human",1), a.get("autoresume_minutes",0), a.get("allow_manual_toggle",1), now, a["id"], a["owner_zalo_id"]])
        aid = a["id"]
    else:
        cur = con.execute(
            "INSERT INTO chat_agent (owner_zalo_id, name, assistant_id, enabled, reply_mode, is_default, default_scope_dm, default_scope_group, default_stranger_only, autopause_on_human, autoresume_minutes, allow_manual_toggle, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [a["owner_zalo_id"], a["name"], a.get("assistant_id",""), a.get("enabled",0), a.get("reply_mode","auto"), a.get("is_default",0),
             a.get("default_scope_dm",0), a.get("default_scope_group",0), a.get("default_stranger_only",0),
             a.get("autopause_on_human",1), a.get("autoresume_minutes",0), a.get("allow_manual_toggle",1), now, now])
        aid = cur.lastrowid
    con.execute("DELETE FROM chat_agent_thread WHERE chat_agent_id=?", [aid])
    for t in (a.get("thread_ids") or []):
        con.execute("INSERT OR IGNORE INTO chat_agent_thread (chat_agent_id, owner_zalo_id, thread_id, thread_type) VALUES (?,?,?,?)", [aid, a["owner_zalo_id"], t, 1])
    con.execute("DELETE FROM chat_agent_label WHERE chat_agent_id=?", [aid])
    for l in (a.get("label_ids") or []):
        con.execute("INSERT OR IGNORE INTO chat_agent_label (chat_agent_id, label_id) VALUES (?,?)", [aid, l])
    con.commit()
    return aid

def get_chat_agent(con, aid):
    row = con.execute("SELECT * FROM chat_agent WHERE id=?", [aid]).fetchone()
    if not row: return None
    a = dict(row)
    a["thread_ids"] = [r[0] for r in con.execute("SELECT thread_id FROM chat_agent_thread WHERE chat_agent_id=?", [aid])]
    a["label_ids"]  = [r[0] for r in con.execute("SELECT label_id FROM chat_agent_label WHERE chat_agent_id=?", [aid])]
    return a

def delete_chat_agent(con, aid):
    con.execute("DELETE FROM chat_agent_thread WHERE chat_agent_id=?", [aid])
    con.execute("DELETE FROM chat_agent_label WHERE chat_agent_id=?", [aid])
    con.execute("DELETE FROM chat_agent WHERE id=?", [aid])
    con.execute("UPDATE conversation_ai_state SET pinned_agent_id=NULL WHERE pinned_agent_id=?", [aid])
    con.commit()

def get_conv_state(con, zalo, thread):
    row = con.execute("SELECT * FROM conversation_ai_state WHERE owner_zalo_id=? AND thread_id=?", [zalo, thread]).fetchone()
    return dict(row) if row else None

def set_conv_state(con, zalo, thread, patch):
    now = int(time.time()*1000)
    cur = get_conv_state(con, zalo, thread)
    merged = {
        "paused":          patch.get("paused",          (cur or {}).get("paused", 0)),
        "paused_reason":   patch.get("paused_reason",   (cur or {}).get("paused_reason", "")),
        "paused_at":       patch.get("paused_at",       (cur or {}).get("paused_at", 0)),
        "pinned_agent_id": patch["pinned_agent_id"] if "pinned_agent_id" in patch else (cur or {}).get("pinned_agent_id", None),
    }
    if cur:
        con.execute("UPDATE conversation_ai_state SET paused=?, paused_reason=?, paused_at=?, pinned_agent_id=?, updated_at=? WHERE owner_zalo_id=? AND thread_id=?",
                    [merged["paused"], merged["paused_reason"], merged["paused_at"], merged["pinned_agent_id"], now, zalo, thread])
    else:
        con.execute("INSERT INTO conversation_ai_state (owner_zalo_id, thread_id, paused, paused_reason, paused_at, pinned_agent_id, updated_at) VALUES (?,?,?,?,?,?,?)",
                    [zalo, thread, merged["paused"], merged["paused_reason"], merged["paused_at"], merged["pinned_agent_id"], now])
    con.commit()

# ═══════════════════════════════════════════════════════════════════════════════
print("\n── TC-01  Create chat agent round-trip (threads + labels) ──────────────")
c = fresh_mem()
aid = save_chat_agent(c, {"owner_zalo_id":"z1","name":"CA1","enabled":1,"reply_mode":"auto",
                          "thread_ids":["t1","t2"],"label_ids":[10,20]})
ag = get_chat_agent(c, aid)
if sorted(ag["thread_ids"]) == ["t1","t2"]: ok("TC-01 thread_ids round-trip")
else: fail("TC-01 thread_ids", f"got {ag['thread_ids']}")
if sorted(ag["label_ids"]) == [10,20]: ok("TC-01 label_ids round-trip")
else: fail("TC-01 label_ids", f"got {ag['label_ids']}")
if ag["reply_mode"] == "auto" and ag["autopause_on_human"] == 1 and ag["allow_manual_toggle"] == 1:
    ok("TC-01 defaults preserved (reply_mode/autopause/manual_toggle)")
else: fail("TC-01 defaults", f"got {dict(ag)}")

print("\n── TC-02  Edit agent — links replaced (old cleared, new written) ───────")
save_chat_agent(c, {"id":aid,"owner_zalo_id":"z1","name":"CA1-edit","thread_ids":["t9"],"label_ids":[99]})
ag2 = get_chat_agent(c, aid)
if ag2["thread_ids"] == ["t9"] and ag2["label_ids"] == [99] and ag2["name"] == "CA1-edit":
    ok("TC-02 links + name replaced on edit")
else: fail("TC-02 edit", f"threads={ag2['thread_ids']} labels={ag2['label_ids']} name={ag2['name']}")

print("\n── TC-03  setChatAgentEnabled toggles enabled flag ─────────────────────")
c.execute("UPDATE chat_agent SET enabled=0, updated_at=? WHERE id=?", [int(time.time()*1000), aid]); c.commit()
if get_chat_agent(c, aid)["enabled"] == 0: ok("TC-03 disabled")
else: fail("TC-03 disable", "enabled != 0")
c.execute("UPDATE chat_agent SET enabled=1, updated_at=? WHERE id=?", [int(time.time()*1000), aid]); c.commit()
if get_chat_agent(c, aid)["enabled"] == 1: ok("TC-03 re-enabled")
else: fail("TC-03 enable", "enabled != 1")

print("\n── TC-04  listEnabledChatAgents returns only enabled + with links ──────")
c4 = fresh_mem()
e1 = save_chat_agent(c4, {"owner_zalo_id":"z1","name":"on","enabled":1,"thread_ids":["a"],"label_ids":[1]})
save_chat_agent(c4, {"owner_zalo_id":"z1","name":"off","enabled":0,"thread_ids":["b"]})
save_chat_agent(c4, {"owner_zalo_id":"z2","name":"other-acct","enabled":1,"thread_ids":["c"]})
rows = c4.execute("SELECT * FROM chat_agent WHERE owner_zalo_id=? AND enabled=1 ORDER BY id", ["z1"]).fetchall()
if len(rows) == 1 and rows[0]["id"] == e1: ok("TC-04 only enabled rows for this account")
else: fail("TC-04 enabled filter", f"got {len(rows)} rows")

print("\n── TC-05  Delete agent cascade — links gone, pin set NULL ──────────────")
c5 = fresh_mem()
d = save_chat_agent(c5, {"owner_zalo_id":"z1","name":"del","thread_ids":["x","y"],"label_ids":[5]})
# pin a conversation to this agent first
set_conv_state(c5, "z1", "conv1", {"pinned_agent_id": d})
delete_chat_agent(c5, d)
gone = get_chat_agent(c5, d)
th = c5.execute("SELECT COUNT(*) FROM chat_agent_thread WHERE chat_agent_id=?", [d]).fetchone()[0]
lb = c5.execute("SELECT COUNT(*) FROM chat_agent_label WHERE chat_agent_id=?", [d]).fetchone()[0]
pin = get_conv_state(c5, "z1", "conv1")["pinned_agent_id"]
if gone is None and th == 0 and lb == 0 and pin is None:
    ok("TC-05 delete cascades + pin cleared (state row kept)")
else: fail("TC-05 delete cascade", f"agent={gone} threads={th} labels={lb} pin={pin}")

print("\n── TC-06  conversation_ai_state upsert (insert then update) ────────────")
c6 = fresh_mem()
set_conv_state(c6, "z1", "tA", {"paused":1,"paused_reason":"human","paused_at":111})
s1 = get_conv_state(c6, "z1", "tA")
ok_insert = s1 and s1["paused"] == 1 and s1["paused_reason"] == "human" and s1["paused_at"] == 111
# partial update — should keep paused_reason, change paused
set_conv_state(c6, "z1", "tA", {"paused":0})
s2 = get_conv_state(c6, "z1", "tA")
ok_update = s2["paused"] == 0 and s2["paused_reason"] == "human"
cnt = c6.execute("SELECT COUNT(*) FROM conversation_ai_state WHERE owner_zalo_id=? AND thread_id=?", ["z1","tA"]).fetchone()[0]
if ok_insert and ok_update and cnt == 1:
    ok("TC-06 upsert (1 row, partial patch merges)")
else: fail("TC-06 upsert", f"insert={ok_insert} update={ok_update} rows={cnt}")

print("\n── TC-07  countMessagesOfThread (first-message detection) ──────────────")
c7 = fresh_mem()
n0 = c7.execute("SELECT COUNT(*) AS n FROM messages WHERE owner_zalo_id=? AND thread_id=?", ["z1","tX"]).fetchone()["n"]
c7.execute("INSERT INTO messages (msg_id, owner_zalo_id, thread_id, content, timestamp, sent_by) VALUES (?,?,?,?,?,?)",
           ["m1","z1","tX","hi",1,"user"])
c7.commit()
n1 = c7.execute("SELECT COUNT(*) AS n FROM messages WHERE owner_zalo_id=? AND thread_id=?", ["z1","tX"]).fetchone()["n"]
if n0 == 0 and n1 == 1: ok("TC-07 count 0 -> 1 (first message detectable)")
else: fail("TC-07 count", f"n0={n0} n1={n1}")

print("\n── TC-08  sent_by column exists on messages ────────────────────────────")
c8 = fresh_mem()
cols = [r["name"] for r in c8.execute("PRAGMA table_info(messages)")]
if "sent_by" in cols:
    c8.execute("INSERT INTO messages (msg_id, owner_zalo_id, thread_id, content, timestamp, sent_by) VALUES (?,?,?,?,?,?)",
               ["m1","z1","t1","x",1,"agent:5"]); c8.commit()
    v = c8.execute("SELECT sent_by FROM messages WHERE msg_id=?", ["m1"]).fetchone()["sent_by"]
    if v == "agent:5": ok("TC-08 sent_by writable + readable")
    else: fail("TC-08 sent_by value", f"got {v}")
else:
    fail("TC-08 sent_by", "column missing")

# ── SUMMARY ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for r,_ in results if r == "PASS")
failed = sum(1 for r,_ in results if r == "FAIL")
print(f"TOTAL: {passed} PASS / {failed} FAIL out of {len(results)}")
if failed:
    print("FAILED tests:")
    for r,n in results:
        if r == "FAIL": print(f"  - {n}")
sys.exit(0 if failed == 0 else 1)
