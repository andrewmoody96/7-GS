import type { GameDto, TaskDto } from '@7gs/contracts';
import { useEffect, useState } from 'react';
import { useAddPinchHitter, useTasksQuery } from '../app/queries';
import { useNotify } from '../app/toast';
import { weekdayLong } from '../lib/format';
import { benchOf, pinchHitMath } from '../lib/game';
import { vocab } from '../vocab';
import { IconArrowRight } from './icons';
import { Sheet } from './Sheet';

interface Candidate {
  taskId: string;
  name: string;
  points: number;
  onBench: boolean;
  oneOff: boolean;
}

/** Bench tasks first (a promotion), then active roster tasks that aren't in this game yet. */
export function pinchHitCandidates(game: GameDto, tasks: readonly TaskDto[]): Candidate[] {
  const kinds = new Map(tasks.map((t) => [t.id, t]));
  const bench = benchOf(game).map((e) => ({
    taskId: e.taskId,
    name: e.taskName,
    points: kinds.get(e.taskId)?.points ?? e.points,
    onBench: true,
    oneOff: kinds.get(e.taskId)?.kind === 'one_off',
  }));
  const inGame = new Set(game.entries.map((e) => e.taskId));
  const roster = tasks
    .filter((t) => t.status === 'active' && !inGame.has(t.id))
    .map((t) => ({ taskId: t.id, name: t.name, points: t.points, onBench: false, oneOff: t.kind === 'one_off' }));
  return [...bench, ...roster];
}

/** "Runs to win 4 → 6": the raise, shown before confirming. */
export function PinchHitMath({ threshold, points }: { threshold: number; points: number }) {
  const math = pinchHitMath(threshold, points);
  return (
    <div className="phmath" aria-live="polite">
      <p className="phmath__row">
        <span className="phmath__label">{vocab.terms.threshold}</span>
        <span className="phmath__nums">
          <span className="phmath__from">{math.before}</span>
          <IconArrowRight width={16} height={16} aria-hidden="true" />
          <strong className="phmath__to">{math.after}</strong>
        </span>
        <span className="sr-only">
          {vocab.terms.threshold} {math.before} → {math.after}
        </span>
      </p>
      <p className="phmath__row phmath__row--opp">
        <span className="phmath__label">{vocab.term.opponent}</span>
        <span className="phmath__nums">
          <span className="phmath__from">{math.opponentBefore}</span>
          <IconArrowRight width={16} height={16} aria-hidden="true" />
          <strong className="phmath__to">{math.opponentAfter}</strong>
        </span>
      </p>
      <p className="phmath__note">{vocab.pinchHit.raise(points)}</p>
    </div>
  );
}

interface PinchHitSheetProps {
  game: GameDto;
  open: boolean;
  onClose: () => void;
  /** Preselect a task, e.g. a bench task being made a must-hit. */
  initialTaskId?: string | null;
}

/** Pick a pinch hitter (any active roster task, or promote a bench task) and see the raise first. */
export function PinchHitSheet({ game, open, onClose, initialTaskId = null }: PinchHitSheetProps) {
  const tasks = useTasksQuery();
  const add = useAddPinchHitter();
  const notify = useNotify();
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);

  useEffect(() => {
    if (open) setTaskId(initialTaskId);
  }, [open, initialTaskId]);

  const candidates = pinchHitCandidates(game, tasks.data ?? []);
  const selected = candidates.find((c) => c.taskId === taskId) ?? null;
  const bench = candidates.filter((c) => c.onBench);
  const roster = candidates.filter((c) => !c.onBench);
  const promoting = initialTaskId !== null && selected?.onBench === true && selected.taskId === initialTaskId;

  const group = (title: string, list: Candidate[]) =>
    list.length === 0 ? null : (
      <fieldset className="radios">
        <legend className="field__label">{title}</legend>
        {list.map((c) => (
          <label key={c.taskId} className="radio">
            <input
              type="radio"
              name={`ph-${game.id}`}
              value={c.taskId}
              checked={taskId === c.taskId}
              onChange={() => setTaskId(c.taskId)}
            />
            <span className="radio__label">
              {c.name}
              <span className="pill pill--runs">{vocab.runs(c.points)}</span>
              {c.oneOff ? <span className="pill pill--oneoff">{vocab.taskKind.one_off}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker={`${vocab.gameLabel(game.gameNumber)} · ${weekdayLong(game.playedDate)} · ${game.starterName}`}
      title={promoting && selected ? `${vocab.pinchHit.makeMustHit}: ${selected.name}` : vocab.pinchHit.title}
      footer={
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!selected || add.isPending}
            onClick={() => {
              if (!selected) return;
              add.mutate(
                { gameId: game.id, taskId: selected.taskId },
                {
                  onSuccess: (updated) => {
                    notify(vocab.pinchHit.done(selected.name, updated.threshold), 'success');
                    onClose();
                  },
                },
              );
            }}
          >
            {promoting ? vocab.pinchHit.makeMustHit : vocab.pinchHit.confirm}
          </button>
        </div>
      }
    >
      <p className="lede">{vocab.pinchHit.explainer}</p>
      {selected ? (
        <PinchHitMath threshold={game.threshold} points={selected.points} />
      ) : (
        <p className="phmath phmath--empty">
          {vocab.terms.threshold} {game.threshold} · pick a {vocab.terms.task.toLowerCase()} to see the raise
        </p>
      )}
      {tasks.isPending ? <p className="loading-line">Loading the roster…</p> : null}
      {!tasks.isPending && candidates.length === 0 ? <p className="empty-line">{vocab.pinchHit.none}</p> : null}
      {promoting ? null : (
        <>
          {group(vocab.pinchHit.fromBench, bench)}
          {group(vocab.pinchHit.fromRoster, roster)}
        </>
      )}
    </Sheet>
  );
}
