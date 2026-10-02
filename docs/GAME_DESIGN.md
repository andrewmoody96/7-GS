# 7-Game Series — Game Design Spec (v0.1)

> Status: pre-code planning. This doc is the shared source of truth for design,
> frontend, and backend. Decisions marked **DECIDED** are locked for MVP;
> items marked **OPEN** need a call before implementation.

## 1. Concept

Every week is a best-of-7 playoff series. Every day is a game. You win a game by
completing the tasks in that day's lineup. The weekly series result and every
individual game roll up into a season-long record.

## 2. Decisions so far

| # | Topic | Decision |
|---|---|---|
| 1 | Opponents | **DECIDED** — Generic, auto-generated opposing teams (one per week). |
| 2 | Games 5–7 after clinch/elimination | **DECIDED** — Always played. Every game counts toward the season record. |
| 3 | Rotation | **DECIDED** — Fixed: each weekday has one assigned starter (theme). |
| 4 | Platform | **DECIDED** — Mobile-first PWA. |
| 5 | Must-hit strictness | **DECIDED** — Missing a must-hit is a loss. Exactly one miss may be contested with a Rally Cap token (§6). Two or more misses = automatic loss, no appeal. |
| 6 | Skipping days / tasks | **DECIDED** — Handled only by Rainouts (whole day) and the Injured List (a task). Rally Caps are not a skip mechanism. |

## 3. Glossary (UI term → generic data term)

The backend stores generic names; the frontend maps them to baseball terms. This keeps
future sport skins possible.

| UI term | Data term | Meaning |
|---|---|---|
| Season | `season` | A calendar year (**OPEN**: confirm). |
| Series | `series` | One week, 7 games. |
| Game | `game` | One day. |
| Opponent | `opponent` | Generated team name; their "score" is the day's threshold. |
| Roster | `task_definition` | All of a user's tasks/habits. |
| Starter | `day_template` | Fixed weekday theme: default lineup, must-hits, threshold. |
| Lineup | `lineup_entry` | Tasks scheduled for a game, in priority (batting) order. |
| Must-hit | `required = true` | Lineup task that must be completed to win. |
| Runs | `points` | Points earned for completed tasks. |
| Bench | `bench` | Optional tasks that can be subbed into a live game. |
| Injured List (IL) | `paused` | A task is paused; removed from lineups, streak frozen. |
| Rainout | `postponed` | A whole game is called off (§7). |
| Rally Cap | `comeback_token` | Chance-based appeal of a single missed must-hit (§6). |
| First pitch | `locked_at` | Moment the game's rules lock. |
| Final | `final` | Game result recorded at the user's day-end. |

## 4. Winning a game

A game is a **W** when all of the following are true at the user's day-end:

1. Every must-hit in the lineup is complete.
2. Runs ≥ the threshold (the opponent's score).
3. Completed task count ≥ the minimum (if the starter sets one).

Results:

- **W**: all conditions met.
- **L**: runs or minimum not met.
- **L (forfeit)**: one or more must-hits missed. With exactly one missed, the user may
  use a Rally Cap.
- **PPD**: postponed by a Rainout (no decision).

**First pitch lock.** Before first pitch, the lineup, must-hits, and threshold are all
editable. After the lock (a user-set time, or the first check-off, whichever comes first):

- The threshold and must-hits are frozen.
- Bench substitutions are allowed only for non-required tasks and are logged in the
  box score.
- Point values are copied onto the lineup entries, so later roster edits never
  rewrite history.

## 5. Series and season

- A series is decided at 4 wins, but all 7 games are played. The UI tells the story
  ("Series clinched 4–1 · Game 6 tonight · Playing for the season record").
- **Season standings** track:
  - game record (W–L, win %),
  - series record (series won–lost),
  - run differential (runs scored minus thresholds),
  - sweeps, comeback series (won after trailing 0–3, 1–3), and Rally Cap wins.
- **Season goal**: the user sets a target (e.g. a "100-win season"). The app shows
  pace and Games Behind (GB), so late-week games in a decided series still move the needle.
- **OPEN**: a year-end "postseason" (e.g. December is playoff month, seeded by win %).

## 6. Rally Cap (comeback token)

The goal: a rare, honest shot at saving a day when a single must-hit slipped. It should
land often enough on a hot streak to build confidence, and miss often enough that
nobody plans around it.

### Eligibility

- Exactly **one** must-hit was missed. Two or more misses = no roll is offered.
- All other win conditions (threshold and minimum) are met. The Rally Cap only
  appeals the must-hit, never a short score. (**OPEN**: confirm.)
- The user has a token available.
- It is used between the miss becoming certain and the day-end plus grace window.
  Once the game is final without a roll, the chance is gone.

### Token supply

- **1 token per calendar month** by default.
- **Earn a 2nd token** that month by winning a series without using a Rally Cap.
- Hard cap of 2 held at once. Tokens do not roll over between months.
- Max **one Rally Cap per series**.
- A roll uses up the token whether it hits or misses.

### Odds

Shown to the user **before** they roll. Transparent odds keep expectations honest.

| Current win streak (games before today) | Chance |
|---|---|
| 0–1 | 20% |
| 2 | 24% |
| 3 | 28% |
| 4 | 31% |
| 5+ | 34% |

Modifiers:

- **Warning track (+4%)**: the missed must-hit was partially done (user marks it
  "partial" before day-end).
- **Run cushion (+2%)**: runs ≥ threshold + 50%.
- **Hard cap: 40%.** **Floor: 20%.** A cold streak never lowers the odds below the base.

Expected value: a typical user gets about 1.3 tokens a month at roughly 25%, which
works out to about one Rally win every 3 months. A hot-streak user lands roughly 1 in 3.
The win feels earned and still surprising.

### Presentation

- Show it as a dice "at-bat" (in the spirit of tabletop dice baseball), e.g. a d20 with
  "Need 15+" for 30%.
- A hit is a **Walk-off W**: jumbotron moment, recorded as `W (rally)` in the box score
  and counted separately in season stats.
- A miss shows "Struck out looking." The game stays an L. No re-roll and no refund.

### Integrity (backend)

- The roll is made **server-side** with a CSPRNG. The client only animates the result it
  receives.
- Store `odds`, `modifiers`, `roll`, `result`, `token_id`, and a timestamp. The record is
  immutable and idempotent per game: a refresh or retry returns the same result.

## 7. Rainouts and the Injured List

These are the real tools for deferring or skipping. They are planned, not rescues.

### Rainout (whole day)

- **OPEN**: allowance (proposal: 2 per month).
- Must be called **before first pitch**. After the lock, the game must be played.
- Result: the game becomes **PPD (no decision)**. It counts in neither column, and the
  series becomes best-of-the-remaining. (**OPEN** alternative: make it up as a
  doubleheader later in the same series.)

### Injured List (single task)

- Placing a task on the IL removes it from future lineups and freezes its streak.
- **Minimum stint: 3 days**, so the IL can't be used to dodge a single hard day.
- It can't be applied to a task in today's game after first pitch.
- Activating a task returns it to its starter's lineups the next day.

## 8. Opponents (generic teams)

- A new opponent each week, generated from city + mascot word lists, e.g.
  *Snooze City Alarms, Couchville Cushions, Doomscroll Dynasty, Tomorrow Town Tigers,
  Excuse Bay Pirates, Netflix Valley Nightcaps*.
- Each opponent has a color pair and a simple generated badge. No real league marks,
  logos, or team names.

## 9. Core screens (PWA)

1. **Today**: scoreboard (runs vs. threshold), lineup with one-tap check-offs,
   must-hit indicators, and Rally Cap prompt when eligible.
2. **Series**: 7-game strip, series score, broadcast-style status chyron.
3. **Film Room**: weekly setup of the fixed rotation, roster, IL, and Rainouts.
4. **Season**: standings, pace vs. goal, streaks, box score history.

## 10. Architecture notes

- **Shared rules package** (TypeScript, pure functions): game result, Rally Cap
  eligibility and odds, series and season aggregation. The client uses it for instant
  feedback; the server is authoritative at finalization and for all rolls.
- **Day-end job**: finalizes games per user timezone and day-end time
  (**OPEN**: default day-end, e.g. 3:00 a.m. for night owls).
- **Offline**: check-offs queue on device with timestamps. The server accepts those
  timestamped before day-end.

## 11. Open questions

1. Should a Rally Cap require the threshold to be met, or can it also cover a short score?
2. Rainout result: no decision, or a makeup doubleheader?
3. Rainout allowance per month.
4. Season = calendar year? Year-end postseason?
5. Default day-end time and week start day.
6. Point values: free-form per task, or fixed tiers (single 1 / double 2 / homer 4)?
