# 7-Game Series — Data Model & API Contract (v0.2)

> Companion to [GAME_DESIGN.md](./GAME_DESIGN.md). Game rules live there; this doc
> defines how they are stored and exposed. Both frontend and backend build against it.
> Items marked **PROPOSED** need sign-off from the team.
>
> **Source of truth for shapes:** `packages/contracts` (Zod schemas + endpoint registry).
> **Source of truth for rules:** `packages/rules` (pure functions). If this doc and the
> code disagree, the code wins and this doc gets fixed.

## 1. Proposed stack (**PROPOSED**)

| Layer | Choice | Why |
|---|---|---|
| Repo | TypeScript monorepo (pnpm workspaces) | One language; the rules package is shared without duplication. |
| `apps/web` | React + Vite + `vite-plugin-pwa` | Installable PWA, offline cache, fast check-offs. |
| `apps/api` | Node + Hono (or Fastify) | Small, typed, easy to deploy anywhere. |
| `packages/rules` | Pure TS, zero dependencies | Game result, Rally odds, calendar math. Used by web and API. |
| `packages/contracts` | Zod schemas for API requests/responses | One source of truth for types and runtime validation on both sides. |
| Database | Postgres + Drizzle ORM | Relational data with strong constraints; date math in SQL when needed. |
| Auth | Email magic link (passkeys later) | No passwords to manage for an MVP. |
| Jobs | One scheduled worker, every 15 min | Finalizes games 30 min after each user's local midnight (§5). |

## 2. Conventions

- IDs are UUIDv7 (time-sortable).
- **Game dates are local calendar dates** (`DATE`, e.g. `2026-10-05`), never timestamps.
  Event times (check-offs, rolls) are `TIMESTAMPTZ` in UTC.
- Generic data names only (see GAME_DESIGN §3); baseball wording lives in the frontend.
- Anything a finalized game depends on is **snapshotted onto the game or lineup row**,
  so editing tasks or starters never rewrites history.

## 3. Entities

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| display_name | text | Used as the user's team name. |
| timezone | text | IANA zone, e.g. `America/Chicago`. |
| start_date | date | Sign-up date (local). Anchors the season calendar. |
| default_lock_time | time null | Default "first pitch" lock time. Null = lock on first check-off only. |
| created_at | timestamptz | |

### `login_tokens` and `sessions`
| Table | Columns |
|---|---|
| `login_tokens` | `token_hash` (PK), `email`, `expires_at` (15 min), `used_at` |
| `sessions` | `id_hash` (PK), `user_id`, `created_at`, `expires_at` (30 days, sliding) |

Only hashes of tokens and session ids are stored.

### `seasons`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| number | int | 1, 2, 3 … |
| start_date | date | A Monday. |
| play_end_date | date | `start_date + 25 weeks − 1 day` (a Sunday). |
| offseason_end_date | date | `play_end_date + 7 days`. Next season starts the day after. |
| win_goal | int null | User-set target, e.g. 120 of 175. |
| status | enum | `upcoming`, `active`, `offseason`, `complete` |
| wins, losses, rally_wins | int | Cached aggregates, rebuilt by the finalizer. |
| series_won, series_lost | int | Cached. |
| run_differential | int | Cached. |

Unique: `(user_id, number)`.

### `series`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id, season_id | uuid FK | |
| number | int | 1–25 within the season. |
| start_date | date | Monday. |
| opponent_name | text | Generated, e.g. "Snooze City Alarms". |
| opponent_colors | text[2] | Hex pair. |
| opponent_seed | int | Seed for badge generation. |
| wins, losses | int | Cached. |
| result | enum null | `won`, `lost`, null until 4 wins or 4 losses. |
| iron_man | bool | Set at series end (no rainouts and ≥5 wins). |

Unique: `(season_id, number)`.

### `task_definitions` (roster)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| name | text | |
| notes | text null | |
| points | int ≥ 1 | Default 1. Free-form. |
| status | enum | `active`, `injured`, `retired` |
| il_started_on | date null | |
| il_min_until | date null | `il_started_on + 3 days`. Can't be reactivated before this. |
| current_streak, longest_streak | int | Cached; see §6. |

### `day_templates` (starters, fixed rotation)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| weekday | int 1–7 | 1 = Monday. Unique per user (fixed rotation). |
| name | text | e.g. "Gym Day". |
| threshold | int ≥ 1 | "Runs to win." The opponent's scoreboard score is one less (see `rules.scoreline`). At least 1, so an empty lineup can't win. |
| min_tasks | int null | |
| lock_time | time null | Overrides the user default. |

### `day_template_tasks`
| Column | Type | Notes |
|---|---|---|
| template_id, task_id | uuid FK | PK on the pair. |
| position | int | Batting order. |
| required | bool | Must-hit. |
| role | enum | `lineup`, `bench` |

### `games`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id, series_id | uuid FK | |
| game_number | int 1–7 | Position in the series (Monday = 1). |
| scheduled_date | date | Original day. |
| played_date | date | Equals `scheduled_date`, or the makeup day after a Rainout. |
| slot | int 1–2 | 2 = second game of a doubleheader. |
| postponed | bool | True if this game was rained out and moved. |
| template_id | uuid FK | Starter used. |
| starter_name, threshold, min_tasks, lock_time | snapshot | Copied from the template (lock time falls back to the user default) when the lineup is built. |
| lineup_built_at | timestamptz null | Lineups are built at the start of the played day, so starter edits apply to every game not yet built. |
| locked_at | timestamptz null | First pitch. |
| status | enum | `scheduled`, `live`, `final` |
| runs, tasks_done, missed_required | int | Computed at final. |
| result | enum null | `W`, `L` |
| result_detail | enum null | `clean`, `short` (runs/min not met), `forfeit` (1 must-hit), `no_appeal` (2+), `rally` |
| rally_deadline | timestamptz null | 11:59 local on the day after `played_date`. |
| finalized_at | timestamptz null | |

Unique: `(series_id, game_number)` and `(user_id, played_date, slot)`.

### `lineup_entries`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| game_id | uuid FK | |
| task_id | uuid FK | |
| task_name, points, required | snapshot | Frozen at lock. |
| position | int | |
| role | enum | `lineup`, `bench`, `subbed_out` |
| subbed_in_at | timestamptz null | Logged when a bench task enters a live game. |
| completed_client_at | timestamptz null | Device time of check-off (supports offline). |
| completed_received_at | timestamptz null | Server receipt time. |
| partial | bool | "Warning track" flag for a missed must-hit. |

### `rally_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source | enum | `monthly`, `series_bonus` |
| month | char(7) | `YYYY-MM`. Expires at the end of that month. |
| used_game_id | uuid null | |
| used_at | timestamptz null | |

### `rally_rolls`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| game_id | uuid FK **unique** | One roll per game, ever. |
| token_id | uuid FK unique | |
| odds_pct | int 10–40 | |
| odds_breakdown | jsonb | `{ base, closeness, missedMustHit, warningTrack, runCushion, capped }` |
| roll | int 1–100 | CSPRNG. Hit if `roll ≤ odds_pct`. |
| hit | bool | |
| created_at | timestamptz | |

### `rainout_allowances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source | enum | `monthly`, `iron_man` |
| month | char(7) null | Set for `monthly` (expires at month end). |
| expires_on | date null | For `iron_man`: the season's `play_end_date`. |
| used_game_id | uuid null | |

## 4. Key invariants (enforced in the rules package and the database)

1. One `day_template` per weekday per user.
2. A game can be postponed only while `status = scheduled` and `locked_at IS NULL`, and
   never when its `scheduled_date` is a Sunday or when it is already a makeup game.
3. A makeup `played_date` must be later in the same series, on a day that has no other
   makeup game (`slot = 2` is unique per user and date).
4. Must-hits and threshold can't change after `locked_at`. Substitutions after lock may
   only replace non-required entries.
5. Check-offs are accepted only when `completed_client_at` falls on `played_date` in local
   time (before midnight) **and** the game isn't final. A device clock may be up to 5 min
   ahead of the server. The finalizer waits a 30-minute settle window after midnight so
   check-offs made before midnight on a slow connection still land
   (`rules.validateCheckoff`, `rules.finalizeAfter`).
6. A Rally roll requires `result = L`, `missed_required ≤ 1`, `now < rally_deadline`, an
   unused token for the current month, and no other rally roll in the series.
7. Monthly limits: at most 2 rally tokens and 3 rainouts held at once; at most one
   `iron_man` rainout earned per calendar month and one held at a time.
8. Nothing is created, used, or granted for dates in Spring Training or the offseason.

## 5. Scheduled finalizer

Runs every 15 minutes, processing each user whose local midnight plus the 30-minute settle window has passed since the last run:

1. **Finalize** yesterday's live/scheduled games: compute runs, tasks done, missed
   must-hits, result, `result_detail`, and set `rally_deadline`.
2. **Update streaks**: task streaks and the season win streak (§6).
3. **Close series** when a series' Sunday finishes: set `iron_man` and grant the bonus
   rainout if earned. Grant the `series_bonus` rally token if the series was won with no
   rally used and none has been granted this month.
4. **Create today's game(s)** from the weekday's template (and the makeup game if one
   is scheduled), with snapshots of starter, threshold, and lineup.
5. **Roll the calendar**: start a new series on Mondays, and switch the season to
   `offseason` or start the next season when the date is reached.
6. **Grant monthly allowances** on the 1st (1 rally token, 2 rainouts) and expire the
   previous month's.

Every step is idempotent (keyed by user + date), so a re-run or a crash never
double-grants or double-finalizes.

Rally Cap results are applied when the roll happens, not by the finalizer: a hit flips
the game to `W`/`rally` and updates the series and season aggregates immediately.

## 6. Streak rules

- **Task streak**: consecutive *lineup appearances* where the task was completed. Days
  the task isn't scheduled don't count either way. IL time and the offseason freeze it.
- **Win streak (season)**: consecutive game results of W (including rally Ws), ordered by
  `played_date, slot`. Resets to 0 at every season start for Rally odds; the
  carried-over value is shown on the profile only.
- **Career longest streaks** carry across seasons and are display-only.

## 7. Shared rules package (`packages/rules`)

Pure functions, no I/O, fully unit-tested. The client calls them for instant feedback;
the server calls the same functions to make results final.

```ts
evaluateGame(lineup, { threshold, minTasks }) → { runs, tasksDone, missedRequired, result, detail }
rallyEligibility(game, tokens, seriesRallyUsed, now) → { eligible, reason? }
rallyOdds({ seasonWinStreak, runs, threshold, tasksDone, minTasks, missedRequired, partial }) → { pct, breakdown }
canPostpone(game, series, allowances) → { ok, reason?, makeupDates[] }
seasonCalendar(startDate) → { springTrainingEnd, seasons: [{ number, start, playEnd, offseasonEnd }] } (lazy)
seriesStatus(games) → { wins, losses, clinched, eliminated, label }  // e.g. "Leads 3–1"
seasonPace(record, winGoal, gamesRemaining) → { pace, gamesBehind }
```

## 8. REST API (v1)

All endpoints require auth and are scoped to the signed-in user. Request and response
bodies are defined as Zod schemas in `packages/contracts`.

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/magic-link` | Body: `{ email }`. Without an email provider (dev), the response includes `devToken`. |
| POST | `/v1/auth/verify` | Body: `{ token, timezone }`. Creates the account on first sign-in and sets an httpOnly session cookie. |
| POST | `/v1/auth/logout` | Ends the session. |

### Profile & calendar
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/me` | Profile, timezone, current season/series summary, allowances. |
| PATCH | `/v1/me` | Display name, timezone, default lock time. |
| GET | `/v1/calendar` | Spring Training / season / offseason boundaries. |

### Roster & starters
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/v1/tasks` | List / create tasks. |
| PATCH/DELETE | `/v1/tasks/:id` | Edit / retire (soft delete). |
| POST | `/v1/tasks/:id/injured-list` | Place on IL (3-day minimum). |
| DELETE | `/v1/tasks/:id/injured-list` | Activate (only after `il_min_until`). |
| GET | `/v1/starters` | All 7 weekday templates. |
| PUT | `/v1/starters/:weekday` | Replace a template (name, threshold, min, lineup, bench). Applies to future games only. |

### Games
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/today` | Today's game(s) with lineups and live scoreboard. |
| GET | `/v1/games/:id` | Box score. |
| PATCH | `/v1/games/:id/lineup` | Pre-lock edits: order, add/remove tasks, required flags, threshold. |
| POST | `/v1/games/:id/lock` | Lock manually (also happens automatically). |
| POST | `/v1/games/:id/entries/:entryId/complete` | Body: `{ clientAt, partial? }`. Idempotent. |
| DELETE | `/v1/games/:id/entries/:entryId/complete` | Undo a check-off (before midnight only). |
| PATCH | `/v1/games/:id/entries/:entryId` | Body: `{ partial }`. Mark a must-hit as partly done ("warning track"). |
| POST | `/v1/games/:id/substitutions` | Body: `{ outEntryId, inEntryId }` (a bench entry on the same game). Post-lock, non-required only. |
| GET | `/v1/games/:id/rainout` | Rainout eligibility and makeup date options. |
| POST | `/v1/games/:id/rainout` | Body: `{ makeupDate }`. Uses an allowance. |

### Rally Cap
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/games/:id/rally` | Eligibility, odds, and breakdown (shown before rolling). |
| POST | `/v1/games/:id/rally` | Header `Idempotency-Key`. Rolls once; repeat calls return the same result. |

### Series & seasons
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/series/current` | 7-game strip, opponent, series status label. |
| GET | `/v1/series/:id` | Past series. |
| GET | `/v1/seasons/current` | Standings, pace, GB, streaks. |
| GET | `/v1/seasons/:id` | Past season + awards. |
| PATCH | `/v1/seasons/:id` | Set `win_goal` (during Spring Training or the offseason only). |

### Error shape
```json
{ "error": { "code": "GAME_LOCKED", "message": "First pitch has passed; must-hits are locked." } }
```
Codes include: `GAME_LOCKED`, `GAME_FINAL`, `NOT_ELIGIBLE`, `NO_ALLOWANCE`,
`INVALID_MAKEUP_DATE`, `IL_MINIMUM`, `OUT_OF_SEASON`, `STALE_CHECKOFF`.

## 9. Offline & sync (frontend ↔ backend contract)

- The PWA caches `/v1/today`, `/v1/series/current`, and the roster.
- Check-offs are applied optimistically using `packages/rules`, then queued in IndexedDB
  as `{ entryId, clientAt, partial }` and replayed in order when back online.
- The server is authoritative: a replay rejected with `STALE_CHECKOFF` (after midnight
  or game final) is removed from the queue, and the UI shows the corrected score.
- Rally rolls and rainouts **require a connection**. They are never queued.

## 10. Build order (suggested milestones)

1. `packages/rules` + tests: game evaluation, Rally odds, calendar math.
2. Schema + migrations; auth; roster and starters CRUD.
3. Daily game creation + finalizer job; `/v1/today` and check-offs.
4. PWA: Today screen and Series strip (offline check-offs).
5. Rainouts/doubleheaders, IL, Rally Cap (server roll + dice animation).
6. Seasons: standings, pace, Review Week hub, opponent generator polish.
