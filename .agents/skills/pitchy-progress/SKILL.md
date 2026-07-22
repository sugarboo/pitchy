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
- Current backlog item: `VT-006`
- Current state: `pending`
- Recommended route: `audio-thread`

## Current handoff

VT-005 is complete, including a React Strict Mode lifecycle regression fix: replayable App effect cleanup now stops owned audio resources without permanently disposing the retained engine, and a browser regression proves start plus final unmount cleanup after effect replay. The production AudioWorklet downmixes arbitrary input channel blocks into overlapping 4096-sample frames at a 2048-sample hop, transfers owned `Float32Array` buffers to the main thread, and runs in the silent `MediaStreamSource → AudioWorkletNode → GainNode(0) → destination` graph. VT-006 is next: define the runtime-validated Dedicated Worker protocol, create the TypeScript Worker lifecycle, and transfer each accepted PCM buffer from the engine boundary without routing it through React state. Cover both protocol directions, startup/runtime failure cleanup, stale messages, and production Worker loading. Do not add RMS/dBFS (VT-007) or YIN behavior yet.

First command: `pnpm skills:route`

## Backlog state

| Item | State | Evidence or next acceptance step |
| --- | --- | --- |
| VT-001 | complete | Frozen install and the full M0 handoff chain pass; project scripts, CI, PWA shell, responsive theme/locale UI, and artifact-size budget are present. |
| VT-002 | complete | Pure capability detection has unit coverage and is exercised through browser/E2E rendering without initiating permission requests. |
| VT-003 | complete | Permission requests are explicit-click only; standard/legacy failures map to actionable codes, probe tracks are released, and unit/browser/E2E tests pass. |
| VT-004 | complete | Injected lifecycle controller and UI cover start/pause/resume/stop, context and track events, actual sample rate, late streams, partial failures, and deterministic cleanup without Worklet behavior. |
| VT-005 | complete | DOM-free mono framing, transferable Worklet messages, production-built module loading, silent graph wiring, protocol validation, and full cleanup are covered by unit/browser/E2E tests. |
| VT-006 | pending | Add a runtime-validated Dedicated Worker protocol, lifecycle, and transferable main-thread forwarding without DSP. |
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
| `pnpm check` | pass | Biome checked 35 files with no fixes required. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 5 unit files, 44 tests, including framing across arbitrary block boundaries, stereo downmix, graph/error cleanup, and PCM message validation. |
| `pnpm test:browser` | pass | 1 browser file, 10 Chromium tests, including start and final audio cleanup after Strict Mode effect replay. |
| `pnpm build` | pass | Vite emitted a separate 1.53 kB hashed Worklet JavaScript asset and generated the Service Worker; 9 entries / 237.38 KiB precached. |
| `pnpm test:e2e` | pass | 6 Chromium tests include lifecycle cleanup plus native production Worklet loading and 4096-sample transferable frames from a local 440 Hz synthetic stream. |
| `pnpm check:size` | pass | Compressed app shell is 80.8 KiB of the 500 KiB budget. |

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
- Construct the AudioContext synchronously within the explicit start-click call chain, before awaiting microphone permission, so transient user activation is not lost on stricter mobile browsers. Close that context if permission fails or the request is cancelled.
- Retain microphone tracks while running or suspended so the same practice context can resume. Stop every track only on stop, unmount, failure, or replacement; a hidden page suspends a running session, cancels an incomplete startup, and requires an explicit user action to resume or restart.
- Keep PCM accumulation in a DOM-free ring framer that accepts arbitrary render-block sizes; never hardcode the browser's render quantum. Each emitted frame owns its buffer so the Worklet can transfer it without corrupting overlap history.
- Build the TypeScript Worklet through Vite's `?worker&url` path and validate every received message before publishing it on the engine's high-frequency subscription. Keep PCM frames out of React state.
- Keep two independent mute boundaries: zero every Worklet output channel and connect through `GainNode(gain = 0)`. On teardown, remove both port/node listeners, close the MessagePort, disconnect all three graph nodes, stop tracks, and close the context.
- Use reversible `AudioEngine.stop()` in React effect cleanup because root Strict Mode replays effects while retaining component state. Reserve permanent `dispose()` for ownership boundaries that cannot be replayed.

## Known risks

- Permission, AudioContext, and native AudioWorklet paths are covered with deterministic fakes and a production-preview 440 Hz synthetic stream, but no real microphone hardware, OS/browser permission UI, mobile Safari user activation, or 20-minute leak run has been verified.
- No Dedicated Worker, RMS, pitch DSP, storage database, offline-reopen, or real-device lifecycle behavior has been implemented or claimed.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
