# 7-Game Series

Treat every week like a best-of-7 playoff series. Every day is a game; you win it by
completing the tasks in that day's lineup. Wins and losses roll up into a season record.

- Game rules: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Data model and API: [`docs/DATA_MODEL_AND_API.md`](docs/DATA_MODEL_AND_API.md)

## Repository layout

| Path | Owner | What it is |
|---|---|---|
| `packages/rules` | Lead | Pure TypeScript game rules (scoring, Rally Cap odds, calendar, rainouts). No I/O. |
| `packages/contracts` | Lead | Zod schemas and the `/v1` endpoint registry shared by web and API. |
| `apps/api` | Backend | Hono + Drizzle + Postgres REST API and the midnight finalizer. |
| `apps/web` | Frontend | React + Vite installable PWA. |

The two shared packages are consumed as TypeScript source (no build step).

## Running it on your computer

Every command below is typed into a **terminal** (Terminal on macOS, PowerShell on
Windows) **from the repository's root folder**, the folder that contains this README
and `package.json`.

### One-time setup

1. Install [Node.js 22](https://nodejs.org/en/download) (choose the 22.x version). On macOS 12 (Monterey)
   it must be 22: newer Node versions require macOS 13.5 or later. The first time you run `git`
   on a Mac, it may ask to install Command Line Tools; click Install.
2. Turn on pnpm (it ships with Node): `corepack enable`
3. Get the code and move into its root folder:
   ```sh
   git clone https://github.com/andrewmoody96/7-GS.git
   cd 7-GS
   git checkout claude/7-game-series-brainstorm-8ydzpv
   ```
4. Install dependencies: `pnpm install`

### Demo mode (just the app, with built-in sample data)

```sh
pnpm dev:web
```

Open http://localhost:5173 in your browser. Nothing is saved to a server.

### Full mode (the app talking to the real server)

Use **two terminal windows, both in the repository root**:

| Terminal 1: the server | Terminal 2: the app |
|---|---|
| `pnpm --filter @7gs/api seed:demo` (once, loads sample data) | `pnpm --filter @7gs/web dev:http` |
| `pnpm dev:api` (leave it running) | |

Open http://localhost:5173 and sign in as `demo@7gs.local`. There is no email service
yet, so the sign-in screen shows a **Sign in now** button instead of sending a link.
Data is stored in `apps/api/.data/`. Stop either one with `Ctrl+C`.

### Checks

```sh
pnpm test        # every package's tests
pnpm typecheck   # every package's type check
```

## Team conventions

- **Rules live in `packages/rules`.** If the web app and the API both need a decision
  (who won, can I roll, which makeup dates), it belongs there, with tests.
- **Shapes live in `packages/contracts`.** Never hand-write a request or response type
  in an app; import it from contracts. A change to a shape is a contracts change first.
- **Generic names in data, baseball words in the UI** (see GAME_DESIGN §3).
- Game dates are local `YYYY-MM-DD` strings; instants are UTC ISO strings.
