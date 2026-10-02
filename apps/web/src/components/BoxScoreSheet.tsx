import type { GameSummaryDto } from '@7gs/contracts';
import { compareDates, type LocalDate } from '@7gs/rules';
import { useGameQuery } from '../app/queries';
import { formatDate, formatTime, score } from '../lib/format';
import { benchOf, isLocked, lineupOf } from '../lib/game';
import { vocab } from '../vocab';
import { SubsLog } from './Bench';
import { IconCap, IconCheck, IconRain, IconX } from './icons';
import { Sheet } from './Sheet';

interface BoxScoreSheetProps {
  game: GameSummaryDto | null;
  today: LocalDate;
  timeZone: string;
  now: Date;
  onClose: () => void;
  onRally: (game: GameSummaryDto) => void;
  onRainout: (game: GameSummaryDto) => void;
}

/** One game's box score: lineup, result, subs, the Rally Cap roll; plus what you can do next. */
export function BoxScoreSheet({ game, today, timeZone, now, onClose, onRally, onRainout }: BoxScoreSheetProps) {
  const detail = useGameQuery(game?.id ?? null);
  const g = detail.data;
  const final = game?.status === 'final';
  const canRally = final && game?.result === 'L' && (game?.missedRequired ?? 2) <= 1;
  const upcoming = game ? compareDates(game.playedDate, today) >= 0 && !final : false;
  const canRainout = upcoming && g ? !isLocked(g, now, timeZone) && !g.postponed : false;

  return (
    <Sheet
      open={game !== null}
      onClose={onClose}
      kicker={game ? `${vocab.gameLabel(game.gameNumber)} · ${formatDate(game.playedDate)}` : ''}
      title={game ? game.starterName : ''}
      footer={
        game && (canRally || canRainout) ? (
          <div className="actions">
            {canRally ? (
              <button type="button" className="btn btn--gold" onClick={() => onRally(game)}>
                <IconCap /> {vocab.term.comebackToken}
              </button>
            ) : null}
            {canRainout ? (
              <button type="button" className="btn" onClick={() => onRainout(game)}>
                <IconRain /> {vocab.term.postponed}
              </button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {game ? (
        <div className="boxscore">
          <p className="boxscore__line">
            {final ? (
              <>
                <span className={`result-tag result-tag--${game.result === 'W' ? 'win' : 'loss'}`}>{game.result}</span>
                <strong>{score(game.runs, game.threshold)}</strong>
                {game.resultDetail ? <span className="muted"> · {vocab.resultDetail[game.resultDetail]}</span> : null}
              </>
            ) : (
              <span className="muted">
                {vocab.terms.threshold}: {vocab.runs(game.threshold)}
                {game.minTasks !== null ? ` · ${vocab.terms.minTasks}: ${game.minTasks}` : ''}
              </span>
            )}
          </p>
          {game.postponed ? (
            <p className="notice">
              {vocab.term.postponed} on {formatDate(game.scheduledDate)}; made up {formatDate(game.playedDate)} as game {game.slot} of a{' '}
              {vocab.term.doubleheader.toLowerCase()}.
            </p>
          ) : null}
          {detail.isPending ? <p className="loading-line">Loading the box score…</p> : null}
          {g && g.entries.length === 0 ? (
            <p className="empty-line">The lineup is built from the {vocab.term.dayTemplate.toLowerCase()} on game day.</p>
          ) : null}
          {g && g.entries.length > 0 ? (
            <>
              <ol className="boxlist">
                {lineupOf(g).map((e) => (
                  <li key={e.id} className={e.completedAt ? 'is-done' : ''}>
                    <span className="boxlist__mark" aria-hidden="true">
                      {e.completedAt ? <IconCheck width={16} height={16} /> : final ? <IconX width={16} height={16} /> : null}
                    </span>
                    <span className="boxlist__name">
                      {e.taskName}
                      {e.required ? <span className="pill pill--must">{vocab.term.required}</span> : null}
                      {e.partial && !e.completedAt ? <span className="pill pill--partial">{vocab.terms.partial}</span> : null}
                    </span>
                    <span className="boxlist__pts">{e.completedAt ? `+${e.points}` : vocab.runs(e.points)}</span>
                    <span className="sr-only">{e.completedAt ? 'done' : final ? 'not done' : 'open'}</span>
                  </li>
                ))}
              </ol>
              {benchOf(g).length > 0 ? (
                <p className="fine">
                  {vocab.term.bench}: {benchOf(g).map((e) => e.taskName).join(', ')}
                </p>
              ) : null}
              <SubsLog game={g} timeZone={timeZone} />
              {g.lockedAt ? (
                <p className="fine">
                  {vocab.term.lockedAt} {formatTime(g.lockedAt, timeZone)}
                </p>
              ) : null}
              {g.rally ? (
                <p className={`notice notice--${g.rally.hit ? 'win' : 'loss'}`}>
                  {vocab.term.comebackToken}: rolled {g.rally.roll}, needed {g.rally.oddsPct} or under ·{' '}
                  {g.rally.hit ? vocab.rally.hit : vocab.rally.miss}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
