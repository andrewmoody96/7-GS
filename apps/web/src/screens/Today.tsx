import type { GameDto, GameSummaryDto, SeriesDto, TodayDto } from '@7gs/contracts';
import { addDays, type CalendarPosition, type GameEvaluation } from '@7gs/rules';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../app/context';
import { deviceTimeZone, onceKey, useNow } from '../app/hooks';
import {
  useCurrentSeasonQuery,
  useEntryAction,
  useLockGame,
  useMeQuery,
  usePatchLineup,
  useRallyQuoteQuery,
  useTasksQuery,
  useTodayQuery,
} from '../app/queries';
import { Bench, SubsLog } from '../components/Bench';
import { Chyron } from '../components/Chyron';
import { IconCap, IconChevronRight, IconEdit, IconLock, IconRain } from '../components/icons';
import { Jumbotron } from '../components/Jumbotron';
import { Lineup } from '../components/Lineup';
import { LineupEditor, type EditorState } from '../components/LineupEditor';
import { RainoutSheet } from '../components/RainoutSheet';
import { RallySheet } from '../components/RallySheet';
import { Scoreboard, type BoardStatus } from '../components/Scoreboard';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { Tile } from '../components/Tile';
import { formatDateLong, formatTime, formatTimeOfDay, score, weekdayLong } from '../lib/format';
import { evaluate, gamesOn, isLocked, lineScore, projectionText, situationKeys, statusOfSeries } from '../lib/game';
import { buzz } from '../lib/motion';
import { vocab } from '../vocab';

export function TodayScreen() {
  const today = useTodayQuery();
  const me = useMeQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (today.isPending) return <Loading label="Loading today’s game" />;
  if (today.isError) return <ErrorPanel error={today.error} onRetry={() => void today.refetch()} />;

  const data = today.data;
  const timeZone = me.data?.timezone ?? deviceTimeZone();
  const teamName = me.data?.displayName ?? vocab.terms.you;

  if (data.position.phase === 'preseason') return <SpringTraining position={data.position} />;
  if (data.position.phase === 'offseason') return <ReviewWeek position={data.position} />;

  const games = data.games;
  const game = games.find((g) => g.id === selectedId) ?? games[0];

  return (
    <div className="screen screen--today">
      <h1 className="sr-only">{vocab.tabs.today}</h1>
      <TodayChyron data={data} />
      <LastNight series={data.series} date={data.date} timeZone={timeZone} />
      {games.length > 1 ? (
        <div className="dh-tabs" role="tablist" aria-label={vocab.term.doubleheader}>
          {games.map((g, i) => {
            const line = lineScore(g);
            const selected = g.id === game?.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                id={`tab-${g.id}`}
                aria-selected={selected}
                aria-controls={`panel-${g.id}`}
                className={`dh-tab${selected ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(g.id)}
              >
                <span className="dh-tab__kicker">
                  {vocab.term.game} {i + 1}
                  {g.postponed ? ` · ${vocab.terms.makeup}` : ''}
                </span>
                <span className="dh-tab__name">{g.starterName}</span>
                <span className="dh-tab__score">{score(line.runs, g.threshold)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {game ? (
        <div role={games.length > 1 ? 'tabpanel' : undefined} id={`panel-${game.id}`} aria-labelledby={games.length > 1 ? `tab-${game.id}` : undefined}>
          <GameCard
            key={game.id}
            game={game}
            series={data.series}
            teamName={teamName}
            timeZone={timeZone}
            doubleheader={games.length > 1}
          />
        </div>
      ) : (
        <EmptyState title={vocab.emptyStates.noGamesToday} />
      )}
    </div>
  );
}

function TodayChyron({ data }: { data: TodayDto }) {
  if (!data.series) return null;
  const status = statusOfSeries(data.series);
  const first = data.games[0];
  const tail =
    data.games.length > 1
      ? vocab.chyron.doubleheaderToday
      : first
        ? vocab.chyron.tonight(first.gameNumber)
        : vocab.chyron.everyGameCounts;
  return (
    <Chyron
      tags={situationKeys(status)}
      headline={`${vocab.seriesLabel(status)} · ${tail}`}
      live={data.games.some((g) => g.status === 'live')}
    />
  );
}

// ── Last night ───────────────────────────────────────────────────────────────

function LastNight({ series, date, timeZone }: { series: SeriesDto | null; date: string; timeZone: string }) {
  const finals = gamesOn(series, addDays(date, -1)).filter((g) => g.status === 'final');
  if (finals.length === 0) return null;
  return (
    <section className="lastnight" aria-label="Last night">
      {finals.map((g) => (
        <LastNightGame key={g.id} game={g} opponent={series?.opponent.name ?? vocab.term.opponent} timeZone={timeZone} />
      ))}
    </section>
  );
}

function LastNightGame({ game, opponent, timeZone }: { game: GameSummaryDto; opponent: string; timeZone: string }) {
  const win = game.result === 'W';
  const maybeRally = !win && game.missedRequired <= 1;
  const quote = useRallyQuoteQuery(game.id, maybeRally);
  const [rallyOpen, setRallyOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // A W gets its jumbotron moment the first time you see it go final.
  useEffect(() => {
    if (!win) return;
    const once = onceKey(`final-w:${game.id}`);
    if (!once.seen) {
      once.mark();
      setCelebrate(true);
    }
  }, [win, game.id]);

  const rally = game.resultDetail === 'rally';
  const eligible = quote.data?.eligible === true;
  return (
    <div className={`recap recap--${win ? 'win' : 'loss'}`}>
      <div className="recap__stamp" aria-hidden="true">
        {game.result}
      </div>
      <div className="recap__body">
        <p className="recap__kicker">
          Last night · {vocab.term.final} · {vocab.gameLabel(game.gameNumber)}
        </p>
        <p className="recap__line">
          <span className="sr-only">{win ? 'Win' : 'Loss'}, </span>
          {score(game.runs, game.threshold)} vs {opponent}
        </p>
        <p className="recap__detail">{game.resultDetail ? vocab.resultDetail[game.resultDetail] : ''}</p>
      </div>
      {eligible ? (
        <button type="button" className="btn btn--gold recap__cta" onClick={() => setRallyOpen(true)}>
          <IconCap /> {vocab.term.comebackToken}
          {quote.data?.deadline ? <span className="recap__until">until {formatTime(quote.data.deadline, timeZone)}</span> : null}
        </button>
      ) : win ? (
        <button type="button" className="btn btn--quiet recap__cta" onClick={() => setCelebrate(true)}>
          Replay
        </button>
      ) : null}
      <RallySheet game={game} open={rallyOpen} onClose={() => setRallyOpen(false)} timeZone={timeZone} />
      <Jumbotron
        open={celebrate}
        headline={rally ? vocab.jumbotron.walkOff : vocab.jumbotron.win}
        detail={`${vocab.term.final} · ${vocab.gameLabel(game.gameNumber)} · ${score(game.runs, game.threshold)}${rally ? ` · ${vocab.resultDetail.rally}` : ''}`}
        onClose={() => setCelebrate(false)}
      />
    </div>
  );
}

// ── One game ─────────────────────────────────────────────────────────────────

interface GameCardProps {
  game: GameDto;
  series: SeriesDto | null;
  teamName: string;
  timeZone: string;
  doubleheader: boolean;
}

function GameCard({ game, series, teamName, timeZone, doubleheader }: GameCardProps) {
  const api = useApi();
  const now = useNow();
  const final = game.status === 'final';
  const locked = isLocked(game, now, timeZone);
  const ev = evaluate(game);
  const entryAction = useEntryAction();
  const lockGame = useLockGame();
  const patchLineup = usePatchLineup();
  const [editing, setEditing] = useState(false);
  const tasks = useTasksQuery();
  const [rainoutOpen, setRainoutOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Celebrate the moment the projection flips to W from your own check-off.
  const previous = useRef(ev.result);
  useEffect(() => {
    if (previous.current === 'L' && ev.result === 'W' && !final) setCelebrate(true);
    previous.current = ev.result;
  }, [ev.result, final]);

  useEffect(() => {
    if (locked) setEditing(false);
  }, [locked]);

  const status: BoardStatus = final ? 'final' : locked ? 'live' : 'pregame';
  const note = game.postponed
    ? `${vocab.term.doubleheader} · ${vocab.terms.makeup} of ${weekdayLong(game.scheduledDate)}`
    : doubleheader
      ? `${vocab.term.doubleheader} · ${vocab.term.game} 1`
      : undefined;

  const save = (state: EditorState) => {
    patchLineup.mutate(
      {
        gameId: game.id,
        patch: {
          threshold: state.threshold,
          minTasks: state.minTasks,
          entries: [
            ...state.lineup.map((s, i) => ({ taskId: s.taskId, position: i + 1, required: s.required, role: 'lineup' as const })),
            ...state.bench.map((s, i) => ({ taskId: s.taskId, position: i + 1, required: false, role: 'bench' as const })),
          ],
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <article className="game" aria-label={`${vocab.gameLabel(game.gameNumber)}: ${game.starterName}`}>
      <Scoreboard game={game} opponent={series?.opponent ?? null} teamName={teamName} status={status} ev={ev} note={note} />
      <Projection ev={ev} game={game} />

      {!final && !locked && !editing ? (
        <section className="callout callout--pregame" aria-label={vocab.lock.pregame}>
          <p className="callout__title">
            <span className="tag tag--pregame">{vocab.lock.pregame}</span>
            {game.lockTime ? vocab.lock.firstPitchAt(formatTimeOfDay(game.lockTime)) : vocab.lock.firstPitchOnCheckoff}
          </p>
          <p className="callout__hint">{vocab.lock.firstCheckoffLocks}</p>
          <div className="callout__actions">
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <IconEdit /> Edit lineup
            </button>
            {!game.postponed ? (
              <button type="button" className="btn" onClick={() => setRainoutOpen(true)}>
                <IconRain /> {vocab.term.postponed}
              </button>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={() => lockGame.mutate(game.id)} disabled={lockGame.isPending}>
              {vocab.lock.lockNow}
            </button>
          </div>
        </section>
      ) : null}

      {!final && locked ? (
        <p className="lockbar">
          <IconLock width={18} height={18} />
          <span>
            {vocab.lock.locked} · {vocab.term.lockedAt}{' '}
            {game.lockedAt ? formatTime(game.lockedAt, timeZone) : game.lockTime ? formatTimeOfDay(game.lockTime) : ''}
          </span>
        </p>
      ) : null}

      {editing ? (
        <LineupEditor
          game={game}
          tasks={tasks.data ?? []}
          saving={patchLineup.isPending}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <section className="card" aria-labelledby={`lineup-${game.id}`}>
          <header className="card__head">
            <h2 id={`lineup-${game.id}`} className="card__title">
              {vocab.terms.lineup}
            </h2>
            <p className="card__sub">{final ? vocab.term.final : 'Batting order'}</p>
          </header>
          <Lineup
            game={game}
            final={final}
            onToggle={(entry, done) => {
              buzz();
              entryAction.mutate({
                kind: done ? 'complete' : 'uncomplete',
                gameId: game.id,
                entryId: entry.id,
                clientAt: api.now().toISOString(),
              });
            }}
            onPartial={(entry, partial) =>
              entryAction.mutate({ kind: 'partial', gameId: game.id, entryId: entry.id, clientAt: api.now().toISOString(), partial })
            }
          />
        </section>
      )}

      {!editing ? <Bench game={game} locked={locked} final={final} /> : null}
      <SubsLog game={game} timeZone={timeZone} />

      <RainoutSheet game={game} open={rainoutOpen} onClose={() => setRainoutOpen(false)} />
      <Jumbotron
        open={celebrate}
        headline={vocab.jumbotron.inHand}
        detail={`${score(ev.runs, game.threshold)} · ${vocab.projection.win}`}
        onClose={() => setCelebrate(false)}
      />
    </article>
  );
}

function Projection({ ev, game }: { ev: GameEvaluation; game: GameDto }) {
  if (game.status === 'final') {
    const detail = game.resultDetail ? vocab.resultDetail[game.resultDetail] : '';
    return (
      <p className={`projection projection--${game.result === 'W' ? 'win' : 'loss'}`}>
        {vocab.term.final}: {game.result} {score(game.runs, game.threshold)}
        {detail ? ` · ${detail}` : ''}
      </p>
    );
  }
  return (
    <p className={`projection projection--${ev.result === 'W' ? 'win' : 'need'}`} aria-live="polite">
      <span className="projection__label">{ev.result === 'W' ? vocab.jumbotron.inHand : 'Projected'}</span>
      <span className="projection__text">{projectionText(ev, vocab)}</span>
    </p>
  );
}

// ── Off days ─────────────────────────────────────────────────────────────────

function SpringTraining({ position }: { position: Extract<CalendarPosition, { phase: 'preseason' }> }) {
  return (
    <div className="screen screen--offday">
      <h1 className="sr-only">{vocab.tabs.today}</h1>
      <section className="board board--offday" aria-label={vocab.emptyStates.preseasonTitle}>
        <p className="board__eyebrow">{vocab.emptyStates.preseasonTitle}</p>
        <p className="board__big">Opening Day</p>
        <p className="board__date">{formatDateLong(position.openingDay)}</p>
        <div className="countdown">
          <Tile value={position.daysUntilOpeningDay} size="l" />
          <span className="countdown__label">{position.daysUntilOpeningDay === 1 ? 'day to go' : 'days to go'}</span>
        </div>
      </section>
      <p className="lede">{vocab.emptyStates.preseasonBody(formatDateLong(position.openingDay), position.daysUntilOpeningDay)}</p>
      <nav className="todo" aria-label="Get ready">
        <Link to="/film-room?tab=roster" className="todo__item">
          <span>
            <strong>Set your {vocab.terms.roster.toLowerCase()}</strong>
            <small>The tasks and habits on your team.</small>
          </span>
          <IconChevronRight />
        </Link>
        <Link to="/film-room" className="todo__item">
          <span>
            <strong>Build the rotation</strong>
            <small>One {vocab.term.dayTemplate.toLowerCase()} per weekday: lineup, {vocab.term.required.toLowerCase()}s, opponent score.</small>
          </span>
          <IconChevronRight />
        </Link>
        <Link to="/season" className="todo__item">
          <span>
            <strong>Set a {vocab.terms.winGoal.toLowerCase()}</strong>
            <small>Only during {vocab.term.preseason} or {vocab.term.offseason}.</small>
          </span>
          <IconChevronRight />
        </Link>
      </nav>
    </div>
  );
}

function ReviewWeek({ position }: { position: Extract<CalendarPosition, { phase: 'offseason' }> }) {
  const season = useCurrentSeasonQuery();
  const s = season.data;
  return (
    <div className="screen screen--offday">
      <h1 className="sr-only">{vocab.tabs.today}</h1>
      <section className="board board--offday" aria-label={vocab.emptyStates.offseasonTitle}>
        <p className="board__eyebrow">{vocab.emptyStates.offseasonTitle}</p>
        <p className="board__big">
          {vocab.term.season} {position.seasonNumber} {vocab.term.final.toLowerCase()}
        </p>
        {s ? (
          <div className="countdown">
            <Tile value={s.wins} size="l" />
            <span className="countdown__dash">–</span>
            <Tile value={s.losses} size="l" />
          </div>
        ) : null}
        <p className="board__date">Opening Day {formatDateLong(position.nextSeasonStart)}</p>
      </section>
      <p className="lede">{vocab.emptyStates.offseasonBody(formatDateLong(position.nextSeasonStart))}</p>
      <nav className="todo" aria-label="Review Week">
        <Link to="/season" className="todo__item">
          <span>
            <strong>Season review</strong>
            <small>Final record, streaks and pace against your goal.</small>
          </span>
          <IconChevronRight />
        </Link>
        <Link to="/film-room" className="todo__item">
          <span>
            <strong>Front office</strong>
            <small>Retire tasks, sign free agents, rebuild starters.</small>
          </span>
          <IconChevronRight />
        </Link>
      </nav>
    </div>
  );
}
