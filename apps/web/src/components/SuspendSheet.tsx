import type { GameSummaryDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { useEffect, useState } from 'react';
import { useSuspendGame, useSuspensionQuoteQuery } from '../app/queries';
import { useNotify } from '../app/toast';
import { formatDate, formatDateLong, formatDeadline, weekdayLong } from '../lib/format';
import { vocab } from '../vocab';
import { IconWarning } from './icons';
import { Sheet } from './Sheet';

interface SuspendSheetProps {
  game: GameSummaryDto;
  open: boolean;
  onClose: () => void;
  timeZone: string;
}

/**
 * Emergencies (GAME_DESIGN §7): the game resumes later in the week as a doubleheader,
 * keeping its progress, or ends as a no-decision when no day is left. Uses a Rainout.
 */
export function SuspendSheet({ game, open, onClose, timeZone }: SuspendSheetProps) {
  const quote = useSuspensionQuoteQuery(open ? game.id : null);
  const suspend = useSuspendGame();
  const notify = useNotify();
  const [resume, setResume] = useState<string | null>(null);

  const datesKey = (quote.data?.resumeDates ?? []).join(',');
  useEffect(() => {
    const dates = datesKey ? datesKey.split(',') : [];
    if (open) setResume((current) => (current && dates.includes(current) ? current : (dates[0] ?? null)));
  }, [open, datesKey]);

  const q = quote.data;
  const noDays = q?.ok === true && q.resumeDates.length === 0;
  const submit = () => {
    const resumeDate = noDays ? null : resume;
    if (!noDays && !resumeDate) return;
    suspend.mutate(
      { gameId: game.id, resumeDate },
      {
        onSuccess: () => {
          notify(vocab.suspension.done(resumeDate ? weekdayLong(resumeDate) : null), 'success');
          onClose();
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker={`${vocab.gameLabel(game.gameNumber)} · ${formatDate(game.playedDate)} · ${game.starterName}`}
      title={vocab.suspension.title}
      footer={
        q?.ok ? (
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Keep playing
            </button>
            <button
              type="button"
              className={`btn ${noDays ? 'btn--danger' : 'btn--primary'}`}
              disabled={suspend.isPending || (!noDays && !resume)}
              onClick={submit}
            >
              {noDays ? vocab.suspension.endNoDecision : vocab.suspension.resume}
            </button>
          </div>
        ) : undefined
      }
    >
      <aside className="explainer explainer--warn">
        <IconWarning />
        <div>
          <p className="explainer__title">For emergencies</p>
          <p>{vocab.suspension.explainer}</p>
        </div>
      </aside>
      {quote.isPending ? <p className="loading-line">Checking with the umpires…</p> : null}
      {q && !q.ok ? <p className="notice">{q.reason ? vocab.suspension.reason[q.reason] : vocab.error.NOT_ELIGIBLE}</p> : null}
      {q?.ok && noDays ? <p className="notice notice--loss">{vocab.suspension.noDays}</p> : null}
      {q?.ok && !noDays ? (
        <>
          <p className="lede">{vocab.suspension.resumeLede}</p>
          <fieldset className="radios">
            <legend className="field__label">{vocab.suspension.resumeLegend}</legend>
            {q.resumeDates.map((date) => (
              <label key={date} className="radio">
                <input
                  type="radio"
                  name={`resume-${game.id}`}
                  value={date}
                  checked={resume === date}
                  onChange={() => setResume(date)}
                />
                <span className="radio__label">
                  {formatDateLong(date)}
                  {date === game.playedDate || date === addDays(game.playedDate, 1) ? (
                    <span className="pill pill--soft">{date === game.playedDate ? 'Later today' : 'Next day'}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        </>
      ) : null}
      {q?.ok ? (
        <p className="fine">
          {vocab.suspension.cost(q.allowancesAvailable)}
          {q.deadline ? ` ${vocab.suspension.deadline(formatDeadline(q.deadline, timeZone, true))}` : ''}
        </p>
      ) : null}
    </Sheet>
  );
}
