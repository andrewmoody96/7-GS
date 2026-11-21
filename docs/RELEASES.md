# Releases

How versions are numbered, how often things ship, and what to do on release day.

## Version numbers

| Kind | Example | What's in it | Players see |
|---|---|---|---|
| **Major** | 2.0 | Changes to how the game is played (scoring, rules), or very large features | The What's new popup |
| **Feature** | 1.2 | New features, gathered into one release | The What's new popup |
| **Fix** | 1.2.1 | Bug fixes, typos, small visual tweaks | Nothing pops up. Listed in Settings → What's changed if worth a line |

**Betas** carry a `-beta` suffix (`1.1.0-beta`) while the app is invite-only and still
being finished.

**Git tags** always start with `v`, betas included: `v1.1.0-beta`, `v1.2.0`. The app shows
versions the same way (Settings and What's new).

The version lives in one place, `APP_VERSION` in
[`apps/web/src/releaseNotes.ts`](../apps/web/src/releaseNotes.ts) (and `apps/web/package.json`
to match). Settings shows it, with a link to every release's notes.

## How often

- **Game-breaking bugs** (check-offs lost, wrong W/L, can't sign in): fixed and deployed the
  same day.
- **Other fixes and typos:** gathered up, deployed about once a week.
- **Features:** about every two weeks, deployed **Sunday evening**, so a new week (series)
  starts on the new version.
- **Rule changes never land mid-series.** Anything that changes scoring ships before a Monday;
  big rule changes wait for a new season, after Review Week.

Pull requests can merge into `main` whenever they're ready (the GitHub Pages demo follows
`main` on its own). **The Heroku deploy is the release.**

## Release day

1. Make sure `main` has everything for this release, and CI is green.
2. In `apps/web/src/releaseNotes.ts`:
   - bump `APP_VERSION` (and `apps/web/package.json`);
   - for a feature or major release, add an entry at the top (`id` and `version` both the new
     version). Short bullets in players' words, what they can do now, not how it works.
   - for a fix release, add a `patch` to the newest entry (`{ version, fixed }`, newest
     first). It doesn't pop up; it leads the current-version tile in What's changed.
   - A release that sums up a lot (like 1.1) gets `recap: true`: the popup then shows only it,
     not the notes it covers.
   - Keep `SINCE_LAST_MAJOR` current: a few bullets for the biggest features and fixes since
     the last major release (What's changed shows it as the third tile, after the current
     and previous versions).
3. Merge that to `main`.
4. Heroku: **Deploy → Manual deploy → `main` → Deploy Branch**. Database migrations run in
   the release phase.
5. Tag it so we always know what's live, on GitHub: **Releases → Draft a new release →
   Choose a tag** (type the new one, with its `v`: `v1.2.0-beta` for a beta, `v1.2.0` for a
   finished release), target `main`, and **Publish release**. Tick **Set as a pre-release** for a
   beta. (Claude sessions can't push tags, so this step is yours.)

## Never in a release

- **Renaming teams.** A team's name, and the opponent name on every series already
  created, never changes (GAME_DESIGN §8). New name lists or rules apply to teams drawn from
  then on. (v1.3.1 did a final, one-time rename by request; it records that it ran.)

## History

- **1.3.2-beta** (November 2026): a league title for the best record across both conferences.
- **1.3.1-beta** (November 2026): conferences instead of leagues, a tidier Standings page,
  and shorter team names.
- **1.3.0-beta** (November 2026): your own league of 29 teams, divisions dealt every season,
  standings, and division and league titles.
- **1.2.1-beta** (November 2026): opponents from real small towns (every past one renamed);
  the device count is gone from the admin Accounts page.
- **1.2.0-beta** (November 2026): a task is worth up to 4; badges count a series once it's
  decided; tougher perfect-game and Iron Man badges, and Ironclad.
- **1.1.0-beta** (November 2026, tag `v1.1.0-beta`): the first numbered release. A recap of
  everything since launch, plus badges, a win goal in the guided setup, and one more pass
  through setup for everyone.
- **v0.11.2026_beta** (November 2026): everything before version numbers, as one entry.
