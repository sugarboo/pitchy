---
name: pitchy-progress
description: Read and maintain the durable Pitchy development status stored in this repository. Use when checking current milestone or backlog state, resuming work on another device, preparing a handoff, recording verification evidence, or reconciling repository changes with the shared Codex progress record.
---

# Pitchy Progress

Use this file as the compact, checked-in handoff state. Verify every claim against the repository before acting on it, then update this file at the end of each development task.

<!-- pitchy-progress:v1 -->

## Current route

- Last updated: `2026-07-26`
- Current milestone: `M2`
- Current backlog item: `VT-008`
- Current state: `pending`
- Recommended route: `pitch-dsp`

## Current handoff

VT-007 is complete. The pure DSP level module computes non-mutating, two-pass AC RMS after removing each frame's mean, converts it with `20 * log10(rms)` to approximate dBFS, preserves positive over-full-scale results, and maps silence or invalid direct calls to a finite `-160 dBFS` transport floor that is explicitly not a noise-gate threshold. Pitch Worker protocol v2 rejects non-finite PCM, requires exact message keys, validates RMS/dBFS consistency, and cannot forward `samples` or other extra fields through the public frame subscription. Deterministic coverage includes silence, known amplitudes, low and over-full-scale signals, DC bias, invalid values, input immutability, and 44.1/48 kHz sine frames. Production Chromium E2E observes a self-consistent non-silent level from the compiled Worker while preserving transferable-buffer and teardown guarantees. VT-008 is next: implement and benchmark only the YIN difference function, leaving CMND, candidate search, confidence, voiced/noise-gate decisions, smoothing, and UI behavior to their owning backlog items.

First command: `pnpm skills:route`

## Backlog state

| Item | State | Evidence or next acceptance step |
| --- | --- | --- |
| VT-001 | complete | Frozen install and the full M0 handoff chain pass; project scripts, CI, PWA shell, responsive theme/locale UI, and artifact-size budget are present. |
| VT-002 | complete | Pure capability detection has unit coverage and is exercised through browser/E2E rendering without initiating permission requests. |
| VT-003 | complete | Permission requests are explicit-click only; standard/legacy failures map to actionable codes, probe tracks are released, and unit/browser/E2E tests pass. |
| VT-004 | complete | Injected lifecycle controller and UI cover start/pause/resume/stop, context and track events, actual sample rate, late streams, partial failures, and deterministic cleanup without Worklet behavior. |
| VT-005 | complete | DOM-free mono framing, transferable Worklet messages, production-built module loading, silent graph wiring, protocol validation, and full cleanup are covered by unit/browser/E2E tests. |
| VT-006 | complete | Versioned bidirectional protocol, ready handshake/timeout, transferable PCM forwarding, sequence guards, error cleanup, stale-message isolation, and production Worker loading are covered. |
| VT-007 | complete | Two-pass DC-removed AC RMS, finite approximate dBFS, protocol v2 validation, deterministic tests, benchmark, and production Worker E2E pass. |
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
| `pnpm check` | pass | Biome checked 42 files after Windows checkout line endings were temporarily normalized; unrelated line-ending-only changes were restored afterward. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 7 unit files, 70 tests, including deterministic AC RMS/dBFS, exact protocol validation, Worker correlation, transferred buffers, runtime cleanup, and stale-message isolation. |
| `pnpm test:browser` | pass | 1 browser file, 10 Chromium tests, including start and final audio cleanup after Strict Mode effect replay. |
| `pnpm build` | pass | Vite emitted separate 1.66 kB Worker and 1.53 kB Worklet JavaScript assets; 10 entries / 243.46 KiB are precached. |
| `pnpm test:e2e` | pass | 6 Chromium tests include lifecycle cleanup plus native production Worker/Worklet loading, detached 4096-sample transfers, and a self-consistent non-silent RMS/dBFS result from a local 440 Hz stream. |
| `pnpm check:size` | pass | Compressed app shell is 82.7 KiB of the 500 KiB budget. |
| `pnpm benchmark:dsp --run` | pass | Final 4096-sample AC RMS/dBFS benchmark measured about 9,698 frames/s in Node and 9,848 frames/s in Chromium, with mean frame time near 0.103/0.102 ms and no CI threshold asserted. |

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
- Build the TypeScript Worklet through Vite's `?worker&url` path and validate every received message before transferring its owned buffer directly to the Dedicated Worker. Raw PCM has no React or public engine subscription.
- Keep two independent mute boundaries: zero every Worklet output channel and connect through `GainNode(gain = 0)`. On teardown, remove both port/node listeners, close the MessagePort, disconnect all three graph nodes, stop tracks, and close the context.
- Use reversible `AudioEngine.stop()` in React effect cleanup because root Strict Mode replays effects while retaining component state. Reserve permanent `dispose()` for ownership boundaries that cannot be replayed.
- Build the pitch Worker through its own Vite `?worker&url` path and start it as a named module Worker. Require a versioned configure/ready handshake before loading the Worklet, transfer each validated `Float32Array` once, correlate small result messages by sequence, and terminate the Worker with the rest of the audio graph.
- Measure input level as AC RMS over a mean-centered frame using two passes, so DC bias is excluded without the cancellation error of `E[x²] - mean²` or mutation of transferred PCM. Preserve positive dBFS for float over-range input, and use `-160 dBFS` only as a finite silence/transport floor.
- Treat Worker protocol v2 as an exact runtime boundary: reject non-finite PCM, require RMS/dBFS consistency, reject unknown keys, and never allow raw `samples` into the public main-thread result subscription.

## Known risks

- Permission, AudioContext, native AudioWorklet, and Dedicated Worker paths are covered with deterministic fakes and a production-preview 440 Hz synthetic stream, but no real microphone hardware, OS/browser permission UI, mobile Safari user activation, or 20-minute leak run has been verified.
- Only RMS level DSP is implemented; YIN, confidence, voiced/noise-gate decisions, note conversion, smoothing, level UI, storage database, offline-reopen, and real-device lifecycle behavior remain unimplemented.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.
- The Windows checkout uses CRLF while Biome's current formatter default expects LF, so the full `pnpm check` evidence required temporary line-ending normalization; a repository-wide EOL policy remains to be resolved without mixing mechanical churn into DSP work.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
