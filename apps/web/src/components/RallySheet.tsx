import type { GameSummaryDto, RallyOddsBreakdownDto, RallyRollDto } from '@7gs/contracts';
import { percentileDice, RALLY } from '@7gs/rules';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../app/errors';
import { useGameQuery, useRallyQuoteQuery, useRollRally } from '../app/queries';
import { formatDayTime, score, signed, weekdayShort } from '../lib/format';
import { prefersReducedMotion } from '../lib/motion';
import { vocab } from '../vocab';
import { IconDice } from './icons';
import { Jumbotron } from './Jumbotron';
import { Sheet } from './Sheet';

interface RallySheetProps {
  game: GameSummaryDto;
  open: boolean;
  onClose: () => void;
  timeZone: string;
}

const ROLL_MS = 1600;

function Die({ value, label, rolling }: { value: string; label: string; rolling: boolean }) {
  return (
    <div className={`die${rolling ? ' is-rolling' : ''}`}>
      <span className="die__face" aria-hidden="true">
        {value}
      </span>
      <span className="die__label">{label}</span>
    </div>
  );
}

/** Two d10s: tens (00–90) and ones (0–9). */
function Dice({ roll, rolling }: { roll: number | null; rolling: boolean }) {
  const [spin, setSpin] = useState({ tens: 0, ones: 0 });
  useEffect(() => {
    if (!rolling) return;
    const timer = window.setInterval(() => {
      setSpin({ tens: Math.floor(Math.random() * 10) * 10, ones: Math.floor(Math.random() * 10) });
    }, 70);
    return () => window.clearInterval(timer);
  }, [rolling]);
  const faces = rolling ? spin : roll !== null ? percentileDice(roll) : null;
  const tens = faces ? String(faces.tens).padStart(2, '0') : '–';
  const ones = faces ? String(faces.ones) : '–';
  return (
    <div className="dice" aria-live="polite">
      <Die value={tens} label="Tens" rolling={rolling} />
      <Die value={ones} label="Ones" rolling={rolling} />
      {!rolling && roll !== null ? <p className="sr-only">Rolled {roll}</p> : null}
    </div>
  );
}

function OddsTable({ odds, streak }: { odds: RallyOddsBreakdownDto; streak: number }) {
  const rows: [string, number][] = [
    [vocab.rally.closeness(Math.round(odds.closenessRatio * 100)), odds.closeness],
    [vocab.rally.missedMustHit, odds.missedMustHit],
    [vocab.rally.warningTrack, odds.warningTrack],
    [vocab.rally.runCushion, odds.runCushion],
  ];
  return (
    <table className="odds">
      <caption className="sr-only">How your odds are figured</caption>
      <tbody>
        <tr>
          <th scope="row">{vocab.rally.base(streak)}</th>
          <td>{odds.base}%</td>
        </tr>
        {rows.map(([label, value]) => (
          <tr key={label} className={value === 0 ? 'is-zero' : value > 0 ? 'is-plus' : 'is-minus'}>
            <th scope="row">{label}</th>
            <td>{signed(value)}</td>
          </tr>
        ))}
        {odds.limit ? (
          <tr className="odds__limit">
            <th scope="row">
              {odds.limit === 'floor' ? vocab.rally.floor : vocab.rally.cap} ({odds.raw}% →{' '}
              {odds.limit === 'floor' ? RALLY.floorPct : RALLY.capPct}%)
            </th>
            <td>{odds.pct}%</td>
          </tr>
        ) : null}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Your odds</th>
          <td>{odds.pct}%</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function RallySheet({ game, open, onClose, timeZone }: RallySheetProps) {
  const quote = useRallyQuoteQuery(open ? game.id : null);
  const detail = useGameQuery(open ? game.id : null);
  const roll = useRollRally();
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<RallyRollDto | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!open) {
      setRolling(false);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const previous = detail.data?.rally ?? null;
  const shown = result ?? previous;

  const doRoll = () => {
    setError(null);
    setRolling(true);
    started.current = Date.now();
    roll.mutate(game.id, {
      onSuccess: ({ roll: rolled }) => {
        const wait = prefersReducedMotion() ? 0 : Math.max(0, ROLL_MS - (Date.now() - started.current));
        window.setTimeout(() => {
          setResult(rolled);
          setRolling(false);
          if (rolled.hit) setCelebrate(true);
        }, wait);
      },
      onError: (e) => {
        setRolling(false);
        setError(errorMessage(e));
      },
    });
  };

  const q = quote.data;
  const kicker = `${vocab.gameLabel(game.gameNumber)} · ${weekdayShort(game.playedDate)} · ${vocab.terms.loss} ${score(game.runs, game.threshold)}`;

  return (
    <>
      <Sheet open={open} onClose={onClose} kicker={kicker} title={vocab.rally.title} tone="board">
        {quote.isPending || detail.isPending ? <p className="loading-line">Checking the odds…</p> : null}

        {shown ? (
          <div className={`rally-result rally-result--${shown.hit ? 'hit' : 'miss'}`}>
            <Dice roll={shown.roll} rolling={false} />
            <p className="rally-result__call">{shown.hit ? vocab.rally.hit : vocab.rally.miss}</p>
            <p className="rally-result__detail">
              Rolled {shown.roll}, needed {shown.oddsPct} or under. {shown.hit ? vocab.rally.hitDetail : vocab.rally.missDetail}
            </p>
          </div>
        ) : rolling ? (
          <div className="rally-result">
            <Dice roll={null} rolling />
            <p className="rally-result__call">Rolling…</p>
          </div>
        ) : q && !q.eligible ? (
          <p className="notice">{q.reason ? vocab.rallyReason[q.reason] : vocab.error.NOT_ELIGIBLE}</p>
        ) : q?.odds ? (
          <>
            <p className="rally-need">{vocab.rally.needOrUnder(q.odds.pct)}</p>
            <OddsTable odds={q.odds} streak={q.seasonWinStreak} />
            <ul className="rally-notes">
              <li>{vocab.rally.tokenNote(q.tokensAvailable)}</li>
              {q.deadline ? <li>Window closes {formatDayTime(q.deadline, timeZone)}.</li> : null}
              <li>The roll happens on the server. A hit is a {vocab.rally.hit}; a miss keeps the L.</li>
            </ul>
            {error ? <p className="notice notice--error">{error}</p> : null}
            <button type="button" className="btn btn--gold btn--block" onClick={doRoll} disabled={roll.isPending}>
              <IconDice /> {vocab.rally.roll}
            </button>
          </>
        ) : null}
      </Sheet>
      <Jumbotron
        open={celebrate}
        headline={vocab.jumbotron.walkOff}
        detail={`${vocab.gameLabel(game.gameNumber)} · ${vocab.resultDetail.rally}`}
        onClose={() => setCelebrate(false)}
      />
    </>
  );
}
