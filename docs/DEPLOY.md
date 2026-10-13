# Deploying 7-Game Series

There are two ways to put the app online. They do different jobs:

| | GitHub Pages | Heroku |
|---|---|---|
| What runs | The PWA only, with its built-in demo backend | The PWA **and** the API + Postgres |
| Accounts / sign-in | None: one demo team per browser | Email magic links |
| Data | Stays in that browser's `localStorage` | Postgres, on every device you sign in from |
| Games go final at midnight | Simulated in the browser (demo controls) | The server's finalizer, every 15 minutes |
| Cost | Free | Eco or Basic dyno + Postgres Essential-0 (about $10–$12 a month) |
| Use it for | Showing friends, design feedback | Actually playing the season |

GitHub Pages only serves static files, so it can't run the API, the database or the
nightly finalizer. That's why the full app goes on Heroku.

---

## 1. GitHub Pages (the demo)

Everything is in `.github/workflows/pages.yml`. The demo is served from
`https://andrewmoody96.github.io/7-GS/`.

**One-time setup (on github.com):**

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo **Settings → Environments → github-pages**. If deployments are restricted to
   certain branches, allow the branch you deploy from. The workflow runs on pushes to
   `main` and to `claude/7-game-series-brainstorm-8ydzpv`.

**Deploy:** push to one of those branches, or start **Actions → Deploy demo to GitHub
Pages → Run workflow**. The URL appears on the run's summary page.

**How it works:** the build sets `VITE_BASE=/7-GS/`. The router, the PWA manifest and
the service worker all live under that path. `404.html` is a copy of the app shell, so
deep links such as `/7-GS/season` still load the app.

**Try it locally:**

```sh
VITE_BASE=/7-GS/ pnpm --filter @7gs/web build
```

The output lands in `apps/web/dist`.

---

## 2. Heroku (the real app)

One web dyno serves the built PWA and the `/v1` API from the same origin, so the
session cookie stays first-party and no CORS is needed. The repo already has
everything Heroku looks for:

| File | What it does |
|---|---|
| `package.json` | `engines.node: 22.x` and `packageManager: pnpm@…`, which Heroku uses to pick Node and pnpm. |
| `package.json` → `build` | Builds the PWA in API mode (`apps/web/dist`). |
| `package.json` → `heroku-cleanup` | Keeps only production dependencies. Needed because `pnpm prune` doesn't work in workspaces. |
| `Procfile` → `release` | Runs database migrations before each new release goes live. |
| `Procfile` → `web` | Starts the server on `$PORT`. It serves the PWA, the API, and `/healthz`, and runs the finalizer. |
| `app.json` | Describes the app for Heroku: the Postgres add-on and the config vars. |

### First deploy (Heroku CLI)

```sh
heroku create my-7gs                                  # pick any free name
heroku addons:create heroku-postgresql:essential-0    # sets DATABASE_URL
heroku config:set NODE_ENV=production APP_URL=https://my-7gs-xxxx.herokuapp.com
```

For `APP_URL`, use the exact URL that `heroku create` printed (or your custom domain),
with no trailing path.

Then pick **one** way to sign in:

```sh
# A) Real sign-in emails (recommended). Resend: https://resend.com, free tier is plenty.
heroku config:set RESEND_API_KEY=re_xxx EMAIL_FROM="7-Game Series <play@yourdomain.com>"
#    …or Postmark (heroku addons:create postmark sets POSTMARK_API_TOKEN for you)
heroku config:set POSTMARK_API_TOKEN=xxx EMAIL_FROM="7-Game Series <play@yourdomain.com>"

# B) A private trial with no email: the sign-in screen shows "Sign in now".
#    Anyone who finds the URL can sign in as any address, so switch to A before sharing.
heroku config:set ALLOW_DEV_LOGIN=true
```

`EMAIL_FROM` must use a domain (or sender address) you've verified with the provider.

Deploy the branch:

```sh
git push heroku claude/7-game-series-brainstorm-8ydzpv:main
heroku open
```

You can also connect the GitHub repo in the dashboard's **Deploy** tab and turn on
automatic deploys.

### What production enforces

The server **refuses to start** (and `heroku logs` says exactly why) when
`NODE_ENV=production` and any of these is true:

- `DATABASE_URL` is missing. Without it, data would sit on the dyno's disk, which Heroku
  wipes at least daily.
- There is no email provider and `ALLOW_DEV_LOGIN` is not `true`.
- An email provider is set but `EMAIL_FROM` or `APP_URL` is missing.
- The web build is missing.

With `NODE_ENV=production` set, the server also does the following automatically:

- Marks the session cookie `Secure`.
- Redirects `http://` to `https://` and adds HSTS.
- Never returns `devToken` (unless `ALLOW_DEV_LOGIN=true`).
- Limits magic-link requests to 5 per address and 20 per client every 15 minutes.
- Connects to Postgres over TLS.
- Skips the response-validation pass.

### Config vars

| Var | Default | Notes |
|---|---|---|
| `NODE_ENV` | — | Set to `production`. |
| `DATABASE_URL` | set by the add-on | TLS is on in production; set `DATABASE_SSL=false` to turn it off. |
| `APP_URL` | — | Origin used in email links. Required with email. |
| `RESEND_API_KEY` / `POSTMARK_API_TOKEN` | — | Use one. |
| `EMAIL_FROM` | — | Required with either provider. |
| `ALLOW_DEV_LOGIN` | `false` in prod | `true` shows the "Sign in now" shortcut. |
| `FINALIZER_INTERVAL_MS` | `900000` | How often games are settled. |
| `FORCE_HTTPS`, `COOKIE_SECURE`, `LIMIT_MAGIC_LINKS` | `true` in prod | Escape hatches; leave them alone on Heroku. |
| `LOG_REQUESTS` | `true` | One log line per request. |

### Dyno notes

- **Eco dynos sleep** after 30 minutes without traffic. That's fine: when the dyno wakes,
  the finalizer catches up on every day that settled while it slept. Each run is
  idempotent and keyed by user and date. Results only appear once someone opens the
  app; Basic dynos stay awake.
- **One web dyno.** The magic-link limiter keeps its counts in memory. If you scale
  past one dyno, each dyno keeps its own counts, so the limits loosen; nothing breaks.
- **Health check:** `GET /healthz` returns `{"ok":true}` when the database answers.

### Rehearse a production build locally

```sh
pnpm install && pnpm run build
NODE_ENV=production ALLOW_DEV_LOGIN=true PGLITE_DATA_DIR=/tmp/7gs-prod PORT=5055 pnpm start
```

Then open http://localhost:5055. Locally, PGlite stands in for `DATABASE_URL`.
