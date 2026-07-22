# Pitchy routing table

Read this file when selecting a milestone route or checking prerequisite boundaries.

| Route | Backlog items | Primary modules | Required evidence |
| --- | --- | --- | --- |
| `foundation` | VT-001–VT-002 | root config, `src/app`, CI | check, typecheck, unit, browser, build, E2E |
| `audio-thread` | VT-003–VT-007 | `src/audio`, error model | protocol tests, production worklet load, lifecycle cleanup |
| `pitch-dsp` | VT-008–VT-014 | `src/dsp`, `src/domain` | deterministic signals, cents error, octave rate, benchmark |
| `practice-ui` | VT-015–VT-019 | `src/components`, `src/features/practice` | browser tests, DPR checks, latency observations |
| `session-data` | VT-020–VT-022 | `src/domain`, `src/db`, summary/history | aggregation, migration, invalid-data and empty-data tests |
| `offline-pwa` | VT-023–VT-024 | PWA config and update UI | offline reopen and non-disruptive update E2E |
| `release-qa` | VT-025–VT-026 | E2E, audits, docs | supported browser matrix, privacy and performance reports |

## Dependency rule

Route to the lowest numbered incomplete core item. A user may explicitly request a later isolated investigation, but do not mark that later item complete when its acceptance depends on unfinished earlier work.

## Full handoff chain

Run in this order:

1. `pnpm check`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm test:browser`
5. `pnpm build`
6. `pnpm test:e2e`
7. `pnpm check:size`

Treat any skipped command as an explicit remaining risk in `pitchy-progress/SKILL.md`.
