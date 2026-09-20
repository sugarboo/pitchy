---
name: pitchy-progress
description: Read and maintain the durable Pitchy development status stored in this repository. Use when checking current milestone or backlog state, resuming work on another device, preparing a handoff, recording verification evidence, or reconciling repository changes with the shared Codex progress record.
---

# Pitchy Progress

Use this file as the compact, checked-in handoff state. Verify every claim against the repository before acting on it, then update this file at the end of each development task.

<!-- pitchy-progress:v1 -->

## Current route

- Last updated: `2026-09-20`
- Current milestone: `M5`
- Current backlog item: `VT-023`
- Current state: `pending`
- Recommended route: `offline-pwa`

## Current handoff

VT-022 is complete. `src/features/history/PracticeHistory.tsx` replaces LocalDataControls with a Dexie liveQuery-backed newest-first history list, saved details, confirmed single deletion/clear, empty/error states and explicit retry. `SessionResult.tsx` shares frozen current/saved metric presentation with unique headings, dates and a return-to-practice anchor. `src/features/summary/SessionTrace.tsx` renders the complete bounded observation span without retuning saved MIDI; null gaps remain intact and empty evidence is labeled. Browser tests cover reactive writes, order, saved settings/null evidence, locale/theme rerender, deletion/clear and read failure recovery. Production E2E reopens saved free/target summaries after reload and checks trace visibility and target ratios. Next is VT-023: validate the complete offline workflow with installed Service Worker, offline reopen, production synthetic input through DSP, summary save/reload, preferences and request auditing. Do not infer offline acceptance from the existing online tests. Input device label remains null; real-device QA remains outstanding.

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
| VT-015 | complete | Fixed-capacity imperative trace storage, ten-second Canvas rendering, DPR/theme/visibility handling, and browser regressions pass without per-frame React state. |
| VT-016 | complete | Stateful Worker pitch pipeline, protocol v3, direct Canvas feed, throttled localized readout, and production 440 Hz E2E pass. |
| VT-017 | complete | Robust one-second stability statistics, five-state sustained-note reducer, Worker protocol v4 integration, localized readout, deterministic tests, E2E, and Node/Chromium benchmarks pass. |
| VT-018 | complete | Explicit localized free mode, validated session-locked A4 tuning, coherent readout/range/Canvas projection, deterministic boundary tests, and production E2E pass. |
| VT-019 | complete | Locked target/mode selection, full target cents, observed hit/stable durations, bilingual UI, pause/gap tests, and production hit/octave E2E pass. |
| VT-020 | complete | Bounded session aggregation, stable runs/range, weighted stability median, target ratios, lifecycle finalization, localized in-memory result, and production summary E2E pass. |
| VT-021 | complete | Dexie/Zod schema-v1 repositories, atomic legacy settings migration, persisted A4/theme/locale, explicit save/delete/clear, corrupt-data handling, and native IndexedDB/production E2E pass. |
| VT-022 | complete | Reactive saved-history list/details, confirmed single-delete/clear, full-session trace, empty/error recovery, bilingual UI and production reload regressions pass. |
| VT-023 | pending | Validate full offline workflow. |
| VT-024 | pending | Validate non-disruptive update prompt. |
| VT-025 | pending | Complete browser and real-device QA. |
| VT-026 | pending | Complete performance and privacy audit. |

## Verification evidence

| Check | Last result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | pass | Added dexie 4.4.6 and zod 4.6.5; frozen install reports up to date. Host launcher used pnpm 11.19.0; packageManager remains pinned to 11.9.0. |
| `pnpm check` | pass | Biome checked 98 files under Node 24; four existing CRLF-only files were temporarily normalized and restored afterward. |
| `pnpm typecheck` | pass | TypeScript project references completed with no errors. |
| `pnpm test` | pass | 26 unit files, 556 tests; adds full-span saved trace/tuning/gap and empty evidence checks, plus bilingual history copy coverage. |
| `pnpm test:browser` | pass | 4 browser files, 26 Chromium tests; adds reactive ordered history, saved settings/null metrics, locale/theme rerender, external deletion, confirmed deletion/clear and read retry. |
| `pnpm build` | pass | Separate 21.64 kB Worker and 1.53 kB Worklet; 10 entries / 483.80 KiB precached. |
| `pnpm test:e2e` | pass | 8 Chromium tests; free/target production streams save/delete/resave, reload opens saved details and trace, target ratios retained, confirmed clear removes records; prior theme/locale/privacy checks pass. |
| `pnpm check:size` | pass | Compressed app shell is 153.8 KiB of the 500 KiB budget (+1.3 KiB from VT-021). |
| `pnpm benchmark:dsp --run` | prior VT-017 pass | DSP unchanged in VT-018–VT-022; not rerun. Prior full pipeline averaged 1.48 ms Node / 1.61 ms Chromium; stability sequence about 0.036/0.034 ms per frame. |

## Durable decisions

- Store repo-scoped skills under `.agents/skills` so current Codex clients can discover them while Git synchronizes them across devices.
- Keep `pitchy-router` procedural and this skill stateful; do not duplicate the full `AGENTS.md` plan.
- Use a single mutable handoff instead of an append-only session log; Git history remains the audit trail.
- Dexie and Zod were introduced in VT-021 for local storage and runtime schemas. Zustand remains deferred until a concrete business-state need arises.
- Use typed local `zh-CN` and `en` dictionaries with explicit UI controls. IndexedDB preferences are canonical after VT-021; namespaced localStorage keys seed migration only when no DB preference row exists and remain compatibility caches. Hydrate before mounting audio consumers, preventing a late preference load from changing a running session.
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
- Treat Worker protocol v4 as an exact runtime boundary: configure sample rate, frame size, and hop size together; reject non-finite PCM, pitch, stability, duration, state, or range evidence; require RMS/dBFS consistency and exact keys; and never allow raw `samples` into the public main-thread result subscription. Derive session-relative frame-end timestamps from sequence, frame size, hop size, and actual sample rate.
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
- Store Canvas history in a 512-slot imperative buffer: it covers about 8.5 seconds even at 60 updates per second and exceeds ten seconds at the planned audio-hop rate, while the renderer crops the visible domain to exactly ten seconds. Preserve null MIDI observations as explicit path gaps and require callers to clear before restarting a timestamp timeline.
- Schedule Canvas work directly from trace-buffer notifications, coalescing bursts into one `requestAnimationFrame` without React state. Resolve light/dark colors at draw time, resize backing pixels from actual CSS bounds and DPR, and cancel queued work whenever the document is hidden or the component unmounts.
- Own adaptive gate, octave guard, and median-filter state inside one Worker runtime session. Convert accepted raw frequency to continuous MIDI before guarding; freeze downstream smoothing while a large jump is pending, emit a null trace observation, and reset smoothing before inserting a confirmed jump or new onset.
- Feed every validated Worker result into `PitchTraceBuffer`, but expose React through `LivePitchStore` at a trailing maximum of 25 Hz. Clear pending timers, the published snapshot, and trace history together whenever a fresh session starts or stops; pause/resume retains the same timeline.
- Keep Worker/trace MIDI in canonical A4=440 coordinates. Free-mode display applies `12 * log2(440 / tuningA4Hz)` to note/cents, stable range, and Canvas; measured Hz and translation-invariant stability metrics stay unchanged. Freeze tuning during each session, including pause; VT-021 persists it with interface preferences.
- Fix mode and target alongside tuning for each session. Offer D2–C6 because every target remains inside 65–1200 Hz across all supported tunings. Target deviation uses the tuned continuous MIDI without octave folding; ±20 cents is a labeled product tolerance. Count only adjacent observed intervals whose endpoints both hit, requiring both endpoints stable for stable-hit time. First frames, gaps, unvoiced/pending observations, and pause boundaries add no inferred time. Aggregate before UI throttling, clear on new session/stop, and keep free-mode target progress null.
- Start a session only after audio reaches running with an actual sample rate. Total duration uses a monotonic start/end clock and includes pauses, excluding permission/startup time. Voiced/stable/target durations use adjacent valid pitch intervals, so pending or missing pitch contributes no estimated time. Target ratios and stable voiced ratio use observed voiced duration as denominator; empty denominators are null, and free-mode target ratios are always null.
- Finalize before clearing live data, retain a frozen completed result across stop/reset and locale/theme changes, and mark audio errors as interrupted. New successful sessions replace the prior in-memory result; failed permission requests do not create summaries. Use fixed 0.1-point stability bins for a duration-weighted lower median and pairwise compact at most 300 trace points while preserving gaps; the preview is not a uniformly sampled analysis series. Never retain PCM. Saving is explicit; full history UI is VT-022.
- Use strict schemas on both sides of every persistent read/write, reject extra fields (including PCM), preserve null evidence, and skip unknown/corrupt session versions without crashing. Migration from pre-database UI preferences uses a read/write transaction and only inserts if absent. There is no prior IndexedDB schema to upgrade yet; future version changes must add Dexie upgrade transactions and tests. Clear sessions only after explicit UI confirmation and keep preferences intact.
- Derive stability from an immutable approximately one-second guarded/smoothed MIDI window using median absolute deviation in cents and a Theil-Sen cents-per-second trend. Require eight valid frames and a 0.6 valid ratio, then score with the lower of separately monotonic spread and trend components; all initial thresholds remain `CALIBRATION_REQUIRED` for VT-025.
- Own the stability window and sustained-note reducer inside the Worker session. Reset the window on unvoiced boundaries and confirmed guarded jumps, preserve the session-wide stable MIDI range, retain raw voiced duration across temporarily withheld octave candidates, and use separate 75/60 enter/exit scores to avoid stable-state flicker.

## Known risks

- Permission, AudioContext, native AudioWorklet, Dedicated Worker, full pitch pipeline, and main readout paths are covered with deterministic fakes and a production-preview 440 Hz synthetic stream, but no real microphone hardware, OS/browser permission UI, mobile Safari user activation, or 20-minute leak run has been verified.
- DSP, free/target practice, summaries, reactive history and local persistence are implemented. Offline reopen and real-device lifecycle QA remain outstanding. Unsaved previews and mode/target selection reset on reload; theme/locale/A4 and explicitly saved summaries persist. Storage may be unavailable/evicted by the browser; failures are reported with in-memory practice retained. Input device label is null until exposed by audio metadata. The 30,000-frame test is not a real-time leak run.
- A first 4096-sample window takes about 85 ms at 48 kHz or 93 ms at 44.1 kHz before compute. The 40 ms UI publication interval is below the normal 42.7/46.4 ms hop interval, and full-DSP compute averaged about 1.5 ms in automated benchmarks, but input-to-paint latency has not yet been instrumented on the baseline devices and persistent pitch changes can still incur median/guard confirmation lag.
- A genuine instantaneous jump needs two additional observations before confirmation, adding about 85 ms at 48 kHz / 2048 hop. Three persistent octave-error frames will also be accepted because temporal evidence cannot distinguish them from a real jump; the seven-semitone threshold and two-semitone candidate cluster require VT-025 voice/device calibration.
- The initial `minConfidence = 0.9`, 6 dB adaptive margin, and 2000/500 ms rise/fall constants only have deterministic synthetic evidence and require VT-025 voice/device/room calibration. Frames above the fixed -55 dBFS floor but below an elevated adaptive gate still run YIN to preserve recovery correctness, so the adaptive gate is not a guaranteed compute-saving boundary.
- The one-second window, eight-frame/0.6 evidence gate, 80-cent spread scale, 100 cents/s trend scale, 300 ms onset, and 75/60 stability hysteresis only have deterministic synthetic evidence. They describe engineering feedback, not vocal quality, and require VT-025 real-voice/device/room calibration.
- PWA manifest generation and the update prompt build are covered, but installability, offline reopen, and update activation remain VT-023/VT-024 acceptance work.
- The PWA currently uses one SVG icon; platform-specific PNG icon QA remains for the release milestone.
- Automated browser evidence is Chromium-only on this machine; Safari, Firefox, mobile browsers, and manual visual/accessibility QA remain unverified.
- The Windows checkout uses CRLF while Biome's current formatter default expects LF, so the full `pnpm check` evidence required temporary line-ending normalization; a repository-wide EOL policy remains to be resolved without mixing mechanical churn into DSP work.

## Update contract

Keep all 26 backlog rows in order, keep at most one `in-progress` row, record only commands actually run, replace this handoff after each task, and run `node .agents/skills/pitchy-router/scripts/route-progress.mjs` after every edit.
