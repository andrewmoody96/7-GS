# Achievements (badges)

Shipped in 1.1, for every account: **Team → Badges**. The catalog and rules live in `packages/rules/src/achievements.ts`: each badge is one stat reaching one number, so retuning a badge is a one-number change.

**Where the stats come from.** The server works them out from the account's whole history every time they're asked (`GET /v1/achievements`, `apps/api/src/services/achievements.ts`, via `rules.achievementStatsFromHistory`), so play from before badges existed counts and nothing can drift. Games, series, seasons, check-offs, the team photo and default lineups are all data the app already kept. "Days opened" is recorded from 1.1 on (`user_open_days`, once a day per account); before that, any day with a check-off, and the sign-up day, count as opened.

**New badges** show as a toast the first time the app sees them on a device. The first look after 1.1 stays quiet (the release notes announce badges).

**The demo** shows the demo team's real badges, and the **Achievements lab** (Demo controls → Achievements lab, or the link on the Badges page) simulates a player to watch badges unlock.

**In each sport's words.** The catalog is written for baseball; basketball and hockey rename the badges that don't fit (`vocab.badges` in `apps/web/src/vocab.ts`): First Pitch is Tip-Off / Puck Drop, Perfect Game is Flawless / Shutout, Rally Cap Believer is Challenge Won, and descriptions use buckets/shots to win and Postponements. What earns a badge never changes with the sport.

**Perfect games** count for badges only with **5 or more runs to win and at least 3 tasks** in the lineup (rules `PERFECT_FOR_BADGES`), so a day of one or two big tasks can't rack them up. (The 3rd Rally Cap's "perfect games" is a game rule and isn't affected.)

## Rookie

Your first days: getting set up and on the board.

| Badge | What it takes |
|---|---|
| ⚾ **First Pitch** | Open the app for the first time. |
| 🎨 **Team Colors** | Add a team photo. |
| 📋 **Game Plan** | Set a default lineup for all seven weekdays. |
| ✅ **On the Board** | Win your first game. |
| 🔥 **Warm-Up** | Check off 25 tasks. |
| ✔️ **On a Roll** | Check off at least one task every day for a week. |

## Regular

A few weeks in: the habit is forming.

| Badge | What it takes |
|---|---|
| 🏆 **Series Winner** | Win your first series. |
| 🖐️ **Hot Hand** | Win 3 games in a row. |
| 📅 **Regular** | Open the app 7 days in a row. |
| 🧢 **Rally Cap Believer** | Turn a loss into a win with a Rally Cap. |
| 💪 **Shake It Off** | Win the day after a loss, 5 times. |
| 🐴 **Workhorse** | Check off 100 tasks. |
| 💯 **Perfect Game** | Play 5 perfect games: every task done, with 5+ runs to win and 3+ tasks. |

## All-Star

A strong month or two: streaks, sweeps and big weeks.

| Badge | What it takes |
|---|---|
| 🧹 **Sweep** | Win all 7 games of a series. |
| 🦾 **Iron Man** | Win a series in a week played as scheduled: no Rainouts, no Suspended games. |
| ✨ **Sharp** | Play 15 perfect games (5+ runs to win, 3+ tasks). |
| ☄️ **On Fire** | Win 10 games in a row. |
| 7️⃣ **Game 7** | Win a Game 7 with the series tied 3–3. |
| 🗓️ **Every Day Player** | Open the app 30 days in a row. |
| 🔒 **Locked In** | Play 5 perfect games (5+ runs to win, 3+ tasks) in one series. |
| 🥇 **Contender** | Win 5 series. |
| ⚙️ **Grinder** | Check off 500 tasks. |
| 🧠 **Habit Formed** | Check off at least one task every day for 30 days. |

## MVP

A season’s work: winning records and goals hit.

| Badge | What it takes |
|---|---|
| 🔄 **Reverse Sweep** | Win a series after trailing 0–3. |
| 📈 **Winning Season** | Finish a season with more wins than losses. |
| 🎯 **Goal Getter** | Reach your season win goal. |
| 🚀 **Unstoppable** | Win 20 games in a row. |
| 🔢 **Thousand Club** | Check off 1,000 tasks. |
| 💎 **Precision** | Play 50 perfect games (5+ runs to win, 3+ tasks). |
| 🛡️ **Ironclad** | Play 4 Iron Man weeks in a row: a month with no Rainouts or Suspended games. |
| 🏃 **Century** | Check off at least one task every day for 100 days. |

## Hall of Fame

A year or more of real dedication.

| Badge | What it takes |
|---|---|
| 👑 **Perfect Season** | Win every series in a season. |
| 🏛️ **Dynasty** | Have 4 winning seasons: a full year of them. |
| 🐎 **Iron Horse** | Open the app on 365 different days. |
| 🌟 **Untouchable** | Win 30 games in a row. |
| 🏅 **Legend** | Check off 5,000 tasks. |
