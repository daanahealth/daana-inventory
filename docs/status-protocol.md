# Agent Status Protocol

All orchestrated agents write status to `~/.daana-status/` so the dashboard can show progress.

## Per-agent status file

Each agent owns exactly one file at `~/.daana-status/<agent-id>.json`. Overwrite on every meaningful state change.

```json
{
  "agent_id": "fe-checkout-cart",
  "agent_type": "feature",
  "lane": "frontend",
  "repo": "DaanarRX",
  "branch": "feature/checkout-cart",
  "worktree": "/Users/rithik/Code/.worktrees/DaanarRX-checkout-cart",
  "status": "in_progress",
  "current_task": "Building cart sidebar component",
  "progress_pct": 35,
  "started_at": "2026-06-06T20:00:00Z",
  "last_update": "2026-06-06T20:05:00Z",
  "blockers": [],
  "completed_subtasks": ["Read spec", "Sketch component tree"],
  "pending_subtasks": ["Sidebar UI", "Add to cart action", "Approval flow"],
  "pr_url": null,
  "commit_count": 0
}
```

### Field reference

- `agent_id` — kebab-case identifier, unique. Stable for the life of the agent.
- `agent_type` — `foundation` | `platform` | `feature` | `qa` | `coordinator` | `dashboard`
- `lane` — `foundation` | `backend` | `frontend` | `domain` | `meta`
- `status` — `pending` | `in_progress` | `qa` | `done` | `blocked`
- `progress_pct` — 0–100, best estimate
- `blockers` — list of strings; empty when not blocked
- `pr_url` — set when PR is opened
- `last_update` — ISO 8601, refreshed every status change

## Events log

Append-only `~/.daana-status/events.log`, one JSON event per line:

```json
{"ts":"2026-06-06T20:00:00Z","agent_id":"fe-checkout-cart","type":"started","msg":"Agent picked up task"}
{"ts":"2026-06-06T20:05:00Z","agent_id":"fe-checkout-cart","type":"commit","msg":"feat: cart sidebar component","sha":"abc1234"}
{"ts":"2026-06-06T20:30:00Z","agent_id":"fe-checkout-cart","type":"pr_opened","msg":"PR #42 opened","url":"https://..."}
```

Event types: `started` | `progress` | `commit` | `pr_opened` | `pr_merged` | `blocked` | `unblocked` | `qa_pass` | `qa_fail` | `done` | `error`.
