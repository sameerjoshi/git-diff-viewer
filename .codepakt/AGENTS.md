<!-- cpk_version: 0.1.4 -->
# AGENTS.md

> Project: **git-diff-viewer** — coordinated via [Codepakt](https://codepakt.com)
>
> All `cpk` commands output JSON. Parse it programmatically.
>
> Every command requires a subcommand (e.g. `cpk board status`, not `cpk board`).

## Prerequisites
- Install: `npm i -g codepakt`
- Start server: `cpk server start` (runs on port 41920)
- Dashboard: http://localhost:41920

## Session Start
Run these at the start of every session:
```bash
cpk server status                    # Ensure server is running (start with: cpk server start)
cpk generate                         # Update coordination files to latest CLI version
cpk task mine --agent <your-name>    # Check assigned tasks
cpk task list                        # All tasks on the board
cpk board status                     # Board health summary
```

## Complete Command Reference

### Create Tasks (command is `add`, NOT `create`)
```bash
cpk task add --title "Fix auth bug" --priority P0
cpk task add --title "Build login" --priority P1 --epic "Auth" --depends-on T-001
cpk task add --title "Add tests" --description "..." --verify "pnpm test" --acceptance-criteria "All pass"
cpk task add --batch tasks.json      # Bulk create from JSON file
# --status open (default) or --status backlog
```

### List & Inspect Tasks
```bash
cpk task list                        # All tasks
cpk task list --status open           # Filter: open|in-progress|review|blocked|done|backlog
cpk task list --epic "Auth"           # Filter by epic
cpk task list --assignee claude       # Filter by agent
cpk task list --limit 50              # Default: 100
cpk task show T-001                   # Full details for one task
```

### Work on Tasks (--agent required)
```bash
cpk task mine --agent <name>          # My assigned tasks (in-progress + review)
cpk task pickup --agent <name>        # Claim next available (highest priority, deps met)
cpk task pickup --agent <name> --id T-001  # Claim specific task
cpk task done T-001 --agent <name> --notes "what you did"  # Complete → review
cpk task block T-001 --agent <name> --reason "why"         # Block
cpk task unblock T-001               # Remove block, return to open
```

### Update Tasks (change any field)
```bash
cpk task update T-001 --status open   # Change status directly (any → any)
cpk task update T-001 --priority P0   # Change priority
cpk task update T-001 --assignee claude  # Reassign
cpk task update T-001 --epic "Auth"   # Set epic
cpk task update T-001 --title "New title" --description "New desc" --verify "pnpm test"
```

### Knowledge Base
```bash
cpk docs search "auth"               # Full-text search
cpk docs search "auth" --type reference  # Filter by type
cpk docs list                        # List all docs
cpk docs list --type decision         # Filter by type
cpk docs read <doc-id>               # Read full doc
cpk docs write --type learning --title "..." --body "..." --tags "tag1,tag2" --author <name>
# doc types: operational | decision | reference | learning
```

Use `cpk docs write --type learning` to record debugging notes, discoveries, or gotchas.
This is the right place for detailed implementation logs — task notes are set at completion
time and cannot be appended later.

### Server & Board
```bash
cpk server start                     # Start daemon (port 41920)
cpk server start --port 8080         # Custom port
cpk server stop                      # Stop daemon
cpk server status                    # Check if running (version, uptime)
cpk server logs                      # Last 50 lines
cpk server logs -f                   # Follow in real time
cpk server logs -n 200               # Last 200 lines
cpk board status                     # Task counts + blocked tasks + agents
cpk agent list                       # Agents that have interacted
```

### Config
```bash
cpk config show                      # Show current project config
cpk config set url http://host:port  # Point at different server
cpk config set project_id <id>       # Switch project
```

## Task Lifecycle
```
backlog ──→ open ──→ in-progress ──→ review ──→ done
                         ↓
                      blocked ──→ open
```
- `task done` moves to **review**. Dependencies resolve on review — no pipeline blocking.
- `review → done` is the human approval step (from dashboard or `cpk task update --status done`).
- `backlog` = waiting on dependencies. Auto-transitions to `open` when deps complete (review or done).
- Status transitions are fully permissive via `cpk task update`.

## Rules
- The command is `task add` — NOT `task create`, NOT `task new`
- `--agent` is **required** on: `task pickup`, `task done`, `task block`, `task mine`
- Alternative: `export CPK_AGENT=<name>` to skip `--agent` each time
- Every command needs a subcommand: `cpk board status` NOT `cpk board`
- `--notes` on `task done` are set once — they cannot be appended after completion
- Use `cpk docs write --type learning` for detailed debugging/implementation notes
- Dashboard: http://localhost:41920
- Never modify files inside `.codepakt/` directly — use `cpk generate` to update

## Active Agents
- **claude** (idle)
- **codex** (idle)
