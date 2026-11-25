#!/usr/bin/env python3
"""graph_memory.py — Real-Time Active-Learning Graph Memory for R2 Fit.

Ported from the vlog-edits Thinker + Decision Graph architecture:
  - SQLite in WAL mode (graph_memory.sqlite) + append-only JSONL journal (graph_journal.jsonl)
  - Nodes, typed weighted Edges, Traffic Lights, Handoff Log, FTS5 recall
  - Jaccard duplicate/conflict detection on `think`
  - Confidence reinforcement, superseding upgrades, quarantine, and zero-poison `hygiene`
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOL_DIR.parents[1]
DB_PATH = TOOL_DIR / "graph_memory.sqlite"
JOURNAL_PATH = TOOL_DIR / "graph_journal.jsonl"

DEFAULT_PROJECT = "r2-fit"

STOP_WORDS = {
    "the", "a", "an", "and", "or", "for", "of", "in", "on", "to", "with", "from", "over",
    "di", "ke", "dari", "dan", "atau", "yang", "untuk", "buat", "dengan", "pada", "ini", "itu",
    "only", "non", "negotiable", "rule", "rules",
}

NEGATION_RE = re.compile(
    r"\b(never|jangan|not|no|do not|don't|forbid|forbidden|banned|ban|prohibit|avoid|hindari|dilarang|tanpa|exclude|block|stop|off|must not|cannot|can't|✗|❌|⛔)\b",
    re.I,
)


def _now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def _slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", text.lower()).strip("_")[:48] or "item"


def _norm_tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9\u4e00-\u9fff]+", text.lower())
        if len(t) >= 2 and t not in STOP_WORDS
    }


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _has_negation(text: str) -> bool:
    return bool(NEGATION_RE.search(text or ""))


def _fts_query(raw: str) -> str:
    toks = [
        t
        for t in re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", raw.lower())
        if len(t) >= 2 and t not in STOP_WORDS
    ]
    if not toks:
        return '""'
    return " OR ".join(f'"{t}"*' for t in toks[:12])


def _append_journal(event: dict) -> None:
    TOOL_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"ts": _now(), **event}
    with JOURNAL_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _connect_rw() -> sqlite3.Connection:
    TOOL_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 15000;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            agent TEXT NOT NULL,
            project TEXT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            confidence REAL DEFAULT 0.85,
            reinforcements INT DEFAULT 1,
            tags TEXT,
            metadata_json TEXT,
            superseded_by TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS edges (
            src TEXT NOT NULL,
            rel TEXT NOT NULL,
            dst TEXT NOT NULL,
            weight REAL DEFAULT 1.0,
            agent TEXT,
            note TEXT,
            created_at TEXT,
            PRIMARY KEY (src, rel, dst)
        );
        CREATE TABLE IF NOT EXISTS traffic_lights (
            agent TEXT PRIMARY KEY,
            light TEXT NOT NULL,
            project TEXT,
            task TEXT,
            waiting_on TEXT,
            note TEXT,
            updated_by TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS handoff_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project TEXT,
            from_agent TEXT,
            to_agent TEXT,
            turn_num INT,
            summary TEXT,
            artifact TEXT,
            created_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_gm_nodes ON nodes(kind, status, agent, project);
        CREATE INDEX IF NOT EXISTS idx_gm_edges_src ON edges(src, rel);
        CREATE INDEX IF NOT EXISTS idx_gm_edges_dst ON edges(dst, rel);
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
            id, kind, agent, project, title, content, tags
        );
        """
    )
    return conn


def _connect_ro() -> sqlite3.Connection | None:
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def _upsert_node(
    conn: sqlite3.Connection,
    *,
    nid: str,
    kind: str,
    agent: str,
    project: str,
    title: str,
    content: str,
    status: str = "active",
    confidence: float = 0.85,
    tags: str = "",
    metadata: dict | None = None,
    superseded_by: str | None = None,
    log_journal: bool = True,
) -> dict:
    now = _now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        prev = conn.execute(
            "SELECT created_at, reinforcements FROM nodes WHERE id = ?",
            (nid,),
        ).fetchone()
        created = prev["created_at"] if prev else now
        reinf = (int(prev["reinforcements"]) + 1) if prev else 1
        meta_str = json.dumps(metadata or {}, ensure_ascii=False)
        conn.execute(
            """
            INSERT INTO nodes(
                id, kind, agent, project, title, content, status, confidence,
                reinforcements, tags, metadata_json, superseded_by, created_at, updated_at
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                kind=excluded.kind,
                agent=excluded.agent,
                project=excluded.project,
                title=excluded.title,
                content=excluded.content,
                status=excluded.status,
                confidence=excluded.confidence,
                reinforcements=excluded.reinforcements,
                tags=excluded.tags,
                metadata_json=excluded.metadata_json,
                superseded_by=COALESCE(excluded.superseded_by, nodes.superseded_by),
                updated_at=excluded.updated_at
            """,
            (
                nid, kind, agent, project, title, content, status, confidence,
                reinf, tags, meta_str, superseded_by, created, now,
            ),
        )
        conn.execute("DELETE FROM nodes_fts WHERE id = ?", (nid,))
        conn.execute(
            "INSERT INTO nodes_fts(id, kind, agent, project, title, content, tags) VALUES (?,?,?,?,?,?,?)",
            (nid, kind, agent, project, title, content, tags),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    if log_journal:
        _append_journal({
            "op": "upsert_node",
            "id": nid,
            "kind": kind,
            "agent": agent,
            "project": project,
            "title": title,
            "status": status,
            "confidence": confidence,
        })
    return {
        "id": nid,
        "kind": kind,
        "agent": agent,
        "project": project,
        "title": title,
        "status": status,
        "reinforcements": reinf,
    }


def _upsert_edge(
    conn: sqlite3.Connection,
    *,
    src: str,
    rel: str,
    dst: str,
    agent: str,
    note: str = "",
    weight: float = 1.0,
    log_journal: bool = True,
) -> None:
    now = _now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            """
            INSERT INTO edges(src, rel, dst, weight, agent, note, created_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(src, rel, dst) DO UPDATE SET
                weight=excluded.weight,
                agent=excluded.agent,
                note=CASE WHEN length(excluded.note) >= length(edges.note) THEN excluded.note ELSE edges.note END
            """,
            (src, rel, dst, weight, agent, note, now),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    if log_journal:
        _append_journal({
            "op": "upsert_edge",
            "src": src,
            "rel": rel,
            "dst": dst,
            "weight": weight,
            "agent": agent,
            "note": note,
        })


def _detect_jaccard_conflicts(
    conn: sqlite3.Connection,
    *,
    title: str,
    content: str,
    ignore_ids: set[str],
    threshold: float = 0.55,
) -> list[dict]:
    src_title = _norm_tokens(title)
    src_full = _norm_tokens(f"{title} {content}")
    src_neg = _has_negation(f"{title} {content}")
    if not src_title:
        return []
    rows = conn.execute(
        """
        SELECT id, kind, title, content, status
        FROM nodes
        WHERE status IN ('active', 'staged_for_review')
          AND kind NOT IN ('agent_registry', 'deliverable')
        """
    ).fetchall()
    conflicts: list[dict] = []
    for r in rows:
        if r["id"] in ignore_ids:
            continue
        tgt_title = _norm_tokens(r["title"])
        tgt_full = _norm_tokens(f"{r['title']} {r['content']}")
        jac_title = _jaccard(src_title, tgt_title)
        jac_full = _jaccard(src_full, tgt_full)
        score = max(jac_title, jac_full)
        tgt_neg = _has_negation(f"{r['title']} {r['content']}")
        is_contradiction = score >= 0.38 and (src_neg != tgt_neg)
        if jac_title >= threshold or jac_full >= 0.65 or is_contradiction:
            conflicts.append({
                "id": r["id"],
                "kind": r["kind"],
                "title": r["title"],
                "jaccard_title": round(jac_title, 3),
                "jaccard_full": round(jac_full, 3),
                "contradiction": is_contradiction,
            })
    return conflicts


def seed_initial(conn: sqlite3.Connection) -> None:
    agents = [
        (
            "agent:orchestrator",
            "orchestrator",
            "R2 Fit Orchestrator",
            "Coordinates R2 Fit sprints, reviews PR/branch diffs, owns DB safety & production deploy approval.",
        ),
        (
            "agent:builder",
            "builder",
            "Sprint Builder",
            "Implements TypeScript/Next.js features, graph memory, Shadow Buttons, and food DB packs.",
        ),
        (
            "agent:verifier",
            "verifier",
            "Verification Guard",
            "Runs tsc, check-server-imports, validate-pack, searchEval, unit tests, and next build.",
        ),
    ]
    for nid, ag, title, cont in agents:
        _upsert_node(
            conn,
            nid=nid,
            kind="agent_registry",
            agent=ag,
            project=DEFAULT_PROJECT,
            title=title,
            content=cont,
            confidence=1.0,
            tags="agent registry r2fit",
        )

    domain_nodes = [
        # Conventions
        (
            "conv:nextjs_docs_first",
            "convention",
            "orchestrator",
            "Read node_modules/next/dist/docs/ Before Editing Next.js Code",
            "Next.js 16.3.8 in this repo has breaking API/conventions vs older Next versions (async cookies/headers/params, RouteContext). Always inspect node_modules/next/dist/docs/ before writing Next.js route handlers or app router code.",
            1.0,
            "nextjs convention docs agents.md",
        ),
        (
            "conv:server_import_guard",
            "convention",
            "orchestrator",
            "Never Import 'use client' Modules Into app/api/**",
            "scripts/check-server-imports.mjs fails build if any app/api/** route imports a lib/*.ts file starting with 'use client'. Pure domain/math engines (lib/habitGraph.ts, lib/burn.ts, lib/foodSearch.ts, lib/motivation.ts) MUST stay isomorphic without 'use client'; browser storage adapters go in *Data.ts / *Store.ts.",
            1.0,
            "server imports use-client api guard architecture",
        ),
        (
            "conv:per_user_scoped_storage",
            "convention",
            "orchestrator",
            "Scope All Browser Storage via scopedKey() & Use Asia/Shanghai todayKey()",
            "All localStorage keys in lib/ must route through scopedKey() from lib/userScope.ts so Richie and Renita never collide on shared devices. All date keys use YYYY-MM-DD in Asia/Shanghai via todayKey() from lib/targets.ts. Emit window 'r2:data' event on storage writes for soft refresh.",
            0.98,
            "localStorage scopedKey userScope todayKey timezone shanghai",
        ),
        (
            "conv:graceful_missing_table_fallback",
            "convention",
            "orchestrator",
            "Guard Optional Prisma Tables Against Unpushed Schema (isMissingRelationError)",
            "Never run prisma db push against live prod DB without explicit confirmation. Any new additive Prisma model (e.g. RoomVisit, HabitGraphState) MUST be guarded in API routes with isMissingRelationError (P2021/P2022 / undefined table) so the app degrades cleanly to localStorage until Richie pushes schema.",
            0.98,
            "prisma database safety fallback P2021 P2022 db-push",
        ),
        # Richie & Renita UX Goals
        (
            "ux:richie_profile_goals",
            "ux_goal",
            "orchestrator",
            "Richie UX Goal: Lean Recomp 2,200/1,700 kcal, 175g Protein, Hangzhou Campus & 5x Split",
            "Richie trains 5x/week (Mon/Tue/Thu/Fri/Sat: PUSH_A, PULL_A, LEGS, PUSH_B, PULL_B; rest Wed/Sun). Targets ~2,200 kcal gym / 1,700 rest + 175g protein. Eats campus cafeteria & delivery dishes (fanqie chaodan, malatang, pork cuts, Luckin/Chagee) + home staples (eggs, oats, whey, chicken breast).",
            0.98,
            "richie ux goal protein recomp campus hangzhou split",
        ),
        (
            "ux:renita_profile_goals",
            "ux_goal",
            "orchestrator",
            "Renita UX Goal: Glute-Priority Female Split, Calorie Balance & Partner Accountability",
            "Renita uses female_default glute-priority split (FEM_LOWER_A, FEM_UPPER_A, FEM_CARDIO, FEM_LOWER_B, FEM_UPPER_B, FEM_LOWER_C, optional FEM_ARMS, FEM_REST 8-10k steps) with sex-adjusted working weights (0.68x default ratio) and optional menstrual cycle tracking. Partner Room ('Intip') connects Richie and Renita live.",
            0.98,
            "renita ux goal female glute split partner intip",
        ),
        (
            "ux:shadow_buttons_1tap",
            "ux_goal",
            "orchestrator",
            "Tombol Bayangan UX: Translucent 1-Tap Checkmark, Quick Edit & Real-Time Learning",
            "Surface translucent ghost Shadow Buttons on Home, MealHome, Catat makan tray, and WorkoutHome predicting right-now meals/combos and workouts from the Habit Graph. 1-tap checkmark logs immediately with haptic/visual feedback and reinforces graph; Quick Edit tweaks portion/sets; Dismiss X dampens and applies cooldown.",
            0.96,
            "shadow buttons tombol bayangan 1-tap ux habit graph",
        ),
        # Workout Math Rules
        (
            "math:active_energy_only",
            "workout_math",
            "orchestrator",
            "Workout Burn Uses Active Energy Only (MET - 1) & Biomechanical Set Model",
            "lib/burn.ts computes ACTIVE kcal on top of resting (resting is already in daily target). Timed cardio uses max(0, MET - 1) * kg * hours. Resistance sets use mechanical work (totalMovedKg * g * romM * 1.35 / eta, eta=0.215 compound / 0.235 iso) + systemic TUT/rest metabolic cost + EPOC afterburn. Steps use 0.00039 * kg per step.",
            1.0,
            "workout math burn met active energy epoc biomechanics",
        ),
        (
            "math:eatback_and_apple_health",
            "workout_math",
            "orchestrator",
            "Daily Target Eat-Back (50% Default) & Apple Health Precedence in combineDay()",
            "lib/dayBudget.ts adds exerciseEatBack (default 0.5) of today's active burn to the daily calorie target. lib/healthImport.ts combineDay() gives Apple Health active energy precedence over estimated gym/activity sums so calories are never double-counted.",
            0.98,
            "dayBudget eatback apple health combineDay no double count",
        ),
        # Food Search & DB Pitfalls
        (
            "pitfall:food_search_client_vs_note",
            "food_pitfall",
            "orchestrator",
            "Client Food Search Only Indexes name, nameEn, aliases, foodGroup, cuisine (NOT 2nd note segment)",
            "app/api/foods/all and scripts/searchPool.ts ship name, nameEn (1st segment before middot when conf: present), aliases, foodGroup, and cuisine to lib/foodSearch.ts. The 2nd middot-segment of CSV note reaches Postgres searchText but NOT client search unless copied into the CSV `aliases` column! Always populate CSV `aliases` + `cuisine` for multilingual/pinyin/colloquial recall.",
            1.0,
            "food search pitfall aliases note searchPool client",
        ),
        (
            "pitfall:food_search_and_ranking_guards",
            "food_pitfall",
            "orchestrator",
            "Food Search Invariants: AND Semantics, Exact-Name Lock, Offal Sink & Cache Version",
            "lib/foodSearch.ts enforces AND across query tokens, exact-name lock, and ASCII normalize() (bridge CJK queries to pinyin/ID/EN before tokenizing). scripts/foodRanking.ts sinks offal/lard (-50/-45) and boosts STAPLES (+40). Always bump CACHE_KEY in lib/foodCatalogue.ts and RANKING_VERSION in scripts/seed-foods.ts when updating CSV packs.",
            0.98,
            "food search ranking invariants exact lock cache version",
        ),
        (
            "pitfall:csv_validation_null_and_facets",
            "food_pitfall",
            "orchestrator",
            "CSV Hygiene: Empty Cell Means NULL (Never 0), Atwater Parity & Facet Base Guards",
            "scripts/validate-pack.ts enforces zero duplicate codes, zero Atwater >30% errors, portions <=1500g, kcal <=900. Empty cells parse to null (unknown) vs literal '0'. scripts/foodGuard.test.ts requires 0 unplaced foods and <=8 facet-word bases; scripts/searchEval.test.ts requires every CSV in data/ to be registered in scripts/seed-foods.ts.",
            0.98,
            "csv validation atwater null facet guard seed-foods",
        ),
    ]

    for nid, kind, ag, title, cont, conf, tags in domain_nodes:
        _upsert_node(
            conn,
            nid=nid,
            kind=kind,
            agent=ag,
            project=DEFAULT_PROJECT,
            title=title,
            content=cont,
            confidence=conf,
            tags=tags,
        )

    edges = [
        ("conv:server_import_guard", "PROTECTS", "conv:nextjs_docs_first", "orchestrator", "API routes must stay server-pure"),
        ("conv:graceful_missing_table_fallback", "COMPLEMENTS", "conv:per_user_scoped_storage", "orchestrator", "Local-first storage survives unpushed tables"),
        ("ux:shadow_buttons_1tap", "SERVES", "ux:richie_profile_goals", "orchestrator", "Low-friction 1-tap meal & split tracking"),
        ("ux:shadow_buttons_1tap", "SERVES", "ux:renita_profile_goals", "orchestrator", "Adapts dynamically to female split & targets"),
        ("math:eatback_and_apple_health", "DEPENDS_ON", "math:active_energy_only", "orchestrator", "Eat-back consumes active burn total"),
        ("pitfall:food_search_client_vs_note", "INFORMS", "pitfall:food_search_and_ranking_guards", "orchestrator", "Aliases column feeds client BM25 recall"),
        ("pitfall:csv_validation_null_and_facets", "GATES", "pitfall:food_search_and_ranking_guards", "orchestrator", "Every data/*.csv must pass validate-pack + foodGuard"),
    ]
    for src, rel, dst, ag, note in edges:
        _upsert_edge(conn, src=src, rel=rel, dst=dst, agent=ag, note=note, weight=1.5)


def cmd_init(_args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        seed_initial(conn)
        cnt_n = conn.execute("SELECT count(*) FROM nodes").fetchone()[0]
        cnt_e = conn.execute("SELECT count(*) FROM edges").fetchone()[0]
        print(f"Initialized Graph Memory -> {DB_PATH} ({cnt_n} nodes, {cnt_e} edges)")
        return 0
    finally:
        conn.close()


def cmd_think(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        nid = args.id or f"{args.kind}:{args.agent}:{_slug(args.title)}"
        ignore = {nid}
        if args.supersede:
            ignore.add(args.supersede)

        if not args.force:
            conflicts = _detect_jaccard_conflicts(
                conn,
                title=args.title,
                content=args.content,
                ignore_ids=ignore,
                threshold=args.jaccard_threshold,
            )
            if conflicts:
                print(
                    json.dumps(
                        {
                            "blocked": True,
                            "reason": "Jaccard duplicate/conflict detected against active node(s). Pass --id <existing>, --supersede <old_id>, or --force to override.",
                            "conflicts": conflicts,
                        },
                        indent=2,
                        ensure_ascii=False,
                    )
                )
                return 2

        res = _upsert_node(
            conn,
            nid=nid,
            kind=args.kind,
            agent=args.agent,
            project=args.project or DEFAULT_PROJECT,
            title=args.title,
            content=args.content,
            status=args.status,
            confidence=args.confidence,
            tags=args.tags or "",
            metadata={"evidence": args.evidence} if args.evidence else None,
        )

        if args.supersede:
            old = conn.execute("SELECT id FROM nodes WHERE id = ?", (args.supersede,)).fetchone()
            if old:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    "UPDATE nodes SET status='superseded', superseded_by=?, updated_at=? WHERE id=?",
                    (nid, _now(), args.supersede),
                )
                conn.execute("COMMIT")
                _upsert_edge(conn, src=nid, rel="SUPERSEDES", dst=args.supersede, agent=args.agent, note=f"Superseded by {nid}", weight=2.0)

        if args.link_rel and args.link_to:
            _upsert_edge(conn, src=nid, rel=args.link_rel, dst=args.link_to, agent=args.agent, note=args.title)

        print(f"[Graph] Stored {res['id']} (kind={res['kind']}, agent={res['agent']}, status={res['status']}, reinf=x{res['reinforcements']})")
        return 0
    finally:
        conn.close()


def cmd_link(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        _upsert_edge(conn, src=args.src, rel=args.rel, dst=args.dst, agent=args.agent, note=args.note, weight=args.weight)
        print(f"[Graph] Linked {args.src} --{args.rel}--> {args.dst} (weight={args.weight})")
        return 0
    finally:
        conn.close()


def cmd_reinforce(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        row = conn.execute("SELECT * FROM nodes WHERE id = ?", (args.node_id,)).fetchone()
        if not row:
            raise SystemExit(f"Node not found: {args.node_id}")
        new_conf = min(1.0, round(float(row["confidence"]) + args.delta, 3))
        new_reinf = int(row["reinforcements"]) + 1
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "UPDATE nodes SET confidence=?, reinforcements=?, updated_at=? WHERE id=?",
            (new_conf, new_reinf, _now(), args.node_id),
        )
        conn.execute("COMMIT")
        if args.note:
            _upsert_edge(conn, src=f"agent:{args.agent}", rel="SUPPORTS", dst=args.node_id, agent=args.agent, note=args.note)
        _append_journal({
            "op": "reinforce",
            "id": args.node_id,
            "agent": args.agent,
            "confidence": new_conf,
            "reinforcements": new_reinf,
        })
        print(f"[Graph] Reinforced {args.node_id}: confidence={new_conf}, reinforcements=x{new_reinf}")
        return 0
    finally:
        conn.close()


def cmd_upgrade(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        old = conn.execute("SELECT * FROM nodes WHERE id = ?", (args.old,)).fetchone()
        if not old:
            raise SystemExit(f"Old node not found: {args.old}")
        new_id = args.new_id or f"upgraded:{_slug(args.title)}"
        _upsert_node(
            conn,
            nid=new_id,
            kind=old["kind"],
            agent=args.agent,
            project=old["project"] or DEFAULT_PROJECT,
            title=args.title,
            content=f"{args.content} | Upgrade reason: {args.reason}",
            status="active",
            confidence=max(float(old["confidence"]), 0.9),
            tags=f"{old['tags'] or ''} upgraded".strip(),
        )
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "UPDATE nodes SET status='superseded', superseded_by=?, updated_at=? WHERE id=?",
            (new_id, _now(), args.old),
        )
        conn.execute("COMMIT")
        _upsert_edge(conn, src=new_id, rel="SUPERSEDES", dst=args.old, agent=args.agent, note=args.reason, weight=3.0)
        _upsert_edge(conn, src=new_id, rel="UPGRADES", dst=args.old, agent=args.agent, note=args.reason, weight=3.0)
        _append_journal({"op": "upgrade", "old": args.old, "new": new_id, "agent": args.agent, "reason": args.reason})
        print(f"[Graph] Upgraded {args.old} -> {new_id}")
        return 0
    finally:
        conn.close()


def cmd_quarantine(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        row = conn.execute("SELECT * FROM nodes WHERE id = ?", (args.node_id,)).fetchone()
        if not row:
            print(f"[Graph] Node not found: {args.node_id}")
            return 2
        try:
            meta = json.loads(row["metadata_json"] or "{}")
        except Exception:
            meta = {}
        meta["quarantine_reason"] = args.reason
        meta["quarantined_by"] = args.by
        meta["quarantined_at"] = _now()
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "UPDATE nodes SET status=?, metadata_json=?, updated_at=? WHERE id=?",
            (args.status, json.dumps(meta, ensure_ascii=False), _now(), args.node_id),
        )
        conn.execute("COMMIT")
        _append_journal({
            "op": "quarantine",
            "id": args.node_id,
            "status": args.status,
            "by": args.by,
            "reason": args.reason,
        })
        print(f"[Graph] Quarantined {args.node_id} -> status={args.status} ({args.reason})")
        return 0
    finally:
        conn.close()


def _light_icon(light: str) -> str:
    return {"GREEN": "🟩 GREEN", "YELLOW": "🟨 YELLOW", "RED": "🟥 RED"}.get(light.upper(), light)


def cmd_signal(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        now = _now()
        if args.sig_cmd == "set":
            light = args.light.upper()
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO traffic_lights(agent, light, project, task, waiting_on, note, updated_by, updated_at)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(agent) DO UPDATE SET
                    light=excluded.light, project=excluded.project, task=excluded.task,
                    waiting_on=excluded.waiting_on, note=excluded.note,
                    updated_by=excluded.updated_by, updated_at=excluded.updated_at
                """,
                (args.agent, light, args.project, args.task, args.waiting_on or "", args.note or "", args.by, now),
            )
            conn.execute("COMMIT")
            _append_journal({"op": "signal_set", "agent": args.agent, "light": light, "project": args.project, "task": args.task})
            print(f"[Signal] {args.agent} -> {_light_icon(light)} ({args.task})")
            return 0

        if args.sig_cmd == "pass":
            pair_cnt = conn.execute(
                """
                SELECT COUNT(*) FROM handoff_log
                WHERE project=? AND ((from_agent=? AND to_agent=?) OR (from_agent=? AND to_agent=?))
                """,
                (args.project, args.from_agent, args.to_agent, args.to_agent, args.from_agent),
            ).fetchone()[0]
            turn_num = int(pair_cnt) + 1
            if turn_num > args.max_rounds:
                print(f"[ESCALATE] Handoff round {turn_num} > max_rounds={args.max_rounds} between {args.from_agent} <-> {args.to_agent}.")
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "INSERT INTO handoff_log(project, from_agent, to_agent, turn_num, summary, artifact, created_at) VALUES (?,?,?,?,?,?,?)",
                (args.project, args.from_agent, args.to_agent, turn_num, args.summary, args.artifact or "", now),
            )
            conn.execute(
                """
                INSERT INTO traffic_lights(agent, light, project, task, waiting_on, note, updated_by, updated_at)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(agent) DO UPDATE SET
                    light='RED', project=excluded.project, task=excluded.task, waiting_on=excluded.waiting_on,
                    note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at
                """,
                (args.from_agent, "RED", args.project, f"Baton passed -> {args.to_agent}", args.to_agent, args.summary, args.from_agent, now),
            )
            conn.execute(
                """
                INSERT INTO traffic_lights(agent, light, project, task, waiting_on, note, updated_by, updated_at)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(agent) DO UPDATE SET
                    light='GREEN', project=excluded.project, task=excluded.task,
                    waiting_on='', note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at
                """,
                (args.to_agent, "GREEN", args.project, f"Active Baton from {args.from_agent} (turn {turn_num})", "", args.summary, args.from_agent, now),
            )
            conn.execute("COMMIT")
            _append_journal({"op": "signal_pass", "project": args.project, "from": args.from_agent, "to": args.to_agent, "turn": turn_num, "summary": args.summary})
            print(f"[Baton Pass #{turn_num}] {args.from_agent} (RED) -> {args.to_agent} (GREEN) | {args.summary}")
            return 0

        if args.sig_cmd == "status":
            wq = "WHERE project=?" if args.project else ""
            wp = [args.project] if args.project else []
            rows = [
                dict(r)
                for r in conn.execute(
                    f"SELECT * FROM traffic_lights {wq} ORDER BY CASE light WHEN 'GREEN' THEN 0 WHEN 'YELLOW' THEN 1 ELSE 2 END, agent",
                    wp,
                ).fetchall()
            ]
            if args.json:
                print(json.dumps(rows, indent=2, ensure_ascii=False))
            else:
                print("=== GRAPH TRAFFIC LIGHTS ===")
                if not rows:
                    print("  (none set yet)")
                for r in rows:
                    wait_str = f" | waiting_on={r['waiting_on']}" if r["waiting_on"] else ""
                    print(f"  {_light_icon(r['light']):12s} {r['agent']:14s} | {r['task']}{wait_str}")
            return 0
        return 1
    finally:
        conn.close()


def cmd_recall(args: argparse.Namespace) -> int:
    conn = _connect_ro()
    if not conn:
        raise SystemExit("Graph DB not initialized. Run `graph_memory.py init` first.")
    try:
        fts = _fts_query(args.query)
        where = [] if args.include_superseded else ["n.status NOT IN ('superseded', 'quarantined', 'resolved', 'rejected')"]
        params: list = []
        if args.agent:
            where.append("n.agent = ?")
            params.append(args.agent)
        if args.project:
            where.append("n.project = ?")
            params.append(args.project)
        if args.kind:
            where.append("n.kind = ?")
            params.append(args.kind)
        wsql = (" AND " + " AND ".join(where)) if where else ""

        rows: list[dict] = []
        if fts != '""':
            sql = f"""
                SELECT n.*,
                       (n.confidence * (1.0 + 0.15 * n.reinforcements)) AS rank_boost
                FROM nodes_fts f
                JOIN nodes n ON n.id = f.id
                WHERE nodes_fts MATCH ? {wsql}
                ORDER BY rank_boost DESC, bm25(nodes_fts)
                LIMIT ?
            """
            rows = [dict(r) for r in conn.execute(sql, [fts, *params, args.limit]).fetchall()]

        if not rows and args.query.strip():
            like = f"%{args.query.strip().lower()}%"
            w_like = " AND ".join(["(lower(n.title) LIKE ? OR lower(n.content) LIKE ? OR lower(n.tags) LIKE ?)"] + where)
            sql = f"""
                SELECT n.*, (n.confidence * (1.0 + 0.15 * n.reinforcements)) AS rank_boost
                FROM nodes n
                WHERE {w_like}
                ORDER BY rank_boost DESC, n.updated_at DESC
                LIMIT ?
            """
            rows = [dict(r) for r in conn.execute(sql, [like, like, like, *params, args.limit]).fetchall()]

        for r in rows:
            eds = conn.execute(
                "SELECT src, rel, dst, weight, note FROM edges WHERE src = ? OR dst = ? ORDER BY weight DESC LIMIT 8",
                (r["id"], r["id"]),
            ).fetchall()
            r["edges"] = [dict(e) for e in eds]

        if args.json:
            print(json.dumps({"query": args.query, "hits": rows}, indent=2, ensure_ascii=False))
        else:
            print(f"=== GRAPH RECALL: {args.query!r} ({len(rows)} hits) ===")
            for r in rows:
                print(f"- {r['id']} ({r['kind']}, status={r['status']}, conf={r['confidence']}, x{r['reinforcements']}): {r['title']}")
                print(f"    {r['content'][:220]}")
                for e in r["edges"][:3]:
                    print(f"    edge: {e['src']} --{e['rel']}--> {e['dst']} ({e['note']})")
        return 0
    finally:
        conn.close()


def cmd_hygiene(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        staged = [
            dict(r)
            for r in conn.execute(
                "SELECT id, agent, title FROM nodes WHERE status='staged_for_review' ORDER BY updated_at DESC"
            ).fetchall()
        ]
        active_blockers = [
            dict(r)
            for r in conn.execute(
                "SELECT id, agent, title, updated_at FROM nodes WHERE kind='blocker' AND status='active' ORDER BY updated_at DESC"
            ).fetchall()
        ]
        active_nodes = [
            dict(r)
            for r in conn.execute(
                "SELECT id, kind, title, content FROM nodes WHERE status='active' AND kind NOT IN ('agent_registry','deliverable')"
            ).fetchall()
        ]
        duplicates = []
        contradictions = []
        for i, a in enumerate(active_nodes):
            ta = _norm_tokens(a["title"])
            fa = _norm_tokens(f"{a['title']} {a['content']}")
            na = _has_negation(f"{a['title']} {a['content']}")
            for b in active_nodes[i + 1 :]:
                tb = _norm_tokens(b["title"])
                fb = _norm_tokens(f"{b['title']} {b['content']}")
                jac_t = _jaccard(ta, tb)
                jac_f = _jaccard(fa, fb)
                if jac_t >= 0.55 or jac_f >= 0.65:
                    duplicates.append({"a": a["id"], "b": b["id"], "jaccard": round(max(jac_t, jac_f), 3)})
                elif max(jac_t, jac_f) >= 0.38 and (na != _has_negation(f"{b['title']} {b['content']}")):
                    contradictions.append({"a": a["id"], "b": b["id"], "jaccard": round(max(jac_t, jac_f), 3)})

        dangling = [
            dict(r)
            for r in conn.execute(
                """
                SELECT e.src, e.rel, e.dst
                FROM edges e
                LEFT JOIN nodes n1 ON e.src = n1.id
                LEFT JOIN nodes n2 ON e.dst = n2.id
                WHERE n1.id IS NULL OR n2.id IS NULL
                """
            ).fetchall()
        ]

        poison_checks = [
            dict(r)
            for r in conn.execute(
                """
                SELECT id, title FROM nodes
                WHERE status='active' AND (
                    lower(content) LIKE '%db push --force%' OR
                    lower(content) LIKE '%use client in app/api%'
                )
                """
            ).fetchall()
        ]

        alerts = len(staged) + len(active_blockers) + len(duplicates) + len(contradictions) + len(dangling) + len(poison_checks)
        payload = {
            "verdict": "CLEAN" if alerts == 0 else "ALERTS",
            "alerts": alerts,
            "staged": staged,
            "active_blockers": active_blockers,
            "duplicates": duplicates,
            "contradictions": contradictions,
            "dangling_edges": dangling,
            "poison_alerts": poison_checks,
        }
        if args.json:
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        else:
            status_msg = "CLEAN (0 poison/contradictions/dangling/duplicates/blockers)" if alerts == 0 else f"ALERTS ({alerts})"
            print(f"=== GRAPH MEMORY HYGIENE AUDIT: {status_msg} ===")
            for k in ("staged", "active_blockers", "duplicates", "contradictions", "dangling_edges", "poison_alerts"):
                if payload[k]:
                    print(f"  [{k.upper()} ({len(payload[k])})]: {payload[k]}")
        return 0 if alerts == 0 else 1
    finally:
        conn.close()


def cmd_board(args: argparse.Namespace) -> int:
    conn = _connect_rw()
    try:
        lights = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM traffic_lights ORDER BY CASE light WHEN 'GREEN' THEN 0 WHEN 'YELLOW' THEN 1 ELSE 2 END, agent"
            ).fetchall()
        ]
        top_nodes = [
            dict(r)
            for r in conn.execute(
                "SELECT id, kind, agent, title, confidence, reinforcements FROM nodes WHERE status='active' ORDER BY (confidence*(1+0.15*reinforcements)) DESC LIMIT 15"
            ).fetchall()
        ]
        handoffs = [
            dict(r)
            for r in conn.execute("SELECT * FROM handoff_log ORDER BY id DESC LIMIT 6").fetchall()
        ]
        if args.json:
            print(json.dumps({"traffic_lights": lights, "top_nodes": top_nodes, "handoffs": handoffs}, indent=2, ensure_ascii=False))
        else:
            print("=== R2 FIT GRAPH MEMORY BOARD ===")
            print(f"\n[Traffic Lights ({len(lights)})]")
            for tl in lights:
                print(f"  {_light_icon(tl['light']):12s} {tl['agent']:14s} | {tl['task']}")
            print(f"\n[Top Active Nodes ({len(top_nodes)})]")
            for n in top_nodes:
                print(f"  + {n['id']} ({n['kind']}, x{n['reinforcements']}, conf={n['confidence']}): {n['title']}")
        return 0
    finally:
        conn.close()


def cmd_stats(args: argparse.Namespace) -> int:
    conn = _connect_ro()
    if not conn:
        raise SystemExit("Graph DB not initialized. Run `graph_memory.py init` first.")
    try:
        n_total = conn.execute("SELECT count(*) FROM nodes").fetchone()[0]
        e_total = conn.execute("SELECT count(*) FROM edges").fetchone()[0]
        by_kind = {r["kind"]: r["c"] for r in conn.execute("SELECT kind, count(*) c FROM nodes GROUP BY kind ORDER BY kind")}
        by_status = {r["status"]: r["c"] for r in conn.execute("SELECT status, count(*) c FROM nodes GROUP BY status ORDER BY status")}
        payload = {"db_path": str(DB_PATH), "nodes": n_total, "edges": e_total, "by_kind": by_kind, "by_status": by_status}
        if args.json:
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        else:
            print(f"Graph DB: {DB_PATH}")
            print(f"Nodes: {n_total} | Edges: {e_total}")
            print("Kinds:", ", ".join(f"{k}={v}" for k, v in by_kind.items()))
            print("Status:", ", ".join(f"{k}={v}" for k, v in by_status.items()))
        return 0
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(prog="graph_memory", description="Real-Time Active-Learning Graph Memory for R2 Fit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="Initialize WAL SQLite + seed R2 Fit domain knowledge")

    p_th = sub.add_parser("think", help="Add or update a node with Jaccard duplicate/conflict detection")
    p_th.add_argument("--agent", required=True)
    p_th.add_argument("--kind", required=True)
    p_th.add_argument("--title", required=True)
    p_th.add_argument("--content", required=True)
    p_th.add_argument("--project", default=DEFAULT_PROJECT)
    p_th.add_argument("--tags", default="")
    p_th.add_argument("--confidence", type=float, default=0.85)
    p_th.add_argument("--status", default="active")
    p_th.add_argument("--id", default=None)
    p_th.add_argument("--link-rel", default=None)
    p_th.add_argument("--link-to", default=None)
    p_th.add_argument("--supersede", default=None)
    p_th.add_argument("--evidence", default="")
    p_th.add_argument("--jaccard-threshold", type=float, default=0.55)
    p_th.add_argument("--force", action="store_true")

    p_lk = sub.add_parser("link", help="Connect two graph nodes")
    p_lk.add_argument("--src", required=True)
    p_lk.add_argument("--rel", required=True)
    p_lk.add_argument("--dst", required=True)
    p_lk.add_argument("--agent", default="orchestrator")
    p_lk.add_argument("--note", default="")
    p_lk.add_argument("--weight", type=float, default=1.0)

    p_rf = sub.add_parser("reinforce", help="Reinforce confidence and reinforcement count of a node")
    p_rf.add_argument("node_id")
    p_rf.add_argument("--agent", default="orchestrator")
    p_rf.add_argument("--delta", type=float, default=0.05)
    p_rf.add_argument("--note", default="")

    p_up = sub.add_parser("upgrade", help="Supersede an older node with an upgraded version")
    p_up.add_argument("--old", required=True)
    p_up.add_argument("--agent", default="orchestrator")
    p_up.add_argument("--title", required=True)
    p_up.add_argument("--content", required=True)
    p_up.add_argument("--reason", required=True)
    p_up.add_argument("--new-id", default=None)

    p_qr = sub.add_parser("quarantine", help="Quarantine/resolve/supersede a poisoned or stale node")
    p_qr.add_argument("node_id")
    p_qr.add_argument("--status", required=True, choices=["quarantined", "resolved", "superseded"])
    p_qr.add_argument("--reason", required=True)
    p_qr.add_argument("--by", default="orchestrator")

    p_sig = sub.add_parser("signal", help="Manage traffic lights and handoffs")
    sig_sub = p_sig.add_subparsers(dest="sig_cmd", required=True)
    p_ss = sig_sub.add_parser("set", help="Set traffic light for an agent")
    p_ss.add_argument("--agent", required=True)
    p_ss.add_argument("--light", required=True, choices=["GREEN", "YELLOW", "RED", "green", "yellow", "red"])
    p_ss.add_argument("--project", default=DEFAULT_PROJECT)
    p_ss.add_argument("--task", required=True)
    p_ss.add_argument("--waiting-on", default="")
    p_ss.add_argument("--note", default="")
    p_ss.add_argument("--by", default="orchestrator")

    p_sp = sig_sub.add_parser("pass", help="Pass baton from one agent to next")
    p_sp.add_argument("--from", dest="from_agent", required=True)
    p_sp.add_argument("--to", dest="to_agent", required=True)
    p_sp.add_argument("--project", default=DEFAULT_PROJECT)
    p_sp.add_argument("--summary", required=True)
    p_sp.add_argument("--artifact", default="")
    p_sp.add_argument("--max-rounds", type=int, default=3)

    p_sst = sig_sub.add_parser("status", help="Show traffic lights")
    p_sst.add_argument("--project", default=None)
    p_sst.add_argument("--json", action="store_true")

    p_rc = sub.add_parser("recall", help="Search graph memory with FTS5 + 1-hop edge traversal")
    p_rc.add_argument("query")
    p_rc.add_argument("--agent", default=None)
    p_rc.add_argument("--project", default=None)
    p_rc.add_argument("--kind", default=None)
    p_rc.add_argument("--include-superseded", action="store_true")
    p_rc.add_argument("--limit", type=int, default=10)
    p_rc.add_argument("--json", action="store_true")

    p_hy = sub.add_parser("hygiene", help="Audit graph for poison, duplicates, contradictions, or dangling edges")
    p_hy.add_argument("--json", action="store_true")

    p_bd = sub.add_parser("board", help="Display traffic lights and top active graph nodes")
    p_bd.add_argument("--json", action="store_true")

    p_st = sub.add_parser("stats", help="Show graph node and edge counts")
    p_st.add_argument("--json", action="store_true")

    args = parser.parse_args()
    dispatch = {
        "init": cmd_init,
        "think": cmd_think,
        "link": cmd_link,
        "reinforce": cmd_reinforce,
        "upgrade": cmd_upgrade,
        "quarantine": cmd_quarantine,
        "signal": cmd_signal,
        "recall": cmd_recall,
        "hygiene": cmd_hygiene,
        "board": cmd_board,
        "stats": cmd_stats,
    }
    return dispatch[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
