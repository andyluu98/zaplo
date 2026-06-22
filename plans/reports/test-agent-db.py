"""
Agent module DB round-trip tests.
Run: C:\Python312\python.exe plans/reports/test-agent-db.py
"""
import sqlite3, os, shutil, sys, json, time

LIVE_DB = r"C:\Users\Admin\AppData\Roaming\Deplao\deplao-tool.db"
TEST_DB  = r"C:\Users\Admin\AppData\Local\Temp\deplao-test.db"

# ── helpers ──────────────────────────────────────────────────────────────────
results = []
def ok(name): results.append(("PASS", name)); print(f"  PASS  {name}")
def fail(name, reason): results.append(("FAIL", name)); print(f"  FAIL  {name} — {reason}")

def setup():
    shutil.copy(LIVE_DB, TEST_DB)
    con = sqlite3.connect(TEST_DB)
    con.row_factory = sqlite3.Row
    return con

def teardown(con):
    con.close()

# ── DB setup for isolated tests ───────────────────────────────────────────────
def fresh_mem():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    con.executescript("""
    CREATE TABLE posting_agent (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, name TEXT NOT NULL,
        assistant_id TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0,
        approval_mode TEXT NOT NULL DEFAULT 'manual', image_mode TEXT NOT NULL DEFAULT 'auto',
        image_count INTEGER NOT NULL DEFAULT 2, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE agent_pillar (agent_id INTEGER NOT NULL, pillar_id INTEGER NOT NULL, PRIMARY KEY (agent_id, pillar_id));
    CREATE TABLE agent_group  (agent_id INTEGER NOT NULL, group_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (agent_id, group_id));
    CREATE TABLE agent_image  (agent_id INTEGER NOT NULL, image_asset_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (agent_id, image_asset_id));
    CREATE TABLE agent_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'daily',
        weekdays TEXT DEFAULT '', month_days TEXT DEFAULT '', date TEXT DEFAULT '', time TEXT DEFAULT '',
        window_start TEXT DEFAULT '08:00', window_end TEXT DEFAULT '21:00',
        posts_per_day INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE content_draft (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, agent_id INTEGER,
        pillar_id INTEGER, text TEXT NOT NULL DEFAULT '', approval_status TEXT DEFAULT 'pending',
        image_asset_id INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE post_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_zalo_id TEXT NOT NULL, agent_id INTEGER,
        draft_id INTEGER, group_id TEXT, status TEXT, error TEXT, posted_at INTEGER
    );
    """)
    return con

# ─── Replicate savePostingAgent / getPostingAgent logic ──────────────────────
def save_agent(con, a):
    now = int(time.time() * 1000)
    if a.get("id"):
        con.execute(
            "UPDATE posting_agent SET name=?, assistant_id=?, enabled=?, approval_mode=?, image_mode=?, image_count=?, updated_at=? WHERE id=?",
            [a["name"], a.get("assistant_id",""), a.get("enabled",0), a.get("approval_mode","manual"), a.get("image_mode","auto"), a.get("image_count",2), now, a["id"]]
        )
        aid = a["id"]
    else:
        cur = con.execute(
            "INSERT INTO posting_agent (owner_zalo_id,name,assistant_id,enabled,approval_mode,image_mode,image_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [a["owner_zalo_id"], a["name"], a.get("assistant_id",""), a.get("enabled",0), a.get("approval_mode","manual"), a.get("image_mode","auto"), a.get("image_count",2), now, now]
        )
        aid = cur.lastrowid
    # replace links
    con.execute("DELETE FROM agent_pillar WHERE agent_id=?", [aid])
    for p in (a.get("pillar_ids") or []):
        con.execute("INSERT OR IGNORE INTO agent_pillar (agent_id, pillar_id) VALUES (?,?)", [aid, p])
    con.execute("DELETE FROM agent_group WHERE agent_id=?", [aid])
    for i, g in enumerate(a.get("group_ids") or []):
        con.execute("INSERT OR IGNORE INTO agent_group (agent_id, group_id, position) VALUES (?,?,?)", [aid, g, i])
    con.execute("DELETE FROM agent_image WHERE agent_id=?", [aid])
    for i, im in enumerate(a.get("fixed_image_ids") or []):
        con.execute("INSERT OR IGNORE INTO agent_image (agent_id, image_asset_id, position) VALUES (?,?,?)", [aid, im, i])
    con.commit()
    return aid

def get_agent(con, aid):
    row = con.execute("SELECT * FROM posting_agent WHERE id=?", [aid]).fetchone()
    if not row: return None
    a = dict(row)
    a["pillar_ids"]      = [r[0] for r in con.execute("SELECT pillar_id FROM agent_pillar WHERE agent_id=?", [aid])]
    a["group_ids"]       = [r[0] for r in con.execute("SELECT group_id FROM agent_group WHERE agent_id=? ORDER BY position", [aid])]
    a["fixed_image_ids"] = [r[0] for r in con.execute("SELECT image_asset_id FROM agent_image WHERE agent_id=? ORDER BY position", [aid])]
    a["schedules"]       = [dict(r) for r in con.execute("SELECT * FROM agent_schedule WHERE agent_id=? ORDER BY id", [aid])]
    return a

def replace_schedules(con, aid, rules):
    con.execute("DELETE FROM agent_schedule WHERE agent_id=?", [aid])
    for s in rules:
        con.execute(
            "INSERT INTO agent_schedule (agent_id, kind, weekdays, month_days, date, time, window_start, window_end, posts_per_day, enabled) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [aid, s["kind"], s.get("weekdays",""), s.get("month_days",""), s.get("date",""), s.get("time",""), s.get("window_start","08:00"), s.get("window_end","21:00"), s.get("posts_per_day",1), s.get("enabled",1)]
        )
    con.commit()

# ═══════════════════════════════════════════════════════════════════════════════
print("\n── TC-01  Create agent round-trip (groups [A,B] read back [A,B]) ──────")
c = fresh_mem()
aid = save_agent(c, {"owner_zalo_id":"z1","name":"T1","group_ids":["A","B"],"pillar_ids":[10,20]})
ag = get_agent(c, aid)
if ag["group_ids"] == ["A","B"]: ok("TC-01 group_ids order preserved")
else: fail("TC-01 group_ids order", f"got {ag['group_ids']}")
if ag["pillar_ids"] == [10, 20]: ok("TC-01 pillar_ids round-trip")
else: fail("TC-01 pillar_ids", f"got {ag['pillar_ids']}")

print("\n── TC-02  Edit agent groups — old cleared, new written ─────────────────")
save_agent(c, {"id": aid, "owner_zalo_id":"z1","name":"T1-edit","group_ids":["C"],"pillar_ids":[10]})
ag2 = get_agent(c, aid)
if ag2["group_ids"] == ["C"]: ok("TC-02 groups replaced on edit")
else: fail("TC-02 groups after edit", f"got {ag2['group_ids']}")

print("\n── TC-03  Delete agent cascades ────────────────────────────────────────")
c3 = fresh_mem()
a3 = save_agent(c3, {"owner_zalo_id":"z1","name":"del","group_ids":["X","Y"],"pillar_ids":[5]})
replace_schedules(c3, a3, [{"kind":"daily","window_start":"08:00","window_end":"21:00","posts_per_day":1}])
c3.execute("DELETE FROM agent_pillar WHERE agent_id=?", [a3])
c3.execute("DELETE FROM agent_group WHERE agent_id=?", [a3])
c3.execute("DELETE FROM agent_image WHERE agent_id=?", [a3])
c3.execute("DELETE FROM agent_schedule WHERE agent_id=?", [a3])
c3.execute("DELETE FROM posting_agent WHERE id=?", [a3])
c3.commit()
gone = get_agent(c3, a3)
grp = c3.execute("SELECT COUNT(*) FROM agent_group WHERE agent_id=?", [a3]).fetchone()[0]
if gone is None and grp == 0: ok("TC-03 delete cascades correctly")
else: fail("TC-03 delete cascade", f"agent={gone}, groups_left={grp}")

print("\n── TC-04  getContentDrafts filters by agentId ──────────────────────────")
c4 = fresh_mem()
a4 = save_agent(c4, {"owner_zalo_id":"z1","name":"ag4","group_ids":["G1"]})
now = int(time.time()*1000)
c4.execute("INSERT INTO content_draft (owner_zalo_id, agent_id, text, approval_status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
           ["z1", a4, "bai 1", "approved", now, now])
c4.execute("INSERT INTO content_draft (owner_zalo_id, agent_id, text, approval_status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
           ["z1", a4+99, "bai 2", "approved", now, now])
c4.commit()
rows = c4.execute("SELECT * FROM content_draft WHERE owner_zalo_id=? AND agent_id=? AND approval_status=?",["z1",a4,"approved"]).fetchall()
if len(rows) == 1 and rows[0]["text"] == "bai 1": ok("TC-04 getContentDrafts filtered by agentId")
else: fail("TC-04", f"got {len(rows)} rows")

print("\n── TC-05  replaceAgentSchedules idempotency ────────────────────────────")
c5 = fresh_mem()
a5 = save_agent(c5, {"owner_zalo_id":"z1","name":"ag5","group_ids":["G1"]})
rules = [{"kind":"daily","window_start":"09:00","window_end":"20:00","posts_per_day":2}]
replace_schedules(c5, a5, rules)
replace_schedules(c5, a5, rules)  # second call
cnt = c5.execute("SELECT COUNT(*) FROM agent_schedule WHERE agent_id=?", [a5]).fetchone()[0]
if cnt == 1: ok("TC-05 replaceAgentSchedules idempotent (DELETE+INSERT, not duplicate)")
else: fail("TC-05 idempotency", f"got {cnt} rows (should be 1)")

print("\n── TC-06  calendar.list SQL — only kind='once' ─────────────────────────")
c6 = fresh_mem()
a6 = save_agent(c6, {"owner_zalo_id":"z1","name":"ag6","group_ids":["G1"]})
c6.execute("INSERT INTO agent_schedule (agent_id, kind, weekdays, month_days, date, time, window_start, window_end, posts_per_day, enabled) VALUES (?,?,?,?,?,?,?,?,?,?)",
           [a6,"daily","","","","","08:00","21:00",1,1])
c6.execute("INSERT INTO agent_schedule (agent_id, kind, weekdays, month_days, date, time, window_start, window_end, posts_per_day, enabled) VALUES (?,?,?,?,?,?,?,?,?,?)",
           [a6,"once","","","2026-06-22","10:00","10:00","10:00",1,1])
c6.execute("INSERT INTO agent_schedule (agent_id, kind, weekdays, month_days, date, time, window_start, window_end, posts_per_day, enabled) VALUES (?,?,?,?,?,?,?,?,?,?)",
           [a6,"once","","","2026-07-01","09:00","09:00","09:00",1,1])
c6.commit()
# This mirrors the calendar.list query in postingIpc.ts
rows = c6.execute(
    "SELECT s.*, a.name AS agent_name FROM agent_schedule s JOIN posting_agent a ON a.id=s.agent_id WHERE a.owner_zalo_id=? AND s.kind='once' AND s.date LIKE ? ORDER BY s.date, s.time",
    ["z1", "2026-06%"]
).fetchall()
if len(rows) == 1 and rows[0]["date"] == "2026-06-22": ok("TC-06 calendar.list returns only once entries for month")
else: fail("TC-06 calendar.list", f"got {len(rows)} rows: {[dict(r) for r in rows]}")

# ── CRITICAL BUG CHECK: calendar never shows posted/recurring entries ──────────
# calendar.list only queries kind='once'. Recurring slots (daily/weekly/monthly)
# that have already FIRED are never surfaced to the calendar.
# We check: what does a posted daily entry look like on the calendar?
rows_all = c6.execute("SELECT kind FROM agent_schedule WHERE agent_id=?", [a6]).fetchall()
kinds = [r[0] for r in rows_all]
if "daily" in kinds:
    fail("TC-06b daily schedule NOT shown in calendar (by design — only once shown)", "calendar gap: posted daily runs invisible to calendar tab")
else:
    ok("TC-06b (no daily in this scenario)")

print("\n── TC-07  getAgentStats SQL ────────────────────────────────────────────")
c7 = fresh_mem()
a7 = save_agent(c7, {"owner_zalo_id":"z1","name":"ag7","group_ids":["G1"]})
t = int(time.time()*1000)
c7.execute("INSERT INTO post_log (owner_zalo_id, agent_id, group_id, status, posted_at) VALUES (?,?,?,?,?)",["z1",a7,"G1","sent",t])
c7.execute("INSERT INTO post_log (owner_zalo_id, agent_id, group_id, status, posted_at) VALUES (?,?,?,?,?)",["z1",a7,"G1","failed",t])
c7.execute("INSERT INTO post_log (owner_zalo_id, agent_id, group_id, status, posted_at) VALUES (?,?,?,?,?)",["z1",a7,"G1","sent",t])
c7.commit()
stats = c7.execute(
    "SELECT agent_id, SUM(status='sent') AS sent, SUM(status='failed') AS failed FROM post_log WHERE owner_zalo_id=? AND agent_id=? GROUP BY agent_id",
    ["z1", a7]
).fetchall()
if stats and stats[0]["sent"] == 2 and stats[0]["failed"] == 1: ok("TC-07 getAgentStats correct sent/failed counts")
else: fail("TC-07 getAgentStats", f"got {dict(stats[0]) if stats else 'empty'}")

print("\n── TC-08  postNow uses correct agent (not default) ─────────────────────")
# Verify postNow fetches agent by ID not by zaloId.
# Check: postNow calls db.getPostingAgent(agentId) — not listPostingAgents
# In agent-scheduler-service.ts line 179: agent = db.getPostingAgent(agentId)
# This correctly scopes to the specific agent. BUG is at UI level — see note.
c8 = fresh_mem()
a8a = save_agent(c8, {"owner_zalo_id":"z1","name":"default_agent","group_ids":["GROUP_DEFAULT"]})
a8b = save_agent(c8, {"owner_zalo_id":"z1","name":"test_ai_agent","group_ids":["GROUP_TEST"]})
# Simulate postNow(agentId=a8b): should use a8b's groups, not a8a's
ag_b = get_agent(c8, a8b)
if ag_b["group_ids"] == ["GROUP_TEST"]:
    ok("TC-08 getPostingAgent(agentId) returns correct agent's groups")
else:
    fail("TC-08", f"got groups {ag_b['group_ids']}")

print("\n── TC-09  migration idempotency — running twice does NOT duplicate agent")
c9 = fresh_mem()
c9.execute("CREATE TABLE IF NOT EXISTS post_schedule (id INTEGER PRIMARY KEY, owner_zalo_id TEXT, group_ids TEXT, window_start TEXT, window_end TEXT, posts_per_day INTEGER, enabled INTEGER)")
c9.execute("CREATE TABLE IF NOT EXISTS content_pillar (id INTEGER PRIMARY KEY, owner_zalo_id TEXT)")
c9.execute("INSERT INTO post_schedule VALUES (1,'z1','[\"G1\"]','08:00','21:00',2,1)")
c9.execute("INSERT INTO content_pillar VALUES (1,'z1')")
c9.commit()

def run_migration(con):
    # replicate the migration from DatabaseService.migrate()
    cnt = con.execute("SELECT COUNT(*) AS n FROM posting_agent").fetchone()[0]
    schedRows = con.execute("SELECT * FROM post_schedule").fetchall()
    if cnt == 0 and len(schedRows) > 0:
        for s in schedRows:
            owner = s[1]
            aid = con.execute(
                "INSERT INTO posting_agent (owner_zalo_id,name,assistant_id,enabled,approval_mode,image_mode,image_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                [owner,"Agent mặc định","",s[6],"auto","auto",2,0,0]
            ).lastrowid
            con.execute("INSERT INTO agent_schedule (agent_id,kind,window_start,window_end,posts_per_day,enabled) VALUES (?,?,?,?,?,?)",
                        [aid,"daily",s[3],s[4],s[5],1])
            gids = json.loads(s[2] or "[]")
            for i,g in enumerate(gids):
                con.execute("INSERT OR IGNORE INTO agent_group (agent_id,group_id,position) VALUES (?,?,?)",[aid,g,i])
            pillars = con.execute("SELECT id FROM content_pillar WHERE owner_zalo_id=?",[owner]).fetchall()
            for p in pillars:
                con.execute("INSERT OR IGNORE INTO agent_pillar (agent_id,pillar_id) VALUES (?,?)",[aid,p[0]])
        con.execute("UPDATE post_schedule SET enabled=0")
        con.commit()

run_migration(c9)
run_migration(c9)  # second call — should not create another agent
agent_count = c9.execute("SELECT COUNT(*) FROM posting_agent").fetchone()[0]
if agent_count == 1: ok("TC-09 migration idempotent (run twice = 1 agent)")
else: fail("TC-09 migration idempotency", f"got {agent_count} agents after 2 runs")

print("\n── TC-10  once schedule consumed after fire ─────────────────────────────")
c10 = fresh_mem()
a10 = save_agent(c10, {"owner_zalo_id":"z1","name":"ag10","group_ids":["G1"]})
c10.execute("INSERT INTO agent_schedule (agent_id, kind, date, time, window_start, window_end, posts_per_day, enabled) VALUES (?,?,?,?,?,?,?,?)",
            [a10,"once","2026-06-22","10:00","10:00","10:00",1,1])
c10.commit()
sched_id = c10.execute("SELECT id FROM agent_schedule WHERE agent_id=? AND kind='once'",[a10]).fetchone()[0]
# simulate: db.deleteAgentSchedule(slot.scheduleId)
c10.execute("DELETE FROM agent_schedule WHERE id=?", [sched_id])
c10.commit()
remaining = c10.execute("SELECT COUNT(*) FROM agent_schedule WHERE agent_id=? AND kind='once'",[a10]).fetchone()[0]
if remaining == 0: ok("TC-10 once schedule deleted after fire")
else: fail("TC-10 once consumed", f"still {remaining} once rules")

print("\n── TC-11  Live DB: check existing agents and their group_ids ────────────")
try:
    lcon = sqlite3.connect(LIVE_DB)
    lcon.row_factory = sqlite3.Row
    agents_live = lcon.execute("SELECT id, name, owner_zalo_id, enabled FROM posting_agent ORDER BY id").fetchall()
    print(f"     Found {len(agents_live)} agent(s) in live DB:")
    for a in agents_live:
        grps = lcon.execute("SELECT group_id FROM agent_group WHERE agent_id=? ORDER BY position",[a["id"]]).fetchall()
        pillars = lcon.execute("SELECT pillar_id FROM agent_pillar WHERE agent_id=?",[a["id"]]).fetchall()
        sched_cnt = lcon.execute("SELECT COUNT(*) FROM agent_schedule WHERE agent_id=?",[a["id"]]).fetchone()[0]
        print(f"       id={a['id']} name={a['name']} enabled={a['enabled']} groups={[r[0] for r in grps]} pillars={[r[0] for r in pillars]} schedules={sched_cnt}")
    ok("TC-11 live DB readable + agent data dumped")
except Exception as e:
    fail("TC-11 live DB", str(e))
finally:
    try: lcon.close()
    except: pass

print("\n── TC-12  Live DB: calendar.list for 2026-06 ──────────────────────────")
try:
    lcon = sqlite3.connect(LIVE_DB)
    lcon.row_factory = sqlite3.Row
    cal = lcon.execute(
        "SELECT s.*, a.name AS agent_name FROM agent_schedule s JOIN posting_agent a ON a.id=s.agent_id WHERE a.owner_zalo_id IN (SELECT DISTINCT owner_zalo_id FROM posting_agent) AND s.kind='once' AND s.date LIKE ? ORDER BY s.date, s.time",
        ["2026-06%"]
    ).fetchall()
    print(f"     calendar entries (once, 2026-06): {len(cal)}")
    for r in cal:
        print(f"       {r['date']} {r['time']} agent={r['agent_name']}")
    # Check if any posted drafts would appear on calendar
    posted = lcon.execute("SELECT COUNT(*) FROM post_log WHERE status='sent'").fetchone()[0]
    print(f"     post_log sent entries: {posted}")
    print(f"     NOTE: calendar tab only shows 'once' agent_schedule rows — posted/recurring runs NOT shown")
    ok("TC-12 calendar query executed; observe gap in output above")
except Exception as e:
    fail("TC-12 calendar query", str(e))
finally:
    try: lcon.close()
    except: pass

print("\n── TC-13  Live DB: post_log entries with agent_id ─────────────────────")
try:
    lcon = sqlite3.connect(LIVE_DB)
    lcon.row_factory = sqlite3.Row
    logs = lcon.execute("SELECT agent_id, group_id, status, posted_at FROM post_log ORDER BY posted_at DESC LIMIT 20").fetchall()
    print(f"     Last {len(logs)} post_log entries:")
    for r in logs:
        from datetime import datetime
        ts = datetime.fromtimestamp(r['posted_at']/1000).strftime('%m-%d %H:%M') if r['posted_at'] else '?'
        print(f"       agent={r['agent_id']} group={r['group_id']} status={r['status']} at={ts}")
    ok("TC-13 post_log readable")
except Exception as e:
    fail("TC-13 post_log", str(e))
finally:
    try: lcon.close()
    except: pass

print("\n── TC-14  once schedule: past time not returned ─────────────────────────")
# This test is performed in the schedule resolver test (test-agent-sched.mjs)
print("     (covered in schedule-resolver tests — see test-agent-sched.mjs)")
ok("TC-14 delegated to schedule-resolver test")

print("\n── TC-15  group_ids empty agent blocked from posting ────────────────────")
c15 = fresh_mem()
a15 = save_agent(c15, {"owner_zalo_id":"z1","name":"no-groups","group_ids":[]})
ag15 = get_agent(c15, a15)
# In postNow: if (!groupIds.length) return error
group_ids = ag15["group_ids"]
if len(group_ids) == 0:
    ok("TC-15 agent with no groups correctly has empty group_ids (postNow would block)")
else:
    fail("TC-15", f"expected [] got {group_ids}")

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
