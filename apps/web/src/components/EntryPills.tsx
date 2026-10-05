import type { LineupEntryDto } from '@7gs/contracts';
import { vocab } from '../vocab';

interface EntryPillsProps {
  entry: Pick<LineupEntryDto, 'required' | 'pinchHitAt' | 'carriedOver' | 'role'>;
  /** The roster task is a one-off (entries don't carry the task's kind). */
  oneOff?: boolean;
}

/** Must-hit, pinch hitter (PH), carried-over and one-off badges for a lineup entry. */
export function EntryPills({ entry, oneOff }: EntryPillsProps) {
  return (
    <>
      {entry.required && entry.role === 'lineup' ? <span className="pill pill--must">{vocab.term.required}</span> : null}
      {entry.pinchHitAt ? (
        <span className="pill pill--ph" title={vocab.terms.pinchHitter}>
          <span aria-hidden="true">{vocab.terms.pinchHitterShort}</span>
          <span className="sr-only">{vocab.terms.pinchHitter}</span>
        </span>
      ) : null}
      {entry.carriedOver ? <span className="pill pill--carried">{vocab.terms.carriedOver}</span> : null}
      {oneOff ? <span className="pill pill--oneoff">{vocab.taskKind.one_off}</span> : null}
    </>
  );
}
