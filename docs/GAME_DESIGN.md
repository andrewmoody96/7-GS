# 7-Game Series — Game Design Spec (v0.4)

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
| 7 | Skipping days / tasks | **DECIDED** — Only Rainouts (planned, whole day), Suspended games (emergencies) and the Injured List (a task). |
| 8 | Rainout outcome | **DECIDED** — The game is made up as a doubleheader later in the same series (§7). |
| 9 | Rainout allowance | **DECIDED** — 2 per month, with a 3rd earnable (§7). |
| 10 | Seasons | **DECIDED** — Two seasons per year, anchored to the user's start date, with offseason weeks (§5). |
| 11 | Day / week boundaries | **DECIDED** — Days run 00:00–23:59 in the user's local time. Weeks (series) run Monday–Sunday. |
| 12 | Point values | **DECIDED** — Free-form. Every task defaults to 1 run, and the user can set any whole number. |
| 13 | Offseason length | **DECIDED** — Exactly 1 review week per season. The weeks can't be combined. |
| 14 | Streaks across the offseason | **DECIDED** — Streaks pause and carry over, but never affect the new season's W/L (§5). |
| 15 | Rally Cap window | **DECIDED** — Until 11:59 a.m. the day after the game. |
| 16 | Weekly lineups | **DECIDED** — Each week is planned on a lineup card. Free edits until the week's first pitch; after that, lineups only grow (§4a). |
| 17 | Pinch hitters | **DECIDED** — A must-hit added after the week locks raises that day's runs to win by exactly its runs (§4a). |
| 18 | Non-required work | **DECIDED** — Lives on the bench. Promoting a bench task to must-hit makes it a pinch hitter. |
| 19 | One-off tasks | **DECIDED** — Retire when completed. A missed one-off must-hit moves to the next game day automatically (§4a). |
| 20 | Next week's card | **DECIDED** — Opens on Friday. |
| 21 | Emergencies | **DECIDED** — Suspended games, sharing the Rainout allowance (§7). |

## 3. Glossary (UI term → generic data term)

The backend stores generic names; the frontend maps them to baseball terms. This keeps
future sport skins possible.

| UI term | Data term | Meaning |
|---|---|---|
| Season | `season` | 25 series of play followed by 1 offseason week (§5). |
| Offseason (Review Week) | `offseason` | The 1 week at the end of each season. No games, nothing recorded. |
| Spring Training | `preseason` | The partial week before a user's first Monday. Not counted. |
| Series | `series` | One Monday–Sunday week, 7 games. |
| Game | `game` | One scheduled day's contest. |
| Doubleheader | `game.slot = 2` | A made-up game played on the same day as another game. |
| Opponent | `opponent` | Generated team name. Their scoreboard score is one less than your runs to win. |
| Runs to win | `threshold` | The runs you need for a W, set per starter. |
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
2. Runs ≥ the runs to win (the threshold).
3. Completed task count ≥ the minimum (if the starter sets one).

Results:

- **W**: all conditions met.
- **L**: runs or minimum not met, all must-hits done. Rally Cap eligible.
- **L (forfeit)**: exactly one must-hit missed. Rally Cap eligible.
- **L (no appeal)**: two or more must-hits missed. Not Rally Cap eligible.
- **W (rally)**: a loss overturned by a successful Rally Cap.

**The scoreboard never shows a tied final.** Just like baseball, a game can't end 4–4.

- The opponent's score is always one less than your runs to win. Reach your number and
  you're ahead (runs to win 4 → you win 4–3).
- A **W** always shows more runs than the opponent. A Rally Cap win that was short on
  runs is credited with walk-off runs, enough to win by one (2 runs vs. runs to win 5 →
  W 5–4).
- An **L** always shows fewer runs than the opponent. If you finished one run short, or
  piled up runs but missed a must-hit, the opponent is credited the go-ahead run
  (3 vs. runs to win 4 → L 3–4; 8 runs with a missed must-hit → L 8–9).
- A live game can be tied; only finals can't. Run differential uses these scoreboard
  numbers, so every W adds to it and every L subtracts.

**Points.** Each task is worth 1 run unless the user sets a different whole number.
Thresholds are set in runs, so a user who never touches point values can think of the
threshold as "tasks completed."

**First pitch lock.** Before first pitch, the lineup, must-hits, and threshold are all
editable. After the lock (a user-set time, or the first check-off, whichever comes first):

- The threshold and must-hits are frozen.
- Bench substitutions are allowed only for non-required tasks and are logged in the
  box score.
- Any active roster task, including one created today, can be added to the bench at any
  time until the game is final. It only counts once it's subbed in, so it never changes
  what a W requires.
- Point values are copied onto the lineup entries, so later roster edits never
  rewrite history.

**Day boundary.** Tasks must be checked off by 23:59:59 local time. Midnight starts the
next game, so there is no grace period for tasks. The result becomes official 30 minutes
later, so a check-off made at 11:58 p.m. on a weak connection still counts when it syncs.

## 4a. The weekly lineup card

Like a fantasy lineup, each series is planned as a week.

- **The card:** Film Room shows all 7 days of a week. Each day starts from its weekday
  starter; opening the card builds the week's lineups so they can be edited. (Starter
  edits after that apply from the next unbuilt day.)
- **When it opens:** the current week any time, and next week from **Friday** on, so a
  weekend "game planning" session can set the whole upcoming series. During Spring
  Training, Opening Week is open right away.
- **Before the week's first pitch:** anything goes. Add or remove tasks, reorder, set
  must-hits, change runs to win, place one-offs on specific days.
- **After the week's first pitch** (the earliest lock of any game that week, normally
  Monday's): lineups only grow. **The bar never drops.**
  - **Pinch hitter:** add a new must-hit to today or any later day, even mid-game. That
    day's runs to win rises by exactly the task's runs, so the cushion between runs to
    win and available runs stays the same. On the scoreboard the opponent "answers back"
    with the same number of runs.
  - **Bench:** add any task to a day's bench. Bench work is optional; it only counts once
    subbed in for a non-must-hit.
  - **Promote:** turning a bench task into a must-hit makes it a pinch hitter (same rule:
    its runs are new to the lineup, so runs to win rises by them).
  - **Require a batting task:** making a task already in the lineup a must-hit doesn't
    raise runs to win. Its runs were already available, so the cushion stays the same.
    (A carried-over one-off that was already planned that day works the same way.)
  - Not allowed: removing tasks, turning off must-hits, lowering runs to win.

### Recurring and one-off tasks

- **Recurring** tasks ("Lift weights") stay on the roster.
- **One-off** tasks ("Haircut for Dad's inauguration") retire automatically once the game
  they were completed in goes final.
- **A missed one-off must-hit carries over.** The day still counts (an L, a Rally Cap
  roll, or a Suspended game). The task is then added to the **next game day** as a
  pinch-hit must-hit, raising that day's runs to win, and repeats until it's done. It
  skips Review Week. A one-off that wasn't a must-hit doesn't move.

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

Offseason weeks can't be combined or moved. Tasks and starters can be edited at any
time during a season, so a longer break wouldn't add much. The week exists as a
built-in prompt to review the season and tweak the setup.

### During the offseason (Review Week)

- No games, no check-offs, no results.
- Streaks (task streaks and win streaks) are **frozen**: not broken and not extended.
  They resume when the next season starts.
- **Carried-over streaks never touch the new season's W/L.** They show on streak
  displays and in career stats only. Season W/L totals always start at 0–0, and the
  Rally Cap streak bonus uses **only wins from the current season**. A user who ends
  Season 1 on a 6-game streak starts Season 2 at the 20% base.
- No Rally Caps or Rainouts are used or granted.
- Offseason activities:
  - **Season review**: final record, awards (Series MVP task, longest streak, best
    comeback), season-over-season comparison.
  - **Front office**: retire tasks, add tasks ("free agency"), rebuild starters, set the
    next season's goal. All of this can also be done any time during the season; Review
    Week is just a dedicated moment for it.

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

**Step 1: base chance from the current win streak** (consecutive games won before today, counting only this season):

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

- Show it as a dice "at-bat" (in the spirit of tabletop dice baseball) using
  percentile dice (two d10s, 1–100), since odds move in 1% steps. Example: at 34%
  the screen reads "Need 34 or under."
- A hit is a **Walk-off W**: jumbotron moment, recorded as `W (rally)` in the box score
  and counted separately in season stats.
- A miss shows "Struck out looking." The game stays an L. No re-roll and no refund.

### Integrity (backend)

- The roll is made **server-side** with a CSPRNG. The client only animates the result it
  receives.
- Store `odds`, `odds_breakdown`, `roll`, `result`, `token_id`, and a timestamp. The
  record is immutable and idempotent per game: a refresh or retry returns the same
  result.

## 7. Rainouts, Suspended games and the Injured List

These are the real tools for deferring or skipping. One principle covers all three:
**after the week's first pitch, the bar never drops.** A Rainout or Suspension moves the
bar to another day; the IL changes who clears it.

| Situation | Tool |
|---|---|
| You know in advance a whole day is gone (travel, a wedding) | **Rainout**, before that day's first pitch |
| Something happens mid-day, or you couldn't open the app until the next morning | **Suspended game** |
| One task is impossible for a while (an injured ankle) | **Injured List** |
| You could have done it and didn't | The **L**, or a Rally Cap roll |

### Rainout (whole game → makeup doubleheader)

- Must be called **before first pitch** of that game (that day's, not the week's). After
  that, use a Suspended game for emergencies.
- The game moves with its full lineup: same must-hits, same runs to win, and any pinch
  hitters or one-offs placed on it.
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

### Suspended game (emergencies)

Baseball's rule for a game stopped partway through: it isn't a loss; it resumes later.

- **When:** any time on the game's day, or until **noon the next day** (the Rally Cap
  window), because in a real emergency you may not open the app that night. Not after a
  Rally Cap roll on that game, and not on a W.
- **What happens:** progress is kept. The game resumes on a later day in the same series
  (the user picks; it can be the same morning if called the next day) as a
  doubleheader, with the same must-hits and runs to win.
- **No day left** (Saturday or Sunday, a game that already moved once, or a multi-day
  emergency): it ends as **"Suspended — no decision"**. Neither a W nor an L; streaks are
  frozen, not broken. A finished series tied on wins is decided by run differential, else
  it's a split.
- **Cost:** one Rainout from the shared monthly allowance. With none left, the day is
  played out like any other.
- Iron Man requires a week with no Rainouts **and** no Suspended games.

### Injured List (single task)

- **When it starts:** today, unless the task is in today's game and that game (or its
  week) has already had first pitch. Then today's game keeps it and the stint starts
  tomorrow.
- **What it does:** from the start date the task leaves every planned day, **and runs to
  win doesn't drop.** Its must-hit status goes with it (that's the relief); its runs are
  covered from the bench. Its streak is frozen.
- **Held spots:** each day it leaves keeps a hold on its spot (batting order position,
  must-hit or not, its runs), shown on that day as **"On the IL"**. Days built while the
  task is already out hold a spot the same way.
- **Activation** (after the minimum stint) puts the task back into every held spot from
  **tomorrow** on, in the same batting order position, without changing runs to win. Days
  not planned yet simply include it from its starter. Cancelling a stint that hasn't
  started yet puts it back everywhere.
- **Your plan wins:** if you re-plan a day yourself while the task is out (before the
  week's first pitch), that day drops its hold and keeps your plan. Retiring a task drops
  all its holds.
- **Minimum stint: 3 game days.** Spring Training and Review Week don't count, so a stint
  pauses through the offseason. The IL can't be used to dodge a single hard day.
- When a task leaves a lineup, the batting order closes up (1, 2, 3), and substitutions
  stay paired in the box score.

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
6. **Review Week hub**: season review, awards, front-office changes for the next season.

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

None for game rules. Next step: data model and API contract.
