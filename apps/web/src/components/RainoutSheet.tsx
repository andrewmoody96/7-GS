import type { GameSummaryDto } from '@7gs/contracts';
import { useEffect, useState } from 'react';
import { useCallRainout, useRainoutQuoteQuery } from '../app/queries';
import { useNotify } from '../app/toast';
import { formatDate, formatDateLong, weekdayLong } from '../lib/format';
import { vocab } from '../vocab';
import { IconRain } from './icons';
import { Sheet } from './Sheet';

interface RainoutSheetProps {
  game: GameSummaryDto;
  open: boolean;
  onClose: () => void;
}

/** Postpone a game before first pitch; it's made up as a doubleheader later in the series. */
export function RainoutSheet({ game, open, onClose }: RainoutSheetProps) {
  const quote = useRainoutQuoteQuery(open ? game.id : null);
  const call = useCallRainout();
  const notify = useNotify();
  const [makeup, setMakeup] = useState<string | null>(null);

  // Default to the first available day (the next day), per the design.
  const datesKey = (quote.data?.makeupDates ?? []).join(',');
  useEffect(() => {
    const dates = datesKey ? datesKey.split(',') : [];
    if (open) setMakeup((current) => (current && dates.includes(current) ? current : (dates[0] ?? null)));
  }, [open, datesKey]);

  const q = quote.data;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker={`${vocab.gameLabel(game.gameNumber)} · ${formatDate(game.scheduledDate)} · ${game.starterName}`}
      title={`Call a ${vocab.term.postponed}`}
      footer={
        q?.ok ? (
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Play it
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!makeup || call.isPending}
              onClick={() => {
                if (!makeup) return;
                call.mutate(
                  { gameId: game.id, makeupDate: makeup },
                  {
                    onSuccess: () => {
                      notify(`${vocab.term.postponed} called. ${vocab.gameLabel(game.gameNumber)} moves to ${weekdayLong(makeup)} as a ${vocab.term.doubleheader.toLowerCase()}.`, 'success');
                      onClose();
                    },
                  },
                );
              }}
            >
              <IconRain width={18} height={18} /> Call it
            </button>
          </div>
        ) : undefined
      }
    >
      {quote.isPending ? <p className="loading-line">Checking the forecast…</p> : null}
      {q && !q.ok ? (
        <p className="notice">{q.reason ? vocab.rainoutReason[q.reason] : vocab.error.NOT_ELIGIBLE}</p>
      ) : null}
      {q?.ok ? (
        <>
          <p className="lede">
            Pick a makeup day. That day becomes a {vocab.term.doubleheader.toLowerCase()}: its own game plus this one, each
            decided on its own.
          </p>
          <fieldset className="radios">
            <legend className="field__label">Makeup day</legend>
            {q.makeupDates.map((date, i) => (
              <label key={date} className="radio">
                <input type="radio" name={`makeup-${game.id}`} value={date} checked={makeup === date} onChange={() => setMakeup(date)} />
                <span className="radio__label">
                  {formatDateLong(date)}
                  {i === 0 ? <span className="pill pill--soft">Next day</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="fine">
            Uses 1 of your {q.allowancesAvailable} {vocab.terms.rainouts.toLowerCase()}. Only before first pitch; a makeup game
            can’t be rained out again.
          </p>
        </>
      ) : null}
    </Sheet>
  );
}
