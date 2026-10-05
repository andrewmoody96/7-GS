import type { GameSummaryDto, SeriesDto } from '@7gs/contracts';
import { addDays, compareDates, type LocalDate } from '@7gs/rules';
import { formatDate, gameScore, weekdayShort } from '../lib/format';
import { gamesOn } from '../lib/game';
import { vocab } from '../vocab';
import { IconArrowRight } from './icons';

export type StripState = 'win' | 'loss' | 'nd' | 'live' | 'today' | 'pending' | 'upcoming' | 'ppd' | 'susp';

/** The visual state of one game in the strip, as of `today`. */
export function stripState(game: GameSummaryDto, today: LocalDate): StripState {
  if (game.status === 'final') return game.result === 'W' ? 'win' : game.result === 'L' ? 'loss' : 'nd';
  const cmp = compareDates(game.playedDate, today);
  if (cmp === 0) return game.status === 'live' ? 'live' : 'today';
  if (cmp < 0) return 'pending';
  return 'upcoming';
}

/**
 * Description of a game's state: "W 3–4 · Rally" (short, for display) or
 * "W 3–4 (Rally W)" (long, for screen readers).
 */
export function stripText(game: GameSummaryDto, state: StripState, form: 'short' | 'long' = 'long'): string {
  switch (state) {
    case 'win':
    case 'loss': {
      const result = `${state === 'win' ? vocab.terms.win : vocab.terms.loss} ${gameScore(game)}`;
      if (!game.resultDetail || game.resultDetail === 'clean') return result;
      return form === 'short'
        ? `${result} · ${vocab.resultDetailShort[game.resultDetail]}`
        : `${result} (${vocab.resultDetail[game.resultDetail]})`;
    }
    case 'nd':
      return form === 'short' ? vocab.terms.noDecisionShort : `${vocab.terms.noDecision} (${vocab.terms.suspended.toLowerCase()})`;
    case 'susp':
      return form === 'short'
        ? vocab.suspension.movedTo(weekdayShort(game.playedDate))
        : `${vocab.terms.suspended}, resumed ${weekdayShort(game.playedDate)}`;
    case 'live':
      return vocab.gameStatus.live;
    case 'today':
      return 'Today';
    case 'pending':
      return 'Going final';
    case 'ppd':
      return `${vocab.terms.postponedShort}, made up ${weekdayShort(game.playedDate)}`;
    case 'upcoming':
      return 'Upcoming';
  }
}

interface CellProps {
  game: GameSummaryDto;
  state: StripState;
  onSelect?: (game: GameSummaryDto) => void;
}

function Cell({ game, state, onSelect }: CellProps) {
  const moved = state === 'ppd' || state === 'susp';
  const label = `${vocab.gameLabel(game.gameNumber)}, ${formatDate(moved ? game.scheduledDate : game.playedDate)}: ${stripText(game, state)}${
    game.suspended && !moved ? ` (${vocab.suspension.resumedFrom(weekdayShort(game.scheduledDate))})` : ''
  }`;
  const body = (
    <>
      {state === 'win' || state === 'loss' ? (
        <>
          <span className="cell__big">{state === 'win' ? vocab.terms.win : vocab.terms.loss}</span>
          <span className="cell__small">{gameScore(game)}</span>
          {game.resultDetail === 'rally' ? <span className="cell__flag" title={vocab.resultDetail.rally} /> : null}
        </>
      ) : state === 'live' || state === 'today' ? (
        <>
          <span className="cell__live">
            {state === 'live' ? <span className="cell__dot" aria-hidden="true" /> : null}
            {state === 'live' ? vocab.gameStatus.live : 'Today'}
          </span>
          <span className="cell__small">G{game.gameNumber}</span>
        </>
      ) : state === 'nd' ? (
        <>
          <span className="cell__big">{vocab.terms.noDecisionShort}</span>
          <span className="cell__small">Susp</span>
        </>
      ) : state === 'ppd' || state === 'susp' ? (
        <>
          <span className="cell__ppd">{state === 'ppd' ? vocab.terms.postponedShort : 'SUSP'}</span>
          <span className="cell__small cell__arrow">
            <IconArrowRight width={10} height={10} />
            {weekdayShort(game.playedDate)}
          </span>
        </>
      ) : (
        <>
          <span className="cell__big cell__big--dim">G{game.gameNumber}</span>
          <span className="cell__small">{state === 'pending' ? 'Final soon' : `${game.threshold} ${vocab.terms.runsShort}`}</span>
        </>
      )}
    </>
  );
  const className = `cell cell--${state === 'susp' ? 'ppd cell--susp' : state}${(game.postponed || game.suspended) && !moved ? ' cell--makeup' : ''}`;
  return onSelect ? (
    <button type="button" className={className} aria-label={label} onClick={() => onSelect(game)}>
      {body}
    </button>
  ) : (
    <span className={className} role="img" aria-label={label}>
      {body}
    </span>
  );
}

interface SeriesStripProps {
  series: SeriesDto;
  today: LocalDate;
  onSelect?: (game: GameSummaryDto) => void;
}

/**
 * Monday–Sunday. Rained-out games show PPD on their day and play as a doubleheader later;
 * suspended games show SUSP and resume later; a no-decision shows ND.
 */
export function SeriesStrip({ series, today, onSelect }: SeriesStripProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(series.startDate, i));
  return (
    <ol className="strip" aria-label={`${vocab.term.series} schedule`}>
      {days.map((date) => {
        const played = gamesOn(series, date);
        const postponed = series.games.filter((g) => (g.postponed || g.suspended) && g.scheduledDate === date && g.playedDate !== date);
        const isToday = date === today;
        return (
          <li key={date} className={`strip__day${isToday ? ' is-today' : ''}`} aria-current={isToday ? 'date' : undefined}>
            <span className="strip__dow">{weekdayShort(date)}</span>
            <span className="strip__date">{Number(date.slice(8))}</span>
            <div className="strip__games">
              {postponed.map((g) => (
                <Cell key={`ppd-${g.id}`} game={g} state={g.postponed ? 'ppd' : 'susp'} onSelect={onSelect} />
              ))}
              {played.map((g) => (
                <Cell key={g.id} game={g} state={stripState(g, today)} onSelect={onSelect} />
              ))}
            </div>
            {played.length > 1 ? (
              <span className="strip__dh" title={vocab.term.doubleheader}>
                DH
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
