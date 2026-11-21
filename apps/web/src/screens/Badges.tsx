// Team → Badges: the collection, by tier, with progress toward the ones still to earn. The
// stats come from the server, worked out from the account's whole history.
// And Team → Badges → Lab (demo only): simulate a player to see badges unlock.

import {
  ACHIEVEMENT_TIERS,
  EMPTY_STATS,
  evaluateAchievements,
  newlyEarned,
  newSim,
  simulateDay,
  skipDay,
  TIER_INFO,
  type Achievement,
  type AchievementMetric,
  type AchievementProgress,
  type AchievementSim,
  type AchievementStats,
  type SimDay,
} from '@7gs/rules';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../app/context';
import { useAchievementsQuery, useMeQuery } from '../app/queries';
import { useNotify } from '../app/toast';
import { BadgeMedal } from '../components/BadgeMedal';
import { ErrorPanel, Loading } from '../components/States';
import { Sheet } from '../components/Sheet';
import { LAB_PRESETS, setLabSim, useLabSim } from '../lab/achievementsLab';
import { vocab } from '../vocab';

const earnedIds = (stats: AchievementStats) =>
  evaluateAchievements(stats)
    .filter((p) => p.earned)
    .map((p) => p.achievement.id);

/** How many badges the account has earned; null while loading. */
export function useBadgeCount(): number | null {
  const q = useAchievementsQuery();
  return q.data ? earnedIds(q.data.stats).length : null;
}

const seenKey = (userId: string) => `7gs.badges.seen.${userId}`;

/**
 * A toast for each badge earned since this device last looked. The first time (or after
 * clearing site data) it just remembers what's already earned, quietly: the release notes
 * announce badges, and a pile of toasts would bury that.
 */
export function NewBadgeNotices() {
  const me = useMeQuery();
  const q = useAchievementsQuery();
  const notify = useNotify();
  const userId = me.data?.id;
  const stats = q.data?.stats;
  useEffect(() => {
    if (!userId || !stats) return;
    const now = earnedIds(stats);
    let seen: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(seenKey(userId));
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }
    if (seen) {
      const had = new Set(seen);
      for (const a of ACHIEVEMENTS_BY_ID(now.filter((id) => !had.has(id)))) notify(`Badge earned: ${a.icon} ${a.name}. ${a.description}`, 'success');
    }
    try {
      window.localStorage.setItem(seenKey(userId), JSON.stringify(now));
    } catch {
      // Private mode and the like: no toasts, nothing breaks.
    }
  }, [userId, stats, notify]);
  return null;
}

function ACHIEVEMENTS_BY_ID(ids: string[]): Achievement[] {
  const byId = new Map(evaluateAchievements(EMPTY_STATS).map((p) => [p.achievement.id, p.achievement]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

function Crumbs({ lab }: { lab?: boolean }) {
  return (
    <p className="screen__kicker">
      <Link to="/team">{vocab.tabs.team}</Link> /{lab ? <> <Link to="/team/badges">Badges</Link> /</> : null}
    </p>
  );
}

function BadgeCard({ progress: p }: { progress: AchievementProgress }) {
  const { achievement: a, earned, current } = p;
  return (
    <li className={`badgecard${earned ? ' is-earned' : ''}`}>
      <BadgeMedal achievement={a} earned={earned} />
      <div className="badgecard__text">
        <strong>{a.name}</strong>
        <small>{a.description}</small>
        {!earned && a.target > 1 ? (
          <span className="badgecard__progress" aria-label={`${current} of ${a.target}`}>
            <span className="badgecard__bar" style={{ width: `${(current / a.target) * 100}%` }} />
            <span className="badgecard__count">
              {current.toLocaleString()} / {a.target.toLocaleString()}
            </span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function BadgeGrid({ stats }: { stats: AchievementStats }) {
  const progress = evaluateAchievements(stats);
  return (
    <>
      {ACHIEVEMENT_TIERS.map((tier) => {
        const inTier = progress.filter((p) => p.achievement.tier === tier);
        const got = inTier.filter((p) => p.earned).length;
        return (
          <section key={tier} className={`card badgetier badgetier--${tier}`} aria-labelledby={`tier-${tier}`}>
            <header className="card__head">
              <h2 id={`tier-${tier}`} className="card__title">
                {TIER_INFO[tier].name}
              </h2>
              <p className="card__sub">
                {got > 0 ? `${got} earned · ` : ''}
                {TIER_INFO[tier].blurb}
              </p>
            </header>
            <ul className="badgelist">
              {/* Earned first, then the closest to earning. */}
              {[...inTier]
                .sort((a, b) => Number(b.earned) - Number(a.earned) || b.current / b.achievement.target - a.current / a.achievement.target)
                .map((p) => (
                  <BadgeCard key={p.achievement.id} progress={p} />
                ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function BadgesScreen() {
  const api = useApi();
  const q = useAchievementsQuery();
  return (
    <div className="screen screen--team">
      <header className="screen__head">
        <div>
          <Crumbs />
          <h1 className="screen__title">Badges{q.data ? `: ${earnedIds(q.data.stats).length}` : ''}</h1>
        </div>
      </header>
      {q.isPending ? (
        <Loading label="Loading your badges" />
      ) : q.isError ? (
        <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <p className="muted">Earned for everything you’ve played, from your first day. New ones pop up as you earn them.</p>
          {api.mode === 'mock' ? (
            <p className="notice">
              Demo: these are the demo team’s badges. To watch badges unlock, try the <Link to="/team/badges/lab">Achievements lab</Link>.
            </p>
          ) : null}
          <BadgeGrid stats={q.data.stats} />
        </>
      )}
    </div>
  );
}

// ── Lab ──────────────────────────────────────────────────────────────────────

const STAT_LABELS: Record<AchievementMetric, string> = {
  daysOpened: 'Days opened',
  longestOpenStreak: 'Longest open streak (days)',
  teamPhoto: 'Team photo set (0/1)',
  defaultLineupsSet: 'Default lineups set (0–7)',
  tasksDone: 'Tasks checked off',
  longestCheckStreak: 'Longest check-off streak (days)',
  gamesPlayed: 'Games played',
  wins: 'Wins',
  longestWinStreak: 'Longest win streak',
  perfectGames: 'Perfect games (5+ runs to win, 3+ tasks)',
  bestPerfectInSeries: 'Most of those in a series',
  bounceBacks: 'Wins right after a loss',
  rallyWins: 'Rally Cap wins',
  seriesWon: 'Series won',
  sweeps: 'Sweeps (7–0)',
  reverseSweeps: 'Series won from 0–3 down',
  game7Wins: 'Game 7 wins',
  ironManWins: 'Series won in Iron Man weeks',
  longestIronManRun: 'Iron Man weeks in a row',
  winningSeasons: 'Winning seasons',
  goalsReached: 'Season goals reached',
  perfectSeasons: 'Perfect seasons',
};

const WIN: SimDay = { kind: 'game', result: 'W' };
const PERFECT: SimDay = { kind: 'game', result: 'W', perfect: true };
const LOSS: SimDay = { kind: 'game', result: 'L' };

export function AchievementsLabScreen() {
  const sim = useLabSim();
  const [unlocked, setUnlocked] = useState<Achievement[]>([]);
  const count = evaluateAchievements(sim.stats).filter((p) => p.earned).length;

  /** Apply a change and pop up anything it unlocked. */
  const apply = (next: AchievementSim) => {
    const fresh = newlyEarned(sim.stats, next.stats);
    setLabSim(next);
    if (fresh.length > 0) setUnlocked(fresh);
  };
  const days = (list: SimDay[]) => apply(list.reduce(simulateDay, sim));
  const week = (pattern: SimDay[]) => days(pattern);

  return (
    <div className="screen screen--team">
      <header className="screen__head">
        <div>
          <Crumbs lab />
          <h1 className="screen__title">Achievements lab</h1>
        </div>
      </header>
      <p className="lede">
        Try badges out on a simulated player: start from a preset, play days, or set any stat. Unlocks pop up as they happen. Only
        this browser sees it.
      </p>

      <section className="card" aria-labelledby="lab-presets">
        <header className="card__head">
          <h2 id="lab-presets" className="card__title">
            Start from
          </h2>
          <p className="card__sub">One player per tier · Badges: {count}</p>
        </header>
        <ul className="scenarios">
          {LAB_PRESETS.map((p) => (
            <li key={p.id}>
              <button type="button" className="scenario" onClick={() => setLabSim(newSim(p.stats))}>
                <strong>{p.name}</strong>
                <small>{p.blurb}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="lab-play">
        <header className="card__head">
          <h2 id="lab-play" className="card__title">
            Play
          </h2>
          <p className="card__sub">
            Series game {sim.series.length + 1} of 7 · win streak {sim.winStreak} · check-off streak {sim.checkStreak} · open streak{' '}
            {sim.openStreak}
          </p>
        </header>
        <div className="labactions">
          <button type="button" className="btn" onClick={() => days([PERFECT])}>
            Perfect W
          </button>
          <button type="button" className="btn" onClick={() => days([WIN])}>
            W
          </button>
          <button type="button" className="btn" onClick={() => days([LOSS])}>
            L
          </button>
          <button type="button" className="btn" onClick={() => days([{ kind: 'game', result: 'W', rally: true }])}>
            Rally Cap W
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => days([{ kind: 'open' }])}>
            Open only (no check-offs)
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => apply(skipDay(sim))}>
            Skip a day
          </button>
        </div>
        <div className="labactions">
          <button type="button" className="btn" onClick={() => week(Array<SimDay>(7 - sim.series.length).fill(WIN))}>
            Win out the week
          </button>
          <button type="button" className="btn" onClick={() => week(Array<SimDay>(7 - sim.series.length).fill(PERFECT))}>
            Perfect week
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => week(sim.series.length === 0 ? [LOSS, LOSS, LOSS, WIN, WIN, WIN, WIN] : Array<SimDay>(7 - sim.series.length).fill(WIN))}
          >
            Reverse sweep week
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => days(Array.from({ length: 84 }, (_, i): SimDay => (i % 5 === 4 ? LOSS : i % 3 === 0 ? PERFECT : WIN)))}
          >
            Play a season (80% W)
          </button>
        </div>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => {
            setLabSim(newSim());
            setUnlocked([]);
          }}
        >
          Start over from zero
        </button>
      </section>

      <details className="card disclosure labstats">
        <summary>Set stats directly</summary>
        <div className="labstats__grid">
          {(Object.keys(STAT_LABELS) as AchievementMetric[]).map((key) => (
            <label key={key} className="labstat">
              <span>{STAT_LABELS[key]}</span>
              <input
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                value={sim.stats[key]}
                onChange={(e) => {
                  const value = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  apply({ ...sim, stats: { ...sim.stats, [key]: value } });
                }}
              />
            </label>
          ))}
        </div>
      </details>

      <BadgeGrid stats={sim.stats} />

      <Sheet
        open={unlocked.length > 0}
        onClose={() => setUnlocked([])}
        kicker="Badge unlocked"
        title={unlocked.length === 1 ? unlocked[0]!.name : `${unlocked.length} new badges`}
        footer={
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => setUnlocked([])}>
              Nice
            </button>
          </div>
        }
      >
        <ul className="unlocks">
          {unlocked.map((a) => (
            <li key={a.id}>
              <BadgeMedal achievement={a} earned size={64} />
              <div>
                <strong>{a.name}</strong>
                <small>
                  {TIER_INFO[a.tier].name} · {a.description}
                </small>
              </div>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
