// Vocabulary layer: generic data names (GAME_DESIGN §3) → the words a skin shows.
// Every game-concept string a component renders comes from here, so a future sport
// skin only has to provide another `Vocab`.

import type {
  GameStatus,
  Phase,
  RainoutIneligibleReason,
  RallyIneligibleReason,
  ResultDetail,
  SeriesStatus,
  StarterWarning,
  TaskStatus,
} from '@7gs/rules';
import type { ErrorCode } from '@7gs/contracts';

/** Glossary keys are the generic data names from GAME_DESIGN §3, in camelCase. */
export type GenericTerm =
  | 'season'
  | 'offseason'
  | 'preseason'
  | 'series'
  | 'game'
  | 'doubleheader'
  | 'opponent'
  | 'taskDefinition'
  | 'dayTemplate'
  | 'lineupEntry'
  | 'required'
  | 'points'
  | 'bench'
  | 'paused'
  | 'postponed'
  | 'comebackToken'
  | 'lockedAt'
  | 'final';

export const GENERIC_TERMS: readonly GenericTerm[] = [
  'season',
  'offseason',
  'preseason',
  'series',
  'game',
  'doubleheader',
  'opponent',
  'taskDefinition',
  'dayTemplate',
  'lineupEntry',
  'required',
  'points',
  'bench',
  'paused',
  'postponed',
  'comebackToken',
  'lockedAt',
  'final',
];

export type SituationKey = 'clinch' | 'elimination' | 'game7' | 'sweepWatch' | 'decidedWon' | 'decidedLost';

export interface Vocab {
  app: { name: string; shortName: string; tagline: string };
  /** One label per generic concept (the §3 glossary). */
  term: Record<GenericTerm, string>;
  /** Plural or short forms the UI needs alongside `term`. */
  terms: {
    seasons: string;
    roster: string;
    task: string;
    tasks: string;
    starters: string;
    lineup: string;
    requiredShort: string;
    pausedShort: string;
    postponedShort: string;
    makeup: string;
    comebackTokens: string;
    rainouts: string;
    tasksDone: string;
    runsShort: string;
    hitsShort: string;
    win: string;
    loss: string;
    partial: string;
    substitution: string;
    threshold: string;
    minTasks: string;
    lockTime: string;
    winGoal: string;
    gamesBehind: string;
    record: string;
    winPct: string;
    runDifferential: string;
    rallyWins: string;
    winStreak: string;
    longestWinStreak: string;
    seriesRecord: string;
    boxScore: string;
    you: string;
    ironMan: string;
  };
  tabs: { today: string; series: string; filmRoom: string; season: string };
  /** "1 run", "3 runs". */
  runs: (n: number) => string;
  hits: (n: number) => string;
  gameLabel: (gameNumber: number) => string;
  seriesLabel: (status: SeriesStatus) => string;
  resultDetail: Record<ResultDetail, string>;
  /** Compact form for tight spots like the game log ('' when nothing to add). */
  resultDetailShort: Record<ResultDetail, string>;
  gameStatus: Record<GameStatus, string>;
  phase: Record<Phase, string>;
  taskStatus: Record<TaskStatus, string>;
  starterWarning: Record<StarterWarning, string>;
  rainoutReason: Record<RainoutIneligibleReason, string>;
  rallyReason: Record<RallyIneligibleReason, string>;
  error: Record<ErrorCode, string>;
  situation: Record<SituationKey, { tag: string; blurb: string }>;
  projection: {
    win: string;
    needPrefix: string;
    moreRuns: (n: number) => string;
    mustHits: (n: number) => string;
    moreHits: (n: number) => string;
    noAppeal: string;
  };
  chyron: {
    tonight: (gameNumber: number) => string;
    doubleheaderToday: string;
    final: string;
    everyGameCounts: string;
    seriesStarts: string;
  };
  lock: {
    pregame: string;
    live: string;
    locked: string;
    firstPitchAt: (time: string) => string;
    firstPitchOnCheckoff: string;
    firstCheckoffLocks: string;
    lockNow: string;
  };
  rally: {
    title: string;
    available: string;
    needOrUnder: (pct: number) => string;
    roll: string;
    hit: string;
    miss: string;
    missDetail: string;
    hitDetail: string;
    base: (streak: number) => string;
    closeness: (pct: number) => string;
    missedMustHit: string;
    warningTrack: string;
    runCushion: string;
    floor: string;
    cap: string;
    tokenNote: (available: number) => string;
  };
  jumbotron: { win: string; walkOff: string; inHand: string; finalAtMidnight: string };
  il: {
    explainer: string;
    minimum: (days: number) => string;
    eligibleOn: (date: string) => string;
    place: string;
    activate: string;
  };
  emptyStates: {
    preseasonTitle: string;
    preseasonBody: (openingDay: string, days: number) => string;
    offseasonTitle: string;
    offseasonBody: (nextSeason: string) => string;
    noGamesToday: string;
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const baseball: Vocab = {
  app: { name: '7-Game Series', shortName: '7GS', tagline: 'Every week is a best-of-7.' },
  term: {
    season: 'Season',
    offseason: 'Review Week',
    preseason: 'Spring Training',
    series: 'Series',
    game: 'Game',
    doubleheader: 'Doubleheader',
    opponent: 'Opponent',
    taskDefinition: 'Roster',
    dayTemplate: 'Starter',
    lineupEntry: 'Lineup',
    required: 'Must-hit',
    points: 'Runs',
    bench: 'Bench',
    paused: 'Injured List',
    postponed: 'Rainout',
    comebackToken: 'Rally Cap',
    lockedAt: 'First pitch',
    final: 'Final',
  },
  terms: {
    seasons: 'Seasons',
    roster: 'Roster',
    task: 'Task',
    tasks: 'Tasks',
    starters: 'Starters',
    lineup: 'Lineup',
    requiredShort: 'MUST',
    pausedShort: 'IL',
    postponedShort: 'PPD',
    makeup: 'Makeup',
    comebackTokens: 'Rally Caps',
    rainouts: 'Rainouts',
    tasksDone: 'Hits',
    runsShort: 'R',
    hitsShort: 'H',
    win: 'W',
    loss: 'L',
    partial: 'Warning track',
    substitution: 'Sub',
    threshold: 'Runs to win',
    minTasks: 'Minimum hits',
    lockTime: 'First pitch time',
    winGoal: 'Win goal',
    gamesBehind: 'GB',
    record: 'Record',
    winPct: 'Win %',
    runDifferential: 'Run diff',
    rallyWins: 'Rally wins',
    winStreak: 'Win streak',
    longestWinStreak: 'Longest streak',
    seriesRecord: 'Series record',
    boxScore: 'Box score',
    you: 'You',
    ironMan: 'Iron Man',
  },
  tabs: { today: 'Today', series: 'Series', filmRoom: 'Film Room', season: 'Season' },
  runs: (n) => plural(n, 'run', 'runs'),
  hits: (n) => plural(n, 'hit', 'hits'),
  gameLabel: (n) => `Game ${n}`,
  seriesLabel: (status) => status.label,
  resultDetail: {
    clean: 'Win',
    short: 'Came up short',
    forfeit: 'Forfeit · 1 must-hit missed',
    no_appeal: 'No appeal · 2+ must-hits missed',
    rally: 'Rally W',
  },
  resultDetailShort: {
    clean: '',
    short: 'Short',
    forfeit: 'Forfeit',
    no_appeal: 'No appeal',
    rally: 'Rally',
  },
  gameStatus: { scheduled: 'Pregame', live: 'Live', final: 'Final' },
  phase: { preseason: 'Spring Training', season: 'Season', offseason: 'Review Week' },
  taskStatus: { active: 'Active', injured: 'Injured List', retired: 'Retired' },
  starterWarning: {
    EMPTY_LINEUP: 'The lineup is empty, so this starter can never win.',
    THRESHOLD_UNREACHABLE: 'Even a perfect day can’t reach the opponent’s score.',
    MIN_TASKS_UNREACHABLE: 'The minimum hits is more than the tasks in the lineup.',
    DUPLICATE_TASK: 'A task appears more than once.',
  },
  rainoutReason: {
    GAME_FINAL: 'This game is already final.',
    GAME_LOCKED: 'First pitch has passed. This one has to be played.',
    MAKEUP_GAME: 'A makeup game can’t be rained out again.',
    SUNDAY: 'No dates left in the series.',
    PAST_GAME: 'That game day has passed.',
    NO_ALLOWANCE: 'No Rainouts left this month.',
    NO_MAKEUP_DATES: 'No dates left in the series.',
  },
  rallyReason: {
    OUT_OF_SEASON: 'Rally Caps aren’t used in Spring Training or Review Week.',
    GAME_NOT_FINAL: 'The game isn’t final yet.',
    GAME_WON: 'You won this one. No rally needed.',
    TOO_MANY_MISSED: 'Two or more must-hits missed: no appeal.',
    WINDOW_CLOSED: 'The Rally Cap window closed at 11:59 a.m. the next day.',
    ALREADY_ROLLED: 'The dice already rolled for this game.',
    SERIES_LIMIT: 'One Rally Cap per series, and this series has used it.',
    NO_TOKEN: 'No Rally Caps left this month.',
  },
  error: {
    UNAUTHORIZED: 'Please sign in again.',
    NOT_FOUND: 'That couldn’t be found.',
    VALIDATION_FAILED: 'Something in that request wasn’t valid.',
    CONFLICT: 'That conflicts with a recent change. Refresh and try again.',
    GAME_LOCKED: 'First pitch has passed. The lineup is locked.',
    GAME_FINAL: 'This game is final.',
    NOT_ELIGIBLE: 'That isn’t allowed right now.',
    NO_ALLOWANCE: 'None left this month.',
    INVALID_MAKEUP_DATE: 'That makeup date isn’t available.',
    IL_MINIMUM: 'The Injured List has a 3-day minimum.',
    OUT_OF_SEASON: 'Not available outside the season.',
    STALE_CHECKOFF: 'That check-off arrived after midnight and didn’t count.',
  },
  situation: {
    clinch: { tag: 'Clinch game', blurb: 'One win takes the series.' },
    elimination: { tag: 'Elimination game', blurb: 'Win or the series is lost.' },
    game7: { tag: 'Game 7', blurb: 'Winner takes the series.' },
    sweepWatch: { tag: 'Sweep watch', blurb: 'Perfect so far. Keep it clean.' },
    decidedWon: { tag: 'Series clinched', blurb: 'Every game still counts toward the season.' },
    decidedLost: { tag: 'Series lost', blurb: 'Every game still counts toward the season.' },
  },
  projection: {
    win: 'You’ve done enough to win. It goes final at midnight.',
    needPrefix: 'Need',
    moreRuns: (n) => `${n} more ${n === 1 ? 'run' : 'runs'}`,
    mustHits: (n) => plural(n, 'must-hit', 'must-hits'),
    moreHits: (n) => `${n} more ${n === 1 ? 'hit' : 'hits'}`,
    noAppeal: 'Two must-hits down: no Rally Cap if this stands.',
  },
  chyron: {
    tonight: (n) => `Game ${n} tonight`,
    doubleheaderToday: 'Doubleheader today',
    final: 'Final',
    everyGameCounts: 'Every game counts',
    seriesStarts: 'Series starts Monday',
  },
  lock: {
    pregame: 'Pregame',
    live: 'Live',
    locked: 'Lineup locked',
    firstPitchAt: (time) => `First pitch ${time}`,
    firstPitchOnCheckoff: 'First pitch at your first check-off',
    firstCheckoffLocks: 'Your first check-off throws the first pitch and locks the lineup.',
    lockNow: 'Play ball',
  },
  rally: {
    title: 'Rally Cap',
    available: 'Rally Cap available',
    needOrUnder: (pct) => `Need ${pct} or under`,
    roll: 'Roll the dice',
    hit: 'Walk-off W',
    miss: 'Struck out looking',
    missDetail: 'The L stands.',
    hitDetail: 'That’s a W!',
    base: (streak) => `Base (${streak}-game win streak)`,
    closeness: (pct) => `How close (${pct}%)`,
    missedMustHit: 'Missed must-hit',
    warningTrack: 'Warning track',
    runCushion: 'Run cushion',
    floor: 'Floor',
    cap: 'Cap',
    tokenNote: (n) => `${plural(n, 'Rally Cap', 'Rally Caps')} left this month · one per series`,
  },
  jumbotron: { win: 'W', walkOff: 'Walk-off W', inHand: 'W in hand', finalAtMidnight: 'Final at midnight' },
  il: {
    explainer:
      'The Injured List sits a task out of future lineups and freezes its streak. It can’t be used on today’s game after first pitch.',
    minimum: (days) => `Minimum stint: ${days} days, so the IL can’t dodge a single hard day.`,
    eligibleOn: (date) => `Eligible to return ${date}`,
    place: 'Place on IL',
    activate: 'Activate',
  },
  emptyStates: {
    preseasonTitle: 'Spring Training',
    preseasonBody: (openingDay, days) =>
      `Opening Day is ${openingDay}${days > 0 ? ` (${plural(days, 'day', 'days')})` : ''}. Set up your roster and rotation in the Film Room. Nothing counts yet, and you can add or change tasks any time after Opening Day too.`,
    offseasonTitle: 'Review Week',
    offseasonBody: (nextSeason) =>
      `No games this week. Review the season, make front-office moves, and get ready for Opening Day ${nextSeason}.`,
    noGamesToday: 'No game today.',
  },
};

/** The active skin. */
export const vocab: Vocab = baseball;
