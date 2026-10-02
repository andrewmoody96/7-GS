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

## Getting started

Requires Node 22+ and pnpm 10.

```sh
pnpm install
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
