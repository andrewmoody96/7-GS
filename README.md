# 7-Game Series

**Your to-do list, played like a season.**

Every day is a game. Every week is a best-of-7 series. Win four, take the series. Stack
up series wins and chase a winning season. You don't have to be perfect to win; you just
have to show up for more days than you don't.

**[Try the demo →](https://andrewmoody96.github.io/7-GS/)** No sign-up; it runs right in
your browser with a team already mid-season.

---

## Why it works

Most to-do apps hand you a list that never ends, then quietly judge you for not
finishing it. 7-Game Series flips that around.

- **A bad day is just one game.** Lose Tuesday? You can still win the week. Win 4 of 7
  and the series is yours.
- **You never have to do it all.** Each day you need your must-hits plus about half of
  everything else. That's the bar, and it's always within reach.
- **What you did get done counts.** Every check-off puts runs on the board, even on a
  day that doesn't end in a W.
- **The stakes feel real (in a fun way).** A live scoreboard, an opponent that answers
  back, a series score, a chyron that knows when you're one win from clinching.

## How a game day works

1. **Set your lineup.** Pick the tasks for each day of the week. Some are **must-hits**
   (non-negotiable), the rest are nice-to-haves.
2. **Score runs.** Check tasks off as you go. Each one is worth runs, and the scoreboard
   updates live.
3. **Get the W.** Reach the day's runs to win and finish every must-hit before midnight.
   The result goes final at 12:30 a.m., so a last-minute check-off still counts.

Plan the week ahead, and once it starts you can always **add** to a day (a pinch hitter!)
but never take things off. Your Default Lineups fill in every new week for you.

## The fun stuff

- 🧢 **Rally Caps.** Lost a close one? Roll the dice the next morning for a chance to
  flip it into a Walk-off W. Win streaks boost your odds, and saving Rally Caps up pays off.
- 🌧️ **Rainouts.** Life happens. Move a day to later in the week and play a doubleheader.
- 🩹 **Injured List.** Put a task on hold for a while without wrecking your plan.
- 🏆 **Seasons and stats.** A season is a quarter of the year: 12 weeks, then a Review
  Week to look back and reset. Set a win goal, track your record, streaks and career stats.
- 🏀🏒 **Pick your sport.** Baseball, basketball or hockey. Same game, different words,
  scoreboard and colors. Switch any time, mid-season included.
- 🖼️ **Make it yours.** Name your team and add a team photo for your badge.
- 🔔 **Reminders.** A nudge to check in, a last call before midnight, and a heads-up when
  a Rally Cap is waiting, as notifications or email.
- 📱 **Feels like an app.** Add it to your Home Screen, sign in with a 6-digit code, keep
  checking things off offline, and it updates itself.

## Get started

- **Just curious?** Open the [demo](https://andrewmoody96.github.io/7-GS/) and poke around.
  The **Demo controls** button jumps between scenarios: mid-season, a Rally Cap morning, a
  doubleheader, Spring Training and more.
- **Ready to play?** Ask for an invite. Sign-in is by email, and you'll get a 6-digit code.
  Add the app to your Home Screen, pick your sport and look, add a few tasks, and your season
  starts the next Monday (or right away with a Head Start).

The full rules, from scoring to Rally Cap odds, are in
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md). The app has a **How it works** guide behind
the **?** button too.

---

## For developers

- Game rules: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Data model and API: [`docs/DATA_MODEL_AND_API.md`](docs/DATA_MODEL_AND_API.md)
- Putting it online (GitHub Pages demo, Heroku for real): [`docs/DEPLOY.md`](docs/DEPLOY.md)

### How changes ship

`main` is production. New work goes on a branch and into `main` through a pull request,
and CI runs on every pull request. After merging:

- **GitHub Pages** (the demo) rebuilds from `main` on its own.
- **Heroku** (the real app) deploys from the dashboard: **Deploy → Manual deploy → `main`
  → Deploy Branch**. Database migrations run during the release.

With each release worth telling people about, add an entry to
[`apps/web/src/releaseNotes.ts`](apps/web/src/releaseNotes.ts); the app shows it once in
its What's new popup.

### Repository layout

| Path | What it is |
|---|---|
| `packages/rules` | Pure TypeScript game rules (scoring, runs to win, Rally Cap odds, calendar, rainouts). No I/O. |
| `packages/contracts` | Zod schemas and the `/v1` endpoint registry shared by web and API. |
| `apps/api` | Hono + Drizzle + Postgres REST API and the midnight finalizer. |
| `apps/web` | React + Vite installable PWA, with a built-in demo backend. |

The two shared packages are consumed as TypeScript source (no build step).

### Running it on your computer

Every command below is typed into a **terminal** (Terminal on macOS, PowerShell on
Windows) **from the repository's root folder**, the folder that contains this README
and `package.json`.

#### One-time setup

1. Install [Node.js 22](https://nodejs.org/en/download) (choose the 22.x version). On macOS 12 (Monterey)
   it must be 22: newer Node versions require macOS 13.5 or later. The first time you run `git`
   on a Mac, it may ask to install Command Line Tools; click Install.
2. Turn on pnpm (it ships with Node): `corepack enable`
3. Get the code and move into its root folder:
   ```sh
   git clone https://github.com/andrewmoody96/7-GS.git
   cd 7-GS
   ```
4. Install dependencies: `pnpm install`

#### Demo mode (just the app, with built-in sample data)

```sh
pnpm dev:web
```

Open http://localhost:5173 in your browser. Nothing is saved to a server.

#### Full mode (the app talking to the real server)

Use **two terminal windows, both in the repository root**:

| Terminal 1: the server | Terminal 2: the app |
|---|---|
| `pnpm --filter @7gs/api seed:demo` (once, loads sample data) | `pnpm --filter @7gs/web dev:http` |
| `pnpm dev:api` (leave it running) | |

Open http://localhost:5173 and sign in as `demo@7gs.local`. Locally there is no email
service, so the sign-in screen shows a **Sign in now** button instead of sending a code.
Data is stored in `apps/api/.data/`. Stop either one with `Ctrl+C`.

#### Checks

```sh
pnpm test        # every package's tests
pnpm typecheck   # every package's type check
```

### Team conventions

- **Rules live in `packages/rules`.** If the web app and the API both need a decision
  (who won, can I roll, which makeup dates), it belongs there, with tests.
- **Shapes live in `packages/contracts`.** Never hand-write a request or response type
  in an app; import it from contracts. A change to a shape is a contracts change first.
- **Generic names in data, sport words in the UI** (see GAME_DESIGN §3).
- Game dates are local `YYYY-MM-DD` strings; instants are UTC ISO strings.
