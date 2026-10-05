import type { GameDto, LineupEntryDto } from '@7gs/contracts';
import { lineupOf } from '../lib/game';
import { vocab } from '../vocab';
import { EntryPills } from './EntryPills';
import { IconCheck, IconX } from './icons';

interface LineupProps {
  game: GameDto;
  final: boolean;
  onToggle: (entry: LineupEntryDto, done: boolean) => void;
  onPartial: (entry: LineupEntryDto, partial: boolean) => void;
  /** Roster tasks that are one-offs, for the badge. */
  oneOffIds?: ReadonlySet<string>;
}

/** The batting order with one-tap check-offs. */
export function Lineup({ game, final, onToggle, onPartial, oneOffIds }: LineupProps) {
  const lineup = lineupOf(game);
  if (lineup.length === 0) {
    return <p className="empty-line">The lineup is empty. Add tasks before first pitch.</p>;
  }
  return (
    <ol className="lineup" aria-label={vocab.terms.lineup}>
      {lineup.map((entry) => {
        const done = entry.completedAt !== null;
        const missed = final && !done;
        return (
          <li
            key={entry.id}
            className={`atbat${done ? ' is-done' : ''}${missed ? ' is-missed' : ''}${entry.required ? ' is-required' : ''}`}
          >
            <span className="atbat__order" aria-hidden="true">
              {entry.position}
            </span>
            <div className="atbat__body">
              <p className="atbat__name">{entry.taskName}</p>
              <p className="atbat__meta">
                <span className="pill pill--runs">{vocab.runs(entry.points)}</span>
                <EntryPills entry={entry} oneOff={oneOffIds?.has(entry.taskId)} />
                {entry.subbedInAt ? <span className="pill pill--sub">{vocab.terms.substitution}</span> : null}
                {entry.partial && !done ? <span className="pill pill--partial">{vocab.terms.partial}</span> : null}
              </p>
              {entry.required && !done && !final ? (
                <button
                  type="button"
                  className={`chip chip--track${entry.partial ? ' is-on' : ''}`}
                  aria-pressed={entry.partial}
                  onClick={() => onPartial(entry, !entry.partial)}
                >
                  <span className="chip__box" aria-hidden="true">
                    {entry.partial ? <IconCheck width={14} height={14} /> : null}
                  </span>
                  {vocab.terms.partial}: partly done
                </button>
              ) : null}
            </div>
            {final ? (
              <span className={`check check--static${done ? ' is-done' : ''}${missed && entry.required ? ' is-missed' : ''}`}>
                {done ? (
                  <IconCheck title="Done" />
                ) : entry.required ? (
                  <IconX title="Missed" />
                ) : (
                  <span className="sr-only">Not done</span>
                )}
              </span>
            ) : (
              <button
                type="button"
                className={`check${done ? ' is-done' : ''}`}
                aria-pressed={done}
                aria-label={done ? `Undo ${entry.taskName}` : `Check off ${entry.taskName}`}
                onClick={() => onToggle(entry, !done)}
              >
                <IconCheck />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
