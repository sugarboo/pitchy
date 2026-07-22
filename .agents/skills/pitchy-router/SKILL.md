---
name: pitchy-router
description: Route Pitchy repository work from the synced milestone and backlog state. Use when starting or resuming development in this repo, choosing the next AGENTS.md task, handing work across devices, checking whether prerequisites are complete, or updating the durable project handoff after implementation.
---

# Pitchy Router

Treat this skill as the single entry point for continued Pitchy development. Route by repository evidence and the checked-in progress skill, never by chat memory alone.

## Bootstrap

1. Locate the repository root from this skill directory.
2. Read `AGENTS.md` completely before changing code.
3. Read `../pitchy-progress/SKILL.md` completely.
4. Inspect the working tree and relevant tests. Treat code, tests, and Git state as stronger evidence than a stale progress entry.
5. Run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` to validate the progress table and print the recommended route.
6. Reconcile discrepancies before implementation. Update the progress skill when the repository proves it stale.

## Route Work

- For a status, resume, handoff, or next-task request, use the current `in-progress` backlog item. If none exists, use the earliest `pending` item whose dependencies are complete.
- For an explicitly named `VT-*` item, honor that scope only when its earlier core dependencies are complete. Report the dependency conflict instead of silently skipping it.
- For a milestone request, select only items mapped to that milestone in [routing-table.md](references/routing-table.md).
- For a narrow fix or review, keep the user's scope and use the progress record only as context. Do not broaden it into the next backlog item.
- For changes to the router or handoff format, preserve the frontmatter contract and validate both skills before finishing.

## Execute The Route

1. Mark the selected item `in-progress` in `pitchy-progress/SKILL.md` before broad edits when it was previously pending.
2. Implement one clear problem at a time and follow the module boundaries in `AGENTS.md`.
3. Add or update the required deterministic tests. Never delete a failing test to make the route pass.
4. Run checks proportional to the change, then run the full repository handoff chain before declaring a backlog item complete.
5. Record exact commands and outcomes in the progress skill. Do not claim a browser, device, microphone, offline, performance, or leak test that was not actually run.
6. Mark an item `complete` only after its acceptance evidence exists. Keep it `in-progress` with a concise blocker or remaining step otherwise.
7. Set `Current backlog item` to the next actionable item and leave a concrete handoff containing files, risks, and the first command to run.

## Maintain The Progress Skill

Keep `../pitchy-progress/SKILL.md` concise and merge-friendly:

- Use only `pending`, `in-progress`, `complete`, or `blocked` in the backlog table.
- Keep at most one item `in-progress`.
- Preserve every `VT-001` through `VT-026` row and their order.
- Replace the current handoff instead of appending an unbounded journal.
- Record durable decisions only; rely on Git history for detailed chronology.
- Use ISO dates (`YYYY-MM-DD`) and repository-relative paths.

Run the skill creator validator on both skill directories after editing their metadata or structure.
