import type { IlHoldDto } from '@7gs/contracts';
import { vocab } from '../vocab';
import { IconBandage } from './icons';

/** Spots a game is holding for tasks on the Injured List (GAME_DESIGN §7). */
export function IlHolds({ holds }: { holds: readonly IlHoldDto[] }) {
  if (holds.length === 0) return null;
  return (
    <section className="ilholds" aria-label={vocab.il.heldTitle}>
      <p className="ilholds__title">
        <IconBandage width={16} height={16} aria-hidden="true" /> {vocab.il.heldTitle}
      </p>
      <ul className="ilholds__list">
        {holds.map((h) => (
          <li key={h.taskId} className="ilholds__item">
            <span className="ilholds__name">{h.taskName}</span>
            <span className="ilholds__meta">
              <span className="pill pill--runs">{vocab.runs(h.points)}</span>
              {h.required ? <span className="pill pill--must">{vocab.term.required}</span> : null}
              <span className="ilholds__spot">{vocab.il.heldSpot(h.role, h.position)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="ilholds__note">{vocab.il.heldNote}</p>
    </section>
  );
}
