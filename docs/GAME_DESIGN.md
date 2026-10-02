# 7-Game Series — Game Design Spec (v0.2)

> Status: pre-code planning. This doc is the shared source of truth for design,
> frontend, and backend. Decisions marked **DECIDED** are locked for MVP;
> items marked **OPEN** need a call before implementation.

## 1. Concept

Every week is a best-of-7 playoff series. Every day is a game. You win a game by
completing the tasks in that day's lineup. Every game and every series rolls up into
a season record.

## 2. Decisions so far

| # | Topic | Decision |
|---|---|---|
| 1 | Opponents | **DECIDED** — Generic, auto-generated opposing teams (one per week). |
| 2 | Games 5–7 after clinch/elimination | **DECIDED** — Always played. Every game counts toward the season record. |
| 3 | Rotation | **DECIDED** — Fixed: each weekday has one assigned starter (theme). |
| 4 | Platform | **DECIDED** — Mobile-first PWA. |
| 5 | Must-hit strictness | **DECIDED** — Missing a must-hit is a loss. Two or more missed must-hits = automatic loss, no appeal. |
| 6 | Rally Cap scope | **DECIDED** — Any loss can be contested with a Rally Cap, except one with 2+ missed must-hits (§6). |
| 7 | Skipping days / tasks | **DECIDED** — Only Rainouts (whole day) and the Injured List (a task). |
| 8 | Rainout outcome | **DECIDED** — The game is made up as a doubleheader later in the same series (§7). |
| 9 | Rainout allowance | **DECIDED** — 2 per month, with a 3rd earnable (§7). |
| 10 | Seasons | **DECIDED** — Two seasons per year, anchored to the user's start date, with offseason weeks (§5). |
| 11 | Day / week boundaries | **DECIDED** — Days run 00:00–23:59 in the user's local time. Weeks (series) run Monday–Sunday. |
| 12 | Point values | **DECIDED** — Free-form. Every task defaults to 1 run, and the user can set any whole number. |

## 3. Glossary (UI term → generic data term)

The backend stores generic names; the frontend maps them to baseball terms. This keeps
future sport skins possible.

| UI term | Data term | Meaning |
|---|---|---|
| Season | `season` | 25 series of play followed by 1 offseason week (§5). |
| Offseason | `offseason` | Rest/prep week(s). No games, nothing recorded. |
| Spring Training | `preseason` | The partial week before a user's first Monday. Not counted. |
| Series | `series` | One Monday–Sunday week, 7 games. |
| Game | `game` | One scheduled day's contest. |
| Doubleheader | `game.slot = 2` | A made-up game played on the same day as another game. |
| Opponent | `opponent` | Generated team name; their "score" is the day's threshold. |
| Roster | `task_definition` | All of a user's tasks/habits. |
| Starter | `day_template` | Fixed weekday theme: default lineup, must-hits, threshold. |
| Lineup | `lineup_entry` | Tasks scheduled for a game, in priority (batting) order. |
| Must-hit | `required = true` | A lineup task that must be completed to win. |
| Runs | `points` | Points earned for completed tasks (default 1 per task). |
| Bench | `bench` | Optional tasks that can be subbed into a live game. |
| Injured List (IL) | `paused` | A task is paused; removed from lineups, streak frozen. |
| Rainout | `postponed` | A game called off and moved to a doubleheader (§7). |
| Rally Cap | `comeback_token` | A chance-based appeal of a loss (§6). |
| First pitch | `locked_at` | The moment the game's rules lock. |
| Final | `final` | The game result recorded at midnight. |

## 4. Winning a game

A game is a **W** when all of the following are true at 23:59:59 local time:

1. Every must-hit in the lineup is complete.
2. Runs ≥ the threshold (the opponent's score).
3. Completed task count ≥ the minimum (if the starter sets one).

Results:

- **W**: all conditions met.
- **L**: runs or minimum not met, all must-hits done. Rally Cap eligible.
- **L (forfeit)**: exactly one must-hit missed. Rally Cap eligible.
- **L (no appeal)**: two or more must-hits missed. Not Rally Cap eligible.
- **W (rally)**: a loss overturned by a successful Rally Cap.

**Points.** Each task is worth 1 run unless the user sets a different whole number.
Thresholds are set in runs, so a user who never touches point values can think of the
threshold as "tasks completed."

**First pitch lock.** Before first pitch, the lineup, must-hits, and threshold are all
editable. After the lock (a user-set time, or the first check-off, whichever comes first):

- The threshold and must-hits are frozen.
- Bench substitutions are allowed only for non-required tasks and are logged in the
  box score.
- Point values are copied onto the lineup entries, so later roster edits never
  rewrite history.

**Day boundary.** Check-offs close at 23:59:59 local time. The game goes final at
midnight. Midnight starts the next game, so there is no grace period for tasks.

## 5. Seasons and offseason

### Calendar math

A year is treated as 52 weeks, split into two seasons of 26 weeks each:

```
| Season 1: 25 series (~5 mo 3 wk) | Off: 1 wk | Season 2: 25 series (~5 mo 3 wk) | Off: 1 wk | → repeat
```

- **25 weeks of play + 1 offseason week = 26 weeks ≈ 6 months**, so a year holds two
  seasons and 2 offseason weeks in total.
- Season 1 begins on the **first Monday on or after the user's start date**.
- The days between sign-up and that Monday are **Spring Training**. The user can set
  up the roster and rotation and try check-offs, but nothing is recorded.
- Season 2 begins the Monday after the first offseason week. Season 3 begins the
  Monday after the second offseason week, and so on.
- 52 weeks is 364 days, so season start dates drift about one day earlier each
  calendar year. That's acceptable; series always stay Monday-aligned.

**OPEN**: should users be allowed to combine both offseason weeks into one 2-week
offseason (making that season 26 series and the next 24)? Suggested default: two
separate weeks, with an optional "combine" setting chosen during the prior offseason.

### During the offseason

- No games, no check-offs, no results.
- Streaks (task streaks and win streaks) are **frozen**: not broken and not extended.
  They resume when the next season starts. (**OPEN**: confirm streaks carry over rather
  than reset.)
- No Rally Caps or Rainouts are used or granted.
- Offseason activities:
  - **Season review**: final record, awards (Series MVP task, longest streak, best
    comeback), season-over-season comparison.
  - **Front office**: retire tasks, add tasks ("free agency"), rebuild starters, set the
    next season's goal.

### Season standings

Each season tracks:

- game record (W–L, win %), with Rally wins counted as Ws and also tallied separately,
- series record (series won–lost),
- run differential (runs scored minus thresholds),
- sweeps, comeback series (won after trailing 0–3, 1–3), Rally Cap wins.

**Season goal**: the user sets a target win count (e.g. 120 of 175 games). The app
shows pace and Games Behind (GB), so every game matters even after a series is decided.
Season stats reset each season; lifetime ("career") stats keep accumulating.

## 6. Rally Cap (comeback token)

A genuine, rare shot at turning a loss into a win. It should land often enough on a hot
streak to build confidence, and miss often enough that nobody plans around it.

### Eligibility

- The game is an **L** with **at most one** missed must-hit.
- Two or more missed must-hits = no roll offered.
- The user has a token available.
- The roll is available from midnight (game goes final) until **11:59 a.m. the next
  day**. If the window passes without a roll, the L stands.
- Rally Caps cannot be used on Spring Training or offseason days.

### Token supply

- **1 token per calendar month** by default.
- **Earn a 2nd token** that month by winning a series without using a Rally Cap.
- Hard cap of 2 held at once. Tokens do not roll over between months.
- Max **one Rally Cap per series**.
- A roll uses up the token whether it hits or misses.

### Odds

Shown to the user **before** they roll. Transparent odds keep expectations honest.

**Step 1: base chance from the current win streak** (games won before today):

| Win streak | Base chance |
|---|---|
| 0–1 | 20% |
| 2 | 24% |
| 3 | 28% |
| 4 | 31% |
| 5+ | 34% |

**Step 2: how close the game was.** Closeness = the lower of
`runs ÷ threshold` and `tasks done ÷ minimum`.

| Situation | Adjustment |
|---|---|
| Closeness ≥ 75% (or score fully met) | 0 |
| Closeness 50–74% | −5% |
| Closeness < 50% | −10% |
| One must-hit missed | −5% |

**Step 3: bonuses**

| Bonus | Adjustment |
|---|---|
| Warning track: the missed must-hit was marked "partial" before midnight | +4% |
| Run cushion: runs ≥ threshold + 50% | +2% |

**Limits**: the result is capped at **40%** and floored at **10%**. A cold streak never
lowers the base below 20%; only a poor game does.

Examples:

| Scenario | Chance |
|---|---|
| 5-game win streak, missed one must-hit (partially done), scored 8 vs 5 | 34 − 5 + 4 + 2 = **35%** |
| No streak, all must-hits done, scored 4 vs 5 | **20%** |
| 3-game streak, missed one must-hit, scored 2 vs 5 | 28 − 10 − 5 = **13%** |
| No streak, one must-hit missed, nothing else done | 20 − 10 − 5 = 5 → floor **10%** |

### Presentation

- Show it as a dice "at-bat" (in the spirit of tabletop dice baseball), e.g. a d20 with
  "Need 15+" for 30%.
- A hit is a **Walk-off W**: jumbotron moment, recorded as `W (rally)` in the box score
  and counted separately in season stats.
- A miss shows "Struck out looking." The game stays an L. No re-roll and no refund.

### Integrity (backend)

- The roll is made **server-side** with a CSPRNG. The client only animates the result it
  receives.
- Store `odds`, `odds_breakdown`, `roll`, `result`, `token_id`, and a timestamp. The
  record is immutable and idempotent per game: a refresh or retry returns the same
  result.

## 7. Rainouts and the Injured List

These are the real tools for deferring or skipping. They are planned, not rescues.

### Rainout (whole game → makeup doubleheader)

- Must be called **before first pitch** of that game. After the lock, the game must be
  played.
- The user picks a **makeup day later in the same series** (defaults to the next day).
  That day becomes a **doubleheader**: Game A is the day's own starter and lineup, and
  Game B is the postponed starter and lineup. Each game is decided on its own.
- Constraints:
  - A Rainout can't be called on **Sunday**, because no makeup day is left in the
    series. The UI shows "No dates left in the series."
  - At most **one doubleheader per day**, so a series can hold at most 3 Rainouts in
    practice (Mon→Tue, Wed→Thu, Fri→Sat style).
  - A makeup game can't itself be rained out.
- All 7 games are always played, so series and season records stay comparable.

### Rainout allowance

- **2 Rainouts per calendar month.** Unused ones do not roll over.
- **Earn a 3rd: "Iron Man" bonus.** Play a full series exactly as scheduled (no
  Rainouts, no doubleheaders) and win at least 5 of the 7 games. The bonus Rainout:
  - is limited to one earned per calendar month,
  - stays available until used or until the season ends, even across months,
  - can't be stacked: a user holds at most one bonus Rainout at a time.

  Why this incentive: the Rally Cap bonus rewards winning a series; the Rainout bonus
  rewards consistency (showing up every day as scheduled). They push different habits
  and don't double-reward the same week.

### Injured List (single task)

- Placing a task on the IL removes it from future lineups and freezes its streak.
- **Minimum stint: 3 days**, so the IL can't be used to dodge a single hard day.
- It can't be applied to a task in today's game after first pitch.
- Activating a task returns it to its starter's lineups the next day.
- IL stints pause automatically during the offseason and resume afterward.

## 8. Opponents (generic teams)

- A new opponent each week, generated from city + mascot word lists, e.g.
  *Snooze City Alarms, Couchville Cushions, Doomscroll Dynasty, Tomorrow Town Tigers,
  Excuse Bay Pirates, Netflix Valley Nightcaps*.
- Each opponent has a color pair and a simple generated badge. No real league marks,
  logos, or team names.

## 9. Core screens (PWA)

1. **Today**: scoreboard (runs vs. threshold), lineup with one-tap check-offs,
   must-hit indicators. Shows both games on a doubleheader day.
2. **Series**: 7-game strip, series score, broadcast-style status chyron.
3. **Film Room**: weekly setup of the fixed rotation, roster, IL, and Rainouts.
4. **Season**: standings, pace vs. goal, streaks, box score history.
5. **Rally Cap sheet**: shown on a final, eligible L. Odds breakdown and roll.
6. **Offseason hub**: season review, awards, front-office changes for the next season.

## 10. Architecture notes

- **Shared rules package** (TypeScript, pure functions): game result, Rally Cap
  eligibility and odds, Rainout and doubleheader validation, season calendar math,
  series and season aggregation. The client uses it for instant feedback; the server is
  authoritative at finalization and for all rolls.
- **Midnight job**: finalizes games per user timezone at 00:00 local. It also opens and
  closes Rally Cap windows, rolls the season and offseason calendar, and refreshes
  monthly token and Rainout allowances.
- **Timezone changes**: games are keyed by local calendar date. If a user travels, the
  current game keeps the timezone it started in, and the new zone applies from the next
  game.
- **Offline**: check-offs queue on the device with timestamps. The server accepts those
  timestamped before 23:59:59 local time on the game's date.

## 11. Open questions

1. Should users be able to combine the two offseason weeks into one 2-week block?
2. Do streaks carry over the offseason (frozen), or reset each season?
3. Is 11:59 a.m. the next day the right cut-off for rolling a Rally Cap?
