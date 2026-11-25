---
name: graph-memory
description: Query, update, reinforce, and audit the R2 Fit real-time SQLite graph memory (_tools/graph-memory/graph_memory.py) before coding, when discovering pitfalls/rules, during handoffs, and before final verification.
---

# R2 Fit Graph Memory (`_tools/graph-memory/graph_memory.py`)

This repo keeps a live, WAL-mode SQLite + FTS5 + JSONL-journaled active-learning graph at `_tools/graph-memory/graph_memory.sqlite` (and `_tools/graph-memory/graph_journal.jsonl`) covering R2 Fit conventions, Richie & Renita's UX goals, workout burn/eat-back math, food-search pitfalls, and coordination traffic lights.

## 1. Before You Edit (Recall First)

Query existing rules and pitfalls before touching code:

```bash
python3 _tools/graph-memory/graph_memory.py recall "food search aliases"
python3 _tools/graph-memory/graph_memory.py recall "workout burn eatback"
python3 _tools/graph-memory/graph_memory.py board
```

Initialize if the DB file does not exist yet:

```bash
python3 _tools/graph-memory/graph_memory.py init
```

## 2. Real-Time Learning (`think`, `link`, `reinforce`, `upgrade`)

Whenever you uncover a new pitfall, fix a subtle bug, or lock in an architectural decision, persist it immediately:

```bash
# Add or update a node (Jaccard duplicate/conflict detection runs automatically)
python3 _tools/graph-memory/graph_memory.py think \
  --agent builder \
  --kind food_pitfall \
  --title "Your concise rule title" \
  --content "Exact invariant, file paths, and why it matters." \
  --tags "food search csv" \
  --confidence 0.92 \
  --link-rel INFORMS \
  --link-to pitfall:food_search_and_ranking_guards

# Reinforce an existing rule when verified by a passing test or fix
python3 _tools/graph-memory/graph_memory.py reinforce pitfall:food_search_client_vs_note --agent builder --note "Verified by searchEval"

# Upgrade/supersede an outdated rule cleanly
python3 _tools/graph-memory/graph_memory.py upgrade --old some:node_id --agent builder --title "New rule" --content "..." --reason "Why updated"
```

If `think` exits `2`, it detected a Jaccard duplicate or contradiction (`>= 0.55` token overlap or negation clash). Either update the existing `--id`, pass `--supersede <old_id>`, or explicitly override with `--force` if genuinely distinct.

## 3. Traffic Lights & Quarantine

```bash
python3 _tools/graph-memory/graph_memory.py signal set --agent builder --light GREEN --task "Sprint 2 build"
python3 _tools/graph-memory/graph_memory.py signal pass --from builder --to verifier --summary "Ready for test gate"
python3 _tools/graph-memory/graph_memory.py quarantine <stale_id> --status quarantined --reason "Superseded or invalid"
```

## 4. Zero-Poison Hygiene Check (Before Finishing)

Always run hygiene before completing a task:

```bash
python3 _tools/graph-memory/graph_memory.py hygiene
```

Confirm verdict is `CLEAN` (0 dangling edges, 0 duplicates, 0 contradictions, 0 active unresolved blockers).
