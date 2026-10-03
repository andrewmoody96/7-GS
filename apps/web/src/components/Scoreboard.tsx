import type { GameDto, OpponentDto } from '@7gs/contracts';
import { scoreline, type GameEvaluation } from '@7gs/rules';
import { formatDate, weekdayShort } from '../lib/format';
import { vocab } from '../vocab';
import { OpponentBadge, TeamBadge } from './Badges';
import { Tile } from './Tile';

export type BoardStatus = 'pregame' | 'live' | 'final';

interface ScoreboardProps {
  game: GameDto;
  opponent: OpponentDto | null;
  teamName: string;
  status: BoardStatus;
  ev: GameEvaluation;
  /** "Doubleheader · Game 2" style note for makeup games. */
  note?: string;
}

/** Ballpark scoreboard. The opponent sits one run below your runs to win; finals never tie. */
export function Scoreboard({ game, opponent, teamName, status, ev, note }: ScoreboardProps) {
  const final = game.status === 'final';
  const line = scoreline({ result: final ? game.result : null, resultDetail: game.resultDetail, runs: final ? game.runs : ev.runs, threshold: game.threshold });
  const runs = line.us;
  const hits = final ? game.tasksDone : ev.tasksDone;
  const oppName = opponent?.name ?? vocab.term.opponent;
  const result = final ? game.result : null;
  const lights = Array.from({ length: ev.requiredTotal }, (_, i) => i < ev.requiredTotal - ev.missedRequired);
  const statusText = status === 'final' ? vocab.gameStatus.final : status === 'live' ? vocab.gameStatus.live : vocab.gameStatus.scheduled;

  return (
    <section
      className={`board board--${status}${result ? ` board--${result === 'W' ? 'win' : 'loss'}` : ''}`}
      aria-label={`${vocab.gameLabel(game.gameNumber)} scoreboard`}
    >
      <header className="board__head">
        <p className="board__title">
          <span>{vocab.gameLabel(game.gameNumber)}</span>
          <span aria-hidden="true"> · </span>
          <span title={formatDate(game.playedDate)}>{weekdayShort(game.playedDate)}</span>
          <span className="board__starter">{game.starterName}</span>
        </p>
        <p className={`board__status board__status--${status}`}>
          {status === 'live' ? <span className="board__bulb" aria-hidden="true" /> : null}
          {statusText}
        </p>
      </header>

      <table className="board__grid">
        <caption className="sr-only">
          {oppName} {line.them}, {teamName} {runs}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Team</span>
            </th>
            <th scope="col" abbr={vocab.term.points}>
              {vocab.terms.runsShort}
            </th>
            <th scope="col" abbr={vocab.terms.tasksDone}>
              {vocab.terms.hitsShort}
            </th>
            {result ? (
              <th scope="col">
                <span className="sr-only">Result</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          <tr className="board__row board__row--opp">
            <th scope="row">
              {opponent ? <OpponentBadge opponent={opponent} size={34} /> : null}
              <span className="board__team">{oppName}</span>
            </th>
            <td>
              <Tile value={line.them} />
            </td>
            <td>
              <Tile value={game.minTasks ?? '–'} label={game.minTasks === null ? 'No minimum' : undefined} />
            </td>
            {result ? <td /> : null}
          </tr>
          <tr className="board__row board__row--you">
            <th scope="row">
              <TeamBadge name={teamName} size={34} />
              <span className="board__team">{teamName}</span>
            </th>
            <td>
              <Tile value={runs} />
            </td>
            <td>
              <Tile value={hits} />
            </td>
            {result ? (
              <td>
                <span className={`board__result board__result--${result === 'W' ? 'win' : 'loss'}`}>{result}</span>
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>

      <footer className="board__foot">
        {ev.requiredTotal > 0 ? (
          <p className="board__lights">
            <span>{vocab.term.required}s</span>
            <span className="board__bulbs" role="img" aria-label={`${ev.requiredTotal - ev.missedRequired} of ${ev.requiredTotal} done`}>
              {lights.map((lit, i) => (
                <span key={i} className={`bulb${lit ? ' is-lit' : ''}`} />
              ))}
            </span>
          </p>
        ) : (
          <p className="board__lights">
            <span>No {vocab.term.required.toLowerCase()}s</span>
          </p>
        )}
        {note ? <p className="board__note">{note}</p> : null}
      </footer>
    </section>
  );
}
