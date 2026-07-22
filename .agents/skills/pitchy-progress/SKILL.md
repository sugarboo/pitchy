---
name: pitchy-progress
description: Read and maintain the durable Pitchy development status stored in this repository. Use when checking current milestone or backlog state, resuming work on another device, preparing a handoff, recording verification evidence, or reconciling repository changes with the shared Codex progress record.
---

# Pitchy Progress

Use this file as the compact, checked-in handoff state. Verify every claim against the repository before acting on it, then update this file at the end of each development task.

<!-- pitchy-progress:v1 -->

## Current route

- Last updated: `2026-07-22`
- Current milestone: `M1`
- Current backlog item: `VT-003`
- Current state: `pending`
- Recommended route: `audio-thread`

## Current handoff

M0 is complete. The repository now has a Node 24 / pnpm 11 Vite, React, and TypeScript foundation; Biome, Vitest unit and browser projects, Playwright E2E, CI, a prompt-based PWA shell, responsive light/dark UI, persisted Simplified Chinese/English preferences, and browser capability detection. `pitchy-router` and this progress skill are valid repository skills under `.agents/skills`.

Resume with VT-003 only. Mark it `in-progress`, then implement the microphone permission boundary and the `AppErrorCode` mapping without starting AudioContext work from VT-004. Keep user-facing errors in the typed locale dictionaries and add deterministic tests for denied, dismissed, missing-device, and unsupported-browser paths. No microphone behavior has been verified yet.

First command: `pnpm skills:route`

## Backlog state

| Item | State | Evidence or next acceptance step |
| --- | --- | --- |
| VT-001 | complete | Frozen install and the full M0 handoff chain pass; project scripts, CI, PWA shell, responsive theme/locale UI, and artifact-size budget are present. |
| VT-002 | complete | Pure capability detection has unit coverage and is exercised through browser/E2E rendering without initiating permission requests. |
| VT-003 | pending | Implement microphone permission flow and actionable error mapping; add deterministic boundary tests. |
| VT-004 | pending | Implement AudioContext lifecycle after user gesture. |
| VT-005 | pending | Implement AudioWorklet PCM framing. |
| VT-006 | pending | Add Worker protocol and transferable buffers. |
| VT-007 | pending | Add RMS and approximate dBFS. |
| VT-008 | pending | Implement YIN difference function. |
| VT-009 | pending | Add CMND and candidate search. |
| VT-010 | pending | Add interpolation and confidence. |
| VT-011 | pending | Add Hz/MIDI/note/cents conversion. |
| VT-012 | pending | Add voiced decision and noise gate. |
| VT-013 | pending | Add temporal median filter. |
| VT-014 | pending | Add octave-jump guard. |
| VT-015 | pending | Add Canvas pitch trace. |
| VT-016 | pending | Add live primary readout. |
| VT-017 | pending | Add stability and sustained-note state machine. |
| VT-018 | pending | Complete free-practice mode. |
| VT-019 | pending | Complete target-note mode. |
| VT-020 | pending | Add session aggregation. |
| VT-021 | pending | Add local database and migrations. |
| VT-022 | pending | Add summary and history. |
| VT-023 | pending | Validate full offline workflow. |
| VT-024 | pending | Validate non-disruptive update prompt. |
| VT-025 | pending | Complete browser and real-device QA. |
| VT-026 | pending | Complete performance and privacy audit. |

## Verification evidence

| Check | Last result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | pass | Lockfile was current; 469 entries passed pnpm supply-chain policy checks. |
| `pnpm check` | pass | Biome checked 26 files with no fixes required. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 2 unit files, 7 tests. |
| `pnpm test:browser` | pass | 1 browser file, 2 Chromium tests. |
| `pnpm build` | pass | Vite production build and generated Service Worker completed; 8 entries / 217.46 KiB precached. |
| `pnpm test:e2e` | pass | 3 Chromium tests cover the local-only shell, manifest, and persisted theme/language choices. |
| `pnpm check:size` | pass | Compressed app shell is 74.7 KiB of the 500 KiB budget. |

## Durable decisions

- Store repo-scoped skills under `.agents/skills` so current Codex clients can discover them while Git synchronizes them across devices.
- Keep `pitchy-router` procedural and this skill stateful; do not duplicate the full `AGENTS.md` plan.
- Use a single mutable handoff instead of an append-only session log; Git history remains the audit trail.
- Defer Zustand, Dexie, and Zod until their owning milestones to avoid unused M0 dependencies.
- Use typed local `zh-CN` and `en` dictionaries with explicit UI controls. Persist the M0 theme/locale preference in namespaced localStorage, then migrate it behind the same preference boundary when Dexie arrives in VT-021.
- Keep `workbox-window` as an explicit runtime dependency for the React update prompt; it communicates only with the same-origin Service Worker.
- Start the Vite preview server through Playwright global setup so E2E teardown closes in-process and exits reliably on Windows.

## Known risks

- No real microphone, AudioContext, AudioWorklet, Worker, DSP, storage database, offline-reopen, or real-device behavior has been implemented or claimed.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
