import type { GameDto, LineupEntryDto } from '@7gs/contracts';
import { useId, useState } from 'react';
import { useAddToBench, useSubstitute, useTasksQuery } from '../app/queries';
import { formatTime } from '../lib/format';
import { benchOf, lineupOf, subbedOutOf } from '../lib/game';
import { vocab } from '../vocab';
import { IconSwap } from './icons';
import { Sheet } from './Sheet';

interface BenchProps {
  game: GameDto;
  locked: boolean;
  final: boolean;
}

/** Bench tasks; after first pitch they can sub in for non-must-hit tasks that haven't scored. */
export function Bench({ game, locked, final }: BenchProps) {
  const bench = benchOf(game);
  const [subIn, setSubIn] = useState<LineupEntryDto | null>(null);
  const [outId, setOutId] = useState<string | null>(null);
  const substitute = useSubstitute();
  const outs = lineupOf(game).filter((e) => !e.required && e.completedAt === null);
  const canSub = locked && !final;
  const addToBench = useAddToBench();
  const tasks = useTasksQuery();
  const [addId, setAddId] = useState('');
  const pickerId = useId();
  const inGame = new Set(game.entries.map((e) => e.taskId));
  const addable = (tasks.data ?? []).filter((t) => t.status === 'active' && !inGame.has(t.id));

  if (bench.length === 0 && final) return null;

  const close = () => {
    setSubIn(null);
    setOutId(null);
  };

  return (
    <section className="card bench" aria-labelledby={`bench-${game.id}`}>
      <header className="card__head">
        <h2 id={`bench-${game.id}`} className="card__title">
          {vocab.term.bench}
        </h2>
        <p className="card__sub">
          {canSub
            ? 'Sub in for a task that isn’t a must-hit and hasn’t scored.'
            : final
              ? 'Didn’t play.'
              : 'Subs open at first pitch.'}
        </p>
      </header>
      {bench.length === 0 ? <p className="empty-line">No one on the bench yet.</p> : null}
      <ul className="benchlist">
        {bench.map((entry) => (
          <li key={entry.id} className="benchlist__item">
            <span className="benchlist__name">
              {entry.taskName}
              <span className="pill pill--runs">{vocab.runs(entry.points)}</span>
            </span>
            {canSub ? (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  setSubIn(entry);
                  setOutId(outs[0]?.id ?? null);
                }}
              >
                <IconSwap width={16} height={16} /> {vocab.terms.substitution} in
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!final && addable.length > 0 ? (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            if (addId) addToBench.mutate({ gameId: game.id, taskId: addId }, { onSuccess: () => setAddId('') });
          }}
        >
          <label className="field__label" htmlFor={pickerId}>
            Add to {vocab.term.bench.toLowerCase()} from your {vocab.terms.roster.toLowerCase()}
          </label>
          <div className="addtask__row">
            <select id={pickerId} className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Choose a task…</option>
              {addable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({vocab.runs(t.points)})
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={!addId || addToBench.isPending}>
              Add
            </button>
          </div>
        </form>
      ) : null}

      <Sheet
        open={subIn !== null}
        onClose={close}
        kicker={`${vocab.terms.substitution} · ${vocab.gameLabel(game.gameNumber)}`}
        title={subIn ? `${subIn.taskName} comes in for…` : ''}
        footer={
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!outId || !subIn || substitute.isPending}
              onClick={() => {
                if (!subIn || !outId) return;
                substitute.mutate({ gameId: game.id, outEntryId: outId, inEntryId: subIn.id }, { onSuccess: close });
              }}
            >
              Make the switch
            </button>
          </div>
        }
      >
        {outs.length === 0 ? (
          <p className="empty-line">No eligible spot: must-hits and tasks that already scored stay in.</p>
        ) : (
          <fieldset className="radios">
            <legend className="sr-only">Task to sub out</legend>
            {outs.map((entry) => (
              <label key={entry.id} className="radio">
                <input
                  type="radio"
                  name={`sub-out-${game.id}`}
                  value={entry.id}
                  checked={outId === entry.id}
                  onChange={() => setOutId(entry.id)}
                />
                <span className="radio__label">
                  <span className="radio__order">{entry.position}</span> {entry.taskName}
                  <span className="pill pill--runs">{vocab.runs(entry.points)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="fine">Substitutions are logged in the {vocab.terms.boxScore.toLowerCase()}.</p>
      </Sheet>
    </section>
  );
}

/** "Read 20 pages in for Evening walk · 2:14 PM" lines for the box score. */
export function SubsLog({ game, timeZone }: { game: GameDto; timeZone: string }) {
  const outs = subbedOutOf(game);
  const subs = game.entries.filter((e) => e.subbedInAt !== null);
  if (subs.length === 0) return null;
  return (
    <section className="subslog" aria-label={`${vocab.terms.boxScore} notes`}>
      <h3 className="subslog__title">{vocab.terms.boxScore}</h3>
      <ul>
        {subs.map((entry) => {
          const out = outs.find((o) => o.position === entry.position);
          return (
            <li key={entry.id}>
              <IconSwap width={16} height={16} /> <strong>{entry.taskName}</strong> in
              {out ? <> for {out.taskName}</> : null}
              {entry.subbedInAt ? <> · {formatTime(entry.subbedInAt, timeZone)}</> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
