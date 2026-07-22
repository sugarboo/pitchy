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
- Current backlog item: `VT-004`
- Current state: `pending`
- Recommended route: `audio-thread`

## Current handoff

VT-003 is complete. `src/audio/audio-types.ts` now owns the required `AppErrorCode` union and causal `AppError`; `src/audio/media-devices.ts` owns the ideal microphone constraints, secure-context guard, bound browser API calls, conservative permission/error mapping, and stream-track cleanup. The M1 welcome UI requests access only after an explicit click, stores only an error code, retranslates it when locale changes, and immediately stops tracks returned by the permission probe. Unit, Chromium component, and production-preview E2E tests cover denial, dismissed prompts, missing/unavailable devices, explicit-click gating, retries, and cleanup after unmount.

Resume with VT-004 only. Mark it `in-progress`, then implement `src/audio/audio-engine.ts` as an injected, non-React AudioContext lifecycle controller. Create or resume the context only from the existing user action, define the documented engine-status transitions, retain and release the granted stream safely, handle `statechange`, suspension, stop, and partial-start failures, and add deterministic lifecycle tests. Do not add AudioWorklet framing from VT-005 yet. Real microphone hardware and OS permission UI remain unverified.

First command: `pnpm skills:route`

## Backlog state

| Item | State | Evidence or next acceptance step |
| --- | --- | --- |
| VT-001 | complete | Frozen install and the full M0 handoff chain pass; project scripts, CI, PWA shell, responsive theme/locale UI, and artifact-size budget are present. |
| VT-002 | complete | Pure capability detection has unit coverage and is exercised through browser/E2E rendering without initiating permission requests. |
| VT-003 | complete | Permission requests are explicit-click only; standard/legacy failures map to actionable codes, probe tracks are released, and unit/browser/E2E tests pass. |
| VT-004 | pending | Implement the injected AudioContext lifecycle and cleanup without adding Worklet behavior. |
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
| `pnpm check` | pass | Biome checked 29 files with no fixes required. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 3 unit files, 20 tests. |
| `pnpm test:browser` | pass | 1 browser file, 5 Chromium tests. |
| `pnpm build` | pass | Vite production build and generated Service Worker completed; 8 entries / 225.71 KiB precached. |
| `pnpm test:e2e` | pass | 4 Chromium tests cover the local-only shell, manifest, persisted UI preferences, and an explicit-click permission denial. |
| `pnpm check:size` | pass | Compressed app shell is 77.3 KiB of the 500 KiB budget. |

## Durable decisions

- Store repo-scoped skills under `.agents/skills` so current Codex clients can discover them while Git synchronizes them across devices.
- Keep `pitchy-router` procedural and this skill stateful; do not duplicate the full `AGENTS.md` plan.
- Use a single mutable handoff instead of an append-only session log; Git history remains the audit trail.
- Defer Zustand, Dexie, and Zod until their owning milestones to avoid unused M0 dependencies.
- Use typed local `zh-CN` and `en` dictionaries with explicit UI controls. Persist the M0 theme/locale preference in namespaced localStorage, then migrate it behind the same preference boundary when Dexie arrives in VT-021.
- Keep `workbox-window` as an explicit runtime dependency for the React update prompt; it communicates only with the same-origin Service Worker.
- Start the Vite preview server through Playwright global setup so E2E teardown closes in-process and exits reliably on Windows.
- Keep microphone permission and hardware failures as stable `AppErrorCode` values; translate codes at render time so locale changes never require repeating a browser request.
- Treat a post-failure `prompt` permission state as the best available signal for a dismissed prompt. When permission state is unavailable, map `NotAllowedError` conservatively to `permission-denied` because the platform exposes no distinct dismissal result.
- Stop every track returned by the VT-003 permission probe immediately. VT-004 will transfer stream ownership to the audio engine only after its lifecycle and cleanup contract exists.

## Known risks

- The permission path is covered with deterministic fakes and a production-preview browser test, but no real microphone hardware or OS/browser permission UI has been verified.
- No AudioContext, AudioWorklet, Worker, DSP, storage database, offline-reopen, or real-device lifecycle behavior has been implemented or claimed.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
