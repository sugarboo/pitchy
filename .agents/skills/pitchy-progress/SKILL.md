---
name: pitchy-progress
description: Read and maintain the durable Pitchy development status stored in this repository. Use when checking current milestone or backlog state, resuming work on another device, preparing a handoff, recording verification evidence, or reconciling repository changes with the shared Codex progress record.
---

# Pitchy Progress

Use this file as the compact, checked-in handoff state. Verify every claim against the repository before acting on it, then update this file at the end of each development task.

<!-- pitchy-progress:v1 -->

## Current route

- Last updated: `2026-08-13`
- Current milestone: `M3`
- Current backlog item: `VT-015`
- Current state: `pending`
- Recommended route: `practice-ui`

## Current handoff

VT-014 and milestone M2 are complete. `src/dsp/octave-guard.ts` is an immutable continuous-MIDI state machine placed before temporal median smoothing. It accepts changes up to and including seven semitones, holds larger candidates at the prior accepted value, and accepts the raw unquantized pitch after three same-direction candidates whose adjacent drift stays within two semitones. Its `observationAccepted` and `resetSmoothing` outputs explicitly freeze the median during pending evidence and restart it on a confirmed jump or unvoiced boundary. Null/non-finite observations reset the guard, so a new onset at any pitch passes immediately. Deterministic tests cover double/half-frequency glitches, persistent real jumps, exact threshold and candidate-step boundaries, direction/cluster changes, gradual two-octave glissando, silence, extreme values, state immutability, guard-to-median composition, a synthetic injected-error rate below 1%, and 128 continuous YIN frames for A2–A5 at 44.1/48 kHz. VT-015 is next: add a DPR-aware fixed-capacity Canvas pitch trace without sending every pitch frame through React state; Worker DSP integration and live readout remain later practice-UI work.

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
| VT-008 | complete | Fixed-window squared difference, validation, non-mutation, A2–A5 deterministic tests at 44.1/48 kHz, and Node/Chromium benchmark pass. |
| VT-009 | complete | Equation-8 CMND, zero-sum safety, strict first-trough selection, labeled bounded fallback, deterministic signals, validation, and benchmark pass. |
| VT-010 | complete | Raw-difference period interpolation, CMND dip-depth confidence, guard/degenerate validation, deterministic signal tests, and benchmark pass. |
| VT-011 | complete | Finite Hz/MIDI conversion, MIDI-keyed sharp/flat note formatting, nearest/target cents, A4 range validation, and deterministic boundary tests pass. |
| VT-012 | complete | Pure adaptive gate state, conjunctive voiced evidence, end-to-end single-frame YIN estimates, recovery sequences, deterministic signals, and Node/Chromium benchmarks pass. |
| VT-013 | complete | Immutable five-value continuous-MIDI median state, unvoiced/non-finite reset, deterministic motion/outlier tests, and Node/Chromium benchmarks pass. |
| VT-014 | complete | Strict seven-semitone guard, clustered three-frame confirmation, unvoiced reset, median-control contract, octave-rate tests, and Node/Chromium benchmarks pass. |
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
| `pnpm check` | pass | Biome checked 64 files under Node 24 after existing Windows checkout line endings were temporarily normalized; unrelated line-ending-only changes were restored afterward. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 16 unit files, 434 tests, including YIN stages, A2–A5 continuous octave-rate coverage, voiced evidence, adaptive-gate recovery, median smoothing, octave guarding/composition, domain conversions, protocols, transfers, and cleanup. |
| `pnpm test:browser` | pass | 1 browser file, 10 Chromium tests, including start and final audio cleanup after Strict Mode effect replay. |
| `pnpm build` | pass | Vite emitted separate 1.66 kB Worker and 1.53 kB Worklet JavaScript assets; 10 entries / 243.42 KiB are precached. |
| `pnpm test:e2e` | pass | The sandbox first denied the preview listener with `EACCES`; rerunning with local-listen permission passed all 6 Chromium lifecycle, privacy, Worker/Worklet, transfer, and RMS tests. |
| `pnpm check:size` | pass | Compressed app shell is 82.7 KiB of the 500 KiB budget. |
| `pnpm benchmark:dsp --run` | pass | Under Node 24, 4096 octave-guard transitions averaged 0.164 ms in Node and 0.058 ms in Chromium for injected octave bursts, and 0.136/0.051 ms for mixed jumps/resets. The voiced YIN estimator averaged 1.59/1.68 ms per 4096-sample frame; no environment-sensitive CI threshold is asserted. |

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
- Calculate the YIN squared difference over a fixed first-half integration window so every requested lag has equal support. Keep `tau` as the output index, accumulate into `Float64Array`, and validate finite PCM before the quadratic loop.
- Keep YIN CMND finite by mapping a zero cumulative mean to one and never clamp legitimate values above one. Search inclusive tau bounds with a strict threshold and earliest-flat-trough rule; preserve the original bounded global-minimum fallback with an explicit selection label so it cannot be confused with voiced evidence.
- Refine a selected YIN period from the raw difference parabola while deriving confidence from the CMND dip. Require a right guard lag, accept only strict finite local minima, retain the discrete candidate for flat or degenerate curves, and keep confidence separate from later voiced gating.
- Treat MIDI as a continuous finite 12-TET coordinate for pitch math rather than restricting it to the 0–127 wire range. Require safe integers only for target-note keys and display names, use MIDI 60 = C4 scientific notation, and keep sharp/flat strings out of internal identity.
- Support decimal A4 tunings across the inclusive 415–466 Hz range. Resolve exact half-semitone ties toward the higher note, normalize signed zero, and use log-domain conversion where necessary to preserve representable subnormal frequencies.
- Keep YIN configuration and calibration constants in `src/dsp/dsp-config.ts`. Reject an infeasible frequency/sample-rate/frame combination rather than silently truncating the search, and reserve one lag beyond `maxTau` for refinement.
- Decide voiced with separate RMS gate, threshold-qualified candidate, confidence, and inclusive frequency-range evidence. Preserve finite RMS/confidence for unvoiced frames, return `frequencyHz: null`, and expose `periodicCandidateFound` only as internal evidence for later gate ownership.
- Keep adaptive noise-floor state explicit and resettable outside the single-frame estimator. Classify with the previous threshold, learn aperiodic frames using asymmetric time-based EWMA, ignore open periodic frames, and release an elevated floor when silence or a periodic candidate below the gate proves recovery is needed.
- Smooth pitch in continuous MIDI space with an immutable five-observation median reducer. Compute a result from every non-empty warm-up window, average the two central values for an even warm-up count, and reset on unvoiced or non-finite input so old phrases cannot bias a new onset. Keep octave-jump confirmation in VT-014 rather than hiding it inside the statistical filter.
- Guard large voiced jumps before temporal median smoothing. Treat only changes strictly greater than seven semitones as pending, require three same-direction candidates within a two-semitone adjacent cluster, hold the prior accepted MIDI without advancing downstream evidence, and reset smoothing when a persistent jump or new onset is accepted. Never fold by 12 semitones or quantize the confirmed observation.

## Known risks

- Permission, AudioContext, native AudioWorklet, and Dedicated Worker paths are covered with deterministic fakes and a production-preview 440 Hz synthetic stream, but no real microphone hardware, OS/browser permission UI, mobile Safari user activation, or 20-minute leak run has been verified.
- RMS, end-to-end YIN, voiced/noise-gate decisions, standalone Hz/MIDI/note/cents conversion, temporal median smoothing, and octave guarding are implemented; Worker integration of the complete pitch pipeline, Canvas/live UI, storage, offline reopen, and real-device lifecycle behavior remain unimplemented.
- The five-value causal median adds roughly two hop intervals of lag once full (about 85 ms at 48 kHz or 93 ms at 44.1 kHz with a 2048-sample hop). Its end-to-end contribution must be measured when the Worker pipeline and live readout are integrated against the 120 ms median latency target.
- A genuine instantaneous jump needs two additional observations before confirmation, adding about 85 ms at 48 kHz / 2048 hop. Three persistent octave-error frames will also be accepted because temporal evidence cannot distinguish them from a real jump; the seven-semitone threshold and two-semitone candidate cluster require VT-025 voice/device calibration.
- The initial `minConfidence = 0.9`, 6 dB adaptive margin, and 2000/500 ms rise/fall constants only have deterministic synthetic evidence and require VT-025 voice/device/room calibration. Frames above the fixed -55 dBFS floor but below an elevated adaptive gate still run YIN to preserve recovery correctness, so the adaptive gate is not a guaranteed compute-saving boundary.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.
- The Windows checkout uses CRLF while Biome's current formatter default expects LF, so the full `pnpm check` evidence required temporary line-ending normalization; a repository-wide EOL policy remains to be resolved without mixing mechanical churn into DSP work.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
