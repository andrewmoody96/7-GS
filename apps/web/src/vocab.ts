// Vocabulary layer: generic data names (GAME_DESIGN §3) → the words a skin shows.
// Every game-concept string a component renders comes from here, so a future sport
// skin only has to provide another `Vocab`.

import type { Theme } from '@7gs/rules';
import type {
  GameStatus,
  Phase,
  RainoutIneligibleReason,
  RallyIneligibleReason,
  ResultDetail,
  SeriesStatus,
  StarterWarning,
  SuspensionIneligibleReason,
  TaskKind,
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

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

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
  /** Theme flavor: words that only make sense in this sport. */
  flavor: {
    /** The weekday defaults as a set ("Rotation"). */
    rotation: string;
    /** How a lineup is ordered ("Batting order"). */
    lineupOrder: string;
    /** Second game of a doubleheader ("nightcap"). */
    secondGame: string;
    welcome: string;
    signingIn: string;
    serverDown: string;
    /** Appearance choices: light and dark ("Day game" / "Night game"). */
    light: string;
    dark: string;
  };
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
    pinchHitter: string;
    pinchHitterShort: string;
    /** A regular (non-must-hit) task added after the week started. */
    addedLate: string;
    carriedOver: string;
    suspended: string;
    noDecision: string;
    noDecisionShort: string;
    noDecisions: string;
    weekLocked: string;
  };
  taskKind: Record<TaskKind, string>;
  /** Roster line for a missed one-off must-hit that's still to do. */
  carryoverNote: string;
  week: {
    title: string;
    thisWeek: string;
    nextWeek: string;
    openingWeek: string;
    openingBlurb: string;
    lockedTitle: string;
    lockedBlurb: string;
    planningTitle: string;
    planningBlurb: (firstPitch: string | null) => string;
    nextOpensFriday: string;
    editDay: string;
    addToBench: string;
    oneOffHint: string;
  };
  pinchHit: {
    action: string;
    makeMustHit: string;
    title: string;
    explainer: string;
    raise: (runs: number) => string;
    thresholdLine: (threshold: number, raise: number) => string;
    confirm: string;
    fromBench: string;
    fromRoster: string;
    none: string;
    done: (name: string, threshold: number) => string;
    doneOptional: (name: string, threshold: number) => string;
    explainerLater: string;
    mustHitSwitch: string;
    mustHitOn: string;
    mustHitOff: string;
  };
  suspension: {
    action: string;
    title: string;
    explainer: string;
    resumeLegend: string;
    resumeLede: string;
    noDays: string;
    endNoDecision: string;
    resume: string;
    cost: (available: number) => string;
    deadline: (time: string) => string;
    resumedFrom: (day: string) => string;
    movedTo: (day: string) => string;
    noDecisionBlurb: string;
    done: (day: string | null) => string;
    reason: Record<SuspensionIneligibleReason, string>;
  };
  tabs: { today: string; series: string; team: string; addTask: string };
  /** "1 run", "3 runs". */
  runs: (n: number) => string;
  hits: (n: number) => string;
  gameLabel: (gameNumber: number) => string;
  seriesLabel: (status: SeriesStatus) => string;
  /** "Series 3", or the Head Start's name for series 0. */
  seriesName: (number: number) => string;
  headStart: {
    name: string;
    /** What a Head Start is, in one line. */
    blurb: string;
    offerTitle: string;
    offerBody: (days: number, openingDay: string) => string;
    action: string;
    waitNote: (openingDay: string) => string;
    confirmTitle: string;
    confirmBody: (days: number, openingDay: string) => string;
    started: (days: number) => string;
  };
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
    heldTitle: string;
    heldNote: string;
    heldSpot: (role: 'lineup' | 'bench', position: number) => string;
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
  app: { name: '7-Game Series', shortName: '7GS', tagline: 'Win the day. Win the week. Win the season.' },
  flavor: {
    rotation: 'Rotation',
    lineupOrder: 'Batting order',
    secondGame: 'nightcap',
    welcome: 'Welcome to the ballpark',
    signingIn: 'Checking your ticket…',
    serverDown: 'The ballpark’s systems are down. Try again in a minute.',
    light: 'Day game',
    dark: 'Night game',
  },
  term: {
    season: 'Season',
    offseason: 'Review Week',
    preseason: 'Spring Training',
    series: 'Series',
    game: 'Game',
    doubleheader: 'Doubleheader',
    opponent: 'Opponent',
    taskDefinition: 'Tasks',
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
    roster: 'Tasks',
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
    pinchHitter: 'Pinch hitter',
    pinchHitterShort: 'PH',
    addedLate: 'Added',
    carriedOver: 'Carried over',
    suspended: 'Suspended',
    noDecision: 'No decision',
    noDecisionShort: 'ND',
    noDecisions: 'No decisions',
    weekLocked: 'Week locked',
  },
  taskKind: { recurring: 'Recurring', one_off: 'One-off' },
  carryoverNote: 'Still to do · carries to next game',
  week: {
    title: 'Lineup card',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    openingWeek: 'Opening Week',
    openingBlurb: 'Opening Week: plan it now. Nothing counts until Opening Day.',
    lockedTitle: 'Week in progress — add only',
    lockedBlurb:
      'This week has started. You can still add tasks to today or any later day, but you can’t remove tasks or lower runs to win. A task you add is a must-hit (a pinch hitter), and that day’s runs to win goes up by its runs. For an optional extra, add it to the bench instead.',
    planningTitle: 'Planning',
    planningBlurb: (firstPitch) =>
      `Anything goes until the week’s first pitch${firstPitch ? ` (${firstPitch})` : ''}: add or remove tasks, reorder, set must-hits and runs to win, and place one-offs on a day.`,
    nextOpensFriday: 'Next week’s card opens Friday.',
    editDay: 'Edit day',
    addToBench: 'Add to bench',
    oneOffHint: 'One-offs retire once done. A missed one-off must-hit moves to the next game day as a pinch hitter.',
  },
  pinchHit: {
    action: 'Add a task',
    makeMustHit: 'Make must-hit',
    title: 'Add a task to this day',
    explainer:
      'The week has started, so a task you add now comes in as a pinch hitter: it’s a must-hit, and runs to win goes up by exactly its runs. Your cushion stays the same. For an optional extra, add it to the bench instead.',
    raise: (runs) => `+${runs} pinch hit`,
    thresholdLine: (threshold, raise) => `Runs to win ${threshold}${raise > 0 ? ` · +${raise} pinch hit` : ''}`,
    confirm: 'Add to lineup',
    fromBench: 'On the bench',
    fromRoster: 'From your tasks',
    none: 'Every active task is already in this lineup.',
    done: (name, threshold) => `${name} added as a pinch hitter. Runs to win is ${threshold}.`,
    doneOptional: (name, threshold) => `${name} added to the lineup. Runs to win is ${threshold}.`,
    explainerLater:
      'This day hasn’t started, so you choose: a must-hit, or a regular task you can skip without losing the day. Either way runs to win goes up by exactly its runs, so the day gets no easier.',
    mustHitSwitch: 'Make it a must-hit',
    mustHitOn: 'Miss it and you lose that day.',
    mustHitOff: 'A regular task: it scores runs when you do it, and skipping it won’t sink the day by itself.',
  },
  suspension: {
    action: 'Suspend game',
    title: 'Suspend the game',
    explainer:
      'Something came up mid-day, or you couldn’t open the app until this morning. It isn’t a loss. Progress is kept and the game resumes later in the week as a doubleheader, with the same must-hits and runs to win.',
    resumeLegend: 'Resume on',
    resumeLede: 'Pick the day it resumes. That day becomes a doubleheader.',
    noDays:
      'No day is left to resume it this week, so it ends as a no-decision: neither a W nor an L. Streaks are frozen, not broken.',
    endNoDecision: 'End as no decision',
    resume: 'Suspend and resume',
    cost: (n) => `Uses 1 of your ${n} Rainouts this month (Rainouts and suspensions share the allowance).`,
    deadline: (time) => `Can be called until ${time}.`,
    resumedFrom: (day) => `Resumed · from ${day}`,
    movedTo: (day) => `Suspended → ${day}`,
    noDecisionBlurb: 'Suspended — no decision. Neither a W nor an L; streaks are frozen.',
    done: (day) => (day ? `Suspended. It resumes ${day} as a doubleheader.` : 'Suspended. It ends as a no-decision.'),
    reason: {
      FUTURE_GAME: 'That game hasn’t started. Plan around it with a Rainout.',
      GAME_WON: 'You won this one. Nothing to suspend.',
      NO_DECISION: 'This game already ended as a no-decision.',
      WINDOW_CLOSED: 'Suspensions close at 11:59 a.m. the day after the game.',
      RALLY_ROLLED: 'The Rally Cap dice already rolled for this game.',
      NO_ALLOWANCE: 'No Rainouts left this month, so this one is played out.',
    },
  },
  tabs: { today: 'Today', series: 'Series', team: 'Team', addTask: 'Add task' },
  runs: (n) => plural(n, 'run', 'runs'),
  hits: (n) => plural(n, 'hit', 'hits'),
  gameLabel: (n) => `Game ${n}`,
  seriesLabel: (status) => status.label,
  seriesName: (n) => (n === 0 ? 'Head Start' : `Series ${n}`),
  headStart: {
    name: 'Head Start',
    blurb: 'Head Start: these games count toward your season record. They aren’t scored as a series. Series 1 starts Monday.',
    offerTitle: 'When do you want to start?',
    offerBody: (days, openingDay) =>
      `Start today and the ${days === 1 ? 'day' : `${days} days`} left this week ${days === 1 ? 'is a real game' : 'are real games'} that ${days === 1 ? 'counts' : 'count'} toward your season record. Series 1 still starts ${openingDay}.`,
    action: 'Start today',
    waitNote: (openingDay) => `Or do nothing and your season starts ${openingDay}. Until then, nothing counts.`,
    confirmTitle: 'Start your season today?',
    confirmBody: (days, openingDay) =>
      `Today becomes a real game, and so ${days <= 2 ? 'does tomorrow' : 'do the days'} through Sunday${days === 1 ? '' : ` (${days} games in all)`}. Wins and losses go on your season record. This short week isn’t scored as a series: Series 1 starts ${openingDay}. You can’t undo this.`,
    started: (days) => `You’re playing. ${days === 1 ? 'Today counts' : `${days} games this week count`} toward your season record.`,
  },
  resultDetail: {
    clean: 'Win',
    short: 'Came up short',
    forfeit: 'Forfeit · 1 must-hit missed',
    no_appeal: 'No appeal · 2+ must-hits missed',
    rally: 'Rally W',
    suspended: 'Suspended · no decision',
  },
  resultDetailShort: {
    clean: '',
    short: 'Short',
    forfeit: 'Forfeit',
    no_appeal: 'No appeal',
    rally: 'Rally',
    suspended: 'ND',
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
    NO_DECISION: 'A no-decision can’t be appealed.',
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
    RATE_LIMITED: 'Too many tries. Wait a few minutes and try again.',
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
      'The Injured List sits a task out and freezes its streak. Its lineup spots are held and runs to win stays put; activating it puts the task back in those spots. Once today’s game or the week has had first pitch, it sits out from tomorrow.',
    minimum: (days) => `Minimum stint: ${days} game days (Review Week doesn’t count), so the IL can’t dodge a single hard day.`,
    eligibleOn: (date) => `Eligible to return ${date}`,
    place: 'Place on IL',
    activate: 'Activate',
    heldTitle: 'On the IL',
    heldNote: 'Back in this spot when activated. Runs to win stays put.',
    heldSpot: (role, position) => (role === 'bench' ? 'Bench' : `Bats ${ordinal(position)}`),
  },
  emptyStates: {
    preseasonTitle: 'Spring Training',
    preseasonBody: (openingDay, days) =>
      `Opening Day is ${openingDay}${days > 0 ? ` (${plural(days, 'day', 'days')})` : ''}. Add your tasks with + Add task and set up your rotation under Team. Nothing counts yet, and you can add or change tasks any time after Opening Day too. A season is 12 weeks, then a Review Week.`,
    offseasonTitle: 'Review Week',
    offseasonBody: (nextSeason) =>
      `No games this week. Review the season, make front-office moves, and get ready for Opening Day ${nextSeason}.`,
    noGamesToday: 'No game today.',
  },
};

/**
 * Each sport's wording. Basketball and hockey use baseball's until their own are written
 * (phases 2 and 3 of the theme plan).
 */
const VOCABS: Record<Theme, Vocab> = { baseball, basketball: baseball, hockey: baseball };

/**
 * The active theme's words. A live object: applyTheme swaps its contents, and the app
 * redraws below AuthGate, so everything reads the new words at render time.
 */
export const vocab: Vocab = { ...baseball };

/** Themes that have their own words yet (the first-login sport question lists these). */
export const AVAILABLE_THEMES: readonly Theme[] = (Object.keys(VOCABS) as Theme[]).filter(
  (t) => t === 'baseball' || VOCABS[t] !== baseball,
);
let active: Theme = 'baseball';

export function activeTheme(): Theme {
  return active;
}

/** Switch the words to `theme`. Returns whether anything changed. */
export function applyTheme(theme: Theme): boolean {
  if (theme === active) return false;
  Object.assign(vocab, VOCABS[theme]);
  active = theme;
  return true;
}
