// Achievements (badges): a proposal for a future update, tried out in the demo's
// Achievements lab before any real account sees them. Pure: a catalog, the stats they're
// judged on, and a small day-by-day simulator for testing unlocks.
//
// Every badge is "this stat reached this number", so progress bars come for free and a
// badge can be retuned by changing one number.

import { SERIES_LENGTH, SERIES_PER_SEASON } from './constants';

/** Easiest to hardest. Rookie badges come in the first days; Hall of Fame takes a year or more. */
export const ACHIEVEMENT_TIERS = ['rookie', 'regular', 'all_star', 'mvp', 'hall_of_fame'] as const;
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number];

export const TIER_INFO: Record<AchievementTier, { name: string; blurb: string }> = {
  rookie: { name: 'Rookie', blurb: 'Your first days: getting set up and on the board.' },
  regular: { name: 'Regular', blurb: 'A few weeks in: the habit is forming.' },
  all_star: { name: 'All-Star', blurb: 'A strong month or two: streaks, sweeps and big weeks.' },
  mvp: { name: 'MVP', blurb: 'A season’s work: winning records and goals hit.' },
  hall_of_fame: { name: 'Hall of Fame', blurb: 'A year or more of real dedication.' },
};

/** Everything badges are judged on. Counts are lifetime unless the name says otherwise. */
export interface AchievementStats {
  /** Different days the app was opened (or brought to the front). */
  daysOpened: number;
  /** Longest run of consecutive days with the app opened. */
  longestOpenStreak: number;
  /** A team photo is set. 1 or 0. */
  teamPhoto: number;
  /** Weekdays (0–7) whose default lineup has at least one task. */
  defaultLineupsSet: number;
  /** Tasks checked off in games that went final. */
  tasksDone: number;
  /** Longest run of consecutive days with at least one task checked off. */
  longestCheckStreak: number;
  gamesPlayed: number;
  wins: number;
  longestWinStreak: number;
  /** Wins where every task in the lineup was done. */
  perfectGames: number;
  /** The most perfect games in a single series. */
  bestPerfectInSeries: number;
  /** A W the day after an L. */
  bounceBacks: number;
  rallyWins: number;
  seriesWon: number;
  /** Series won 7–0. */
  sweeps: number;
  /** Series won after trailing 0–3. */
  reverseSweeps: number;
  /** Game 7s won with the series tied 3–3. */
  game7Wins: number;
  /** Full weeks played as scheduled (the Iron Man bonus). */
  ironMans: number;
  /** Finished seasons with more wins than losses. */
  winningSeasons: number;
  /** Seasons whose win goal was reached. */
  goalsReached: number;
  /** Seasons in which every series was won. */
  perfectSeasons: number;
}

export type AchievementMetric = keyof AchievementStats;

export interface Achievement {
  id: string;
  name: string;
  tier: AchievementTier;
  /** What it takes, in the player's words. */
  description: string;
  /** A short glyph for the medal. */
  icon: string;
  metric: AchievementMetric;
  target: number;
}

const a = (
  id: string,
  tier: AchievementTier,
  name: string,
  icon: string,
  metric: AchievementMetric,
  target: number,
  description: string,
): Achievement => ({ id, tier, name, icon, metric, target, description });

export const ACHIEVEMENTS: readonly Achievement[] = [
  // Rookie: the first few days.
  a('first-pitch', 'rookie', 'First Pitch', '⚾', 'daysOpened', 1, 'Open the app for the first time.'),
  a('team-colors', 'rookie', 'Team Colors', '🎨', 'teamPhoto', 1, 'Add a team photo.'),
  a('game-plan', 'rookie', 'Game Plan', '📋', 'defaultLineupsSet', 7, 'Set a default lineup for all seven weekdays.'),
  a('on-the-board', 'rookie', 'On the Board', '✅', 'wins', 1, 'Win your first game.'),
  a('perfect-game', 'rookie', 'Perfect Game', '💯', 'perfectGames', 1, 'Finish every task in a day’s lineup.'),
  a('warm-up', 'rookie', 'Warm-Up', '🔥', 'tasksDone', 25, 'Check off 25 tasks.'),
  a('on-a-roll', 'rookie', 'On a Roll', '✔️', 'longestCheckStreak', 7, 'Check off at least one task every day for a week.'),

  // Regular: a few weeks in.
  a('series-winner', 'regular', 'Series Winner', '🏆', 'seriesWon', 1, 'Win your first series.'),
  a('hot-hand', 'regular', 'Hot Hand', '🖐️', 'longestWinStreak', 3, 'Win 3 games in a row.'),
  a('regular', 'regular', 'Regular', '📅', 'longestOpenStreak', 7, 'Open the app 7 days in a row.'),
  a('rally-believer', 'regular', 'Rally Cap Believer', '🧢', 'rallyWins', 1, 'Turn a loss into a win with a Rally Cap.'),
  a('shake-it-off', 'regular', 'Shake It Off', '💪', 'bounceBacks', 5, 'Win the day after a loss, 5 times.'),
  a('workhorse', 'regular', 'Workhorse', '🐴', 'tasksDone', 100, 'Check off 100 tasks.'),
  a('sharp', 'regular', 'Sharp', '✨', 'perfectGames', 5, 'Play 5 perfect games.'),

  // All-Star: a strong month or two.
  a('sweep', 'all_star', 'Sweep', '🧹', 'sweeps', 1, 'Win all 7 games of a series.'),
  a('iron-man', 'all_star', 'Iron Man', '🦾', 'ironMans', 1, 'Play a full week as scheduled: no Rainouts, no Suspended games.'),
  a('on-fire', 'all_star', 'On Fire', '☄️', 'longestWinStreak', 10, 'Win 10 games in a row.'),
  a('game-seven', 'all_star', 'Game 7', '7️⃣', 'game7Wins', 1, 'Win a Game 7 with the series tied 3–3.'),
  a('every-day-player', 'all_star', 'Every Day Player', '🗓️', 'longestOpenStreak', 30, 'Open the app 30 days in a row.'),
  a('locked-in', 'all_star', 'Locked In', '🔒', 'bestPerfectInSeries', 5, 'Play 5 perfect games in one series.'),
  a('contender', 'all_star', 'Contender', '🥇', 'seriesWon', 5, 'Win 5 series.'),
  a('grinder', 'all_star', 'Grinder', '⚙️', 'tasksDone', 500, 'Check off 500 tasks.'),
  a('habit-formed', 'all_star', 'Habit Formed', '🧠', 'longestCheckStreak', 30, 'Check off at least one task every day for 30 days.'),

  // MVP: a season's work.
  a('reverse-sweep', 'mvp', 'Reverse Sweep', '🔄', 'reverseSweeps', 1, 'Win a series after trailing 0–3.'),
  a('winning-season', 'mvp', 'Winning Season', '📈', 'winningSeasons', 1, 'Finish a season with more wins than losses.'),
  a('goal-getter', 'mvp', 'Goal Getter', '🎯', 'goalsReached', 1, 'Reach your season win goal.'),
  a('unstoppable', 'mvp', 'Unstoppable', '🚀', 'longestWinStreak', 20, 'Win 20 games in a row.'),
  a('thousand-club', 'mvp', 'Thousand Club', '🔢', 'tasksDone', 1000, 'Check off 1,000 tasks.'),
  a('precision', 'mvp', 'Precision', '💎', 'perfectGames', 50, 'Play 50 perfect games.'),
  a('century', 'mvp', 'Century', '🏃', 'longestCheckStreak', 100, 'Check off at least one task every day for 100 days.'),

  // Hall of Fame: a year or more.
  a('perfect-season', 'hall_of_fame', 'Perfect Season', '👑', 'perfectSeasons', 1, 'Win every series in a season.'),
  a('dynasty', 'hall_of_fame', 'Dynasty', '🏛️', 'winningSeasons', 4, 'Have 4 winning seasons: a full year of them.'),
  a('iron-horse', 'hall_of_fame', 'Iron Horse', '🐎', 'daysOpened', 365, 'Open the app on 365 different days.'),
  a('untouchable', 'hall_of_fame', 'Untouchable', '🌟', 'longestWinStreak', 30, 'Win 30 games in a row.'),
  a('legend', 'hall_of_fame', 'Legend', '🏅', 'tasksDone', 5000, 'Check off 5,000 tasks.'),
];

export interface AchievementProgress {
  achievement: Achievement;
  earned: boolean;
  /** Toward the target, capped at it. */
  current: number;
}

export function evaluateAchievements(stats: AchievementStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = stats[achievement.metric];
    return { achievement, earned: value >= achievement.target, current: Math.min(value, achievement.target) };
  });
}

/** Badges earned in `after` that weren't in `before`, catalog order. */
export function newlyEarned(before: AchievementStats, after: AchievementStats): Achievement[] {
  const had = new Set(evaluateAchievements(before).filter((p) => p.earned).map((p) => p.achievement.id));
  return evaluateAchievements(after)
    .filter((p) => p.earned && !had.has(p.achievement.id))
    .map((p) => p.achievement);
}

export const EMPTY_STATS: AchievementStats = {
  daysOpened: 0,
  longestOpenStreak: 0,
  teamPhoto: 0,
  defaultLineupsSet: 0,
  tasksDone: 0,
  longestCheckStreak: 0,
  gamesPlayed: 0,
  wins: 0,
  longestWinStreak: 0,
  perfectGames: 0,
  bestPerfectInSeries: 0,
  bounceBacks: 0,
  rallyWins: 0,
  seriesWon: 0,
  sweeps: 0,
  reverseSweeps: 0,
  game7Wins: 0,
  ironMans: 0,
  winningSeasons: 0,
  goalsReached: 0,
  perfectSeasons: 0,
};

// ── Simulator (for the lab) ──────────────────────────────────────────────────

/** Lifetime stats plus where the player is in the current series and season. */
export interface AchievementSim {
  stats: AchievementStats;
  openStreak: number;
  /** Consecutive days with at least one check-off, up to today. */
  checkStreak: number;
  winStreak: number;
  lastResult: 'W' | 'L' | null;
  /** This series so far, in order. */
  series: ('W' | 'L')[];
  perfectInSeries: number;
  /** This season so far. */
  season: { wins: number; losses: number; seriesWon: number; seriesPlayed: number };
  /** The season win goal (the lab's default is a realistic 50 of 84). */
  winGoal: number;
}

export function newSim(stats: AchievementStats = EMPTY_STATS, winGoal = 50): AchievementSim {
  return {
    stats: { ...stats },
    openStreak: Math.min(stats.longestOpenStreak, stats.daysOpened),
    checkStreak: 0,
    winStreak: 0,
    lastResult: null,
    series: [],
    perfectInSeries: 0,
    season: { wins: 0, losses: 0, seriesWon: 0, seriesPlayed: 0 },
    winGoal,
  };
}

export type SimDay =
  /** A day the app was opened but no game was played (or just the open). */
  | { kind: 'open' }
  /** A game day: opened, played and decided. */
  | { kind: 'game'; result: 'W' | 'L'; perfect?: boolean; rally?: boolean; tasks?: number };

/** One more day. A game day counts as an app open too. Pure: returns a new sim. */
export function simulateDay(sim: AchievementSim, day: SimDay): AchievementSim {
  const s: AchievementStats = { ...sim.stats };
  let { openStreak, checkStreak, winStreak, lastResult, perfectInSeries } = sim;
  let series = sim.series;
  let season = { ...sim.season };

  s.daysOpened += 1;
  openStreak += 1;
  s.longestOpenStreak = Math.max(s.longestOpenStreak, openStreak);

  // An open with nothing checked off ends the check-off streak.
  if (day.kind === 'open') checkStreak = 0;

  if (day.kind === 'game') {
    const won = day.result === 'W';
    const perfect = won && day.perfect === true && day.rally !== true;
    const tasks = day.tasks ?? (perfect ? 6 : won ? 4 : 2);
    s.gamesPlayed += 1;
    s.tasksDone += tasks;
    checkStreak = tasks > 0 ? checkStreak + 1 : 0;
    s.longestCheckStreak = Math.max(s.longestCheckStreak, checkStreak);
    if (won) {
      s.wins += 1;
      winStreak += 1;
      s.longestWinStreak = Math.max(s.longestWinStreak, winStreak);
      if (lastResult === 'L') s.bounceBacks += 1;
      if (day.rally) s.rallyWins += 1;
      if (perfect) {
        s.perfectGames += 1;
        perfectInSeries += 1;
        s.bestPerfectInSeries = Math.max(s.bestPerfectInSeries, perfectInSeries);
      }
      season.wins += 1;
    } else {
      winStreak = 0;
      season.losses += 1;
    }
    lastResult = day.result;
    series = [...series, day.result];

    if (series.length === SERIES_LENGTH) {
      const w = series.filter((r) => r === 'W').length;
      const wonSeries = w >= 4;
      if (wonSeries) {
        s.seriesWon += 1;
        season.seriesWon += 1;
        if (w === SERIES_LENGTH) s.sweeps += 1;
        if (series.slice(0, 3).every((r) => r === 'L')) s.reverseSweeps += 1;
        const firstSix = series.slice(0, 6).filter((r) => r === 'W').length;
        if (firstSix === 3 && series[6] === 'W') s.game7Wins += 1;
      }
      // Every simulated week is played as scheduled.
      s.ironMans += 1;
      season.seriesPlayed += 1;
      series = [];
      perfectInSeries = 0;

      if (season.seriesPlayed === SERIES_PER_SEASON) {
        if (season.wins > season.losses) s.winningSeasons += 1;
        if (season.wins >= sim.winGoal) s.goalsReached += 1;
        if (season.seriesWon === SERIES_PER_SEASON) s.perfectSeasons += 1;
        season = { wins: 0, losses: 0, seriesWon: 0, seriesPlayed: 0 };
      }
    }
  }

  return { ...sim, stats: s, openStreak, checkStreak, winStreak, lastResult, series, perfectInSeries, season };
}

/** A day with the app left closed: the open streak ends. */
export function skipDay(sim: AchievementSim): AchievementSim {
  return { ...sim, openStreak: 0, checkStreak: 0 };
}
