// Team → Standings: a season's two conferences of three divisions (dealt again every
// season). Your place up top, one button per table: division (the default), conference or
// league. One table at a time, with the others folded away underneath. No playoffs: the best
// record when the season ends takes each title (GAME_DESIGN §8).

import type { StandingsDto, StandingsRowDto } from '@7gs/contracts';
import { OPPONENT_TOWNS, opponentAbbreviation } from '@7gs/rules';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentSeasonQuery, useStandingsQuery } from '../app/queries';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatWinPct } from '../lib/format';
import { vocab } from '../vocab';

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function TeamMark({ row }: { row: StandingsRowDto }) {
  if (!row.colors) return <span className="standings__mark standings__mark--you" aria-hidden="true">★</span>;
  return (
    <span className="standings__mark" aria-hidden="true" style={{ background: row.colors[0], color: row.colors[1] }}>
      {opponentAbbreviation(row.name)}
    </span>
  );
}

/**
 * A team as standings show it: the town small above, the nickname bold below ("Walla Walla /
 * Wafflers"). Your own team splits at its first space; a one-word name is just the bold line.
 */
function TeamName({ row }: { row: StandingsRowDto }) {
  const town = row.you ? null : (OPPONENT_TOWNS.find((t) => row.name.startsWith(`${t} `)) ?? null);
  const cut = town ? town.length : row.name.indexOf(' ');
  const [top, bottom] = cut > 0 ? [row.name.slice(0, cut), row.name.slice(cut + 1)] : [null, row.name];
  return (
    <span className="standings__name">
      {top ? <span className="standings__town">{top}</span> : null}
      <span className="standings__nick">{bottom}</span>
    </span>
  );
}

function Table({ title, rows, note }: { title: string; rows: StandingsRowDto[]; note?: string }) {
  return (
    <section className="card standings" aria-label={title}>
      <header className="standings__head">
        <h3 className="standings__title">{title}</h3>
        {note ? <span className="standings__note">{note}</span> : null}
      </header>
      <table className="standings__table">
        <colgroup>
          <col />
          <col className="standings__num" />
          <col className="standings__num" />
          <col className="standings__pct" />
          <col className="standings__num" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="standings__team">
              Team
            </th>
            <th scope="col">{vocab.terms.win}</th>
            <th scope="col">{vocab.terms.loss}</th>
            <th scope="col">Pct</th>
            <th scope="col">GB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.you ? 'is-you' : undefined}>
              <th scope="row" className="standings__team">
                <span className="standings__teamcell">
                  <TeamMark row={r} />
                  <TeamName row={r} />
                </span>
              </th>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{formatWinPct(r.wins + r.losses === 0 ? null : r.winPct)}</td>
              {/* Games back to one decimal, as standings print it: 2.0, 11.5. */}
              <td>{r.gamesBack === 0 ? '–' : r.gamesBack.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type View = 'division' | 'conference' | 'league';
const VIEWS: { view: View; label: string }[] = [
  { view: 'division', label: 'Division' },
  { view: 'conference', label: 'Conference' },
  { view: 'league', label: 'League' },
];

function viewOf(param: string | null): View {
  return param === 'conference' || param === 'league' ? param : 'division';
}

/** Where you stand, one button per table: tap your place to see that table (or your titles once the season is over). */
function Placement({ s, view, onView }: { s: StandingsDto; view: View; onView: (v: View) => void }) {
  const mine = s.conferences.find((c) => c.yours)!;
  const division = mine.divisions.find((d) => d.yours)!;
  const place = (rows: StandingsRowDto[]) => rows.findIndex((r) => r.you) + 1;
  const started = mine.rows.some((r) => r.wins + r.losses > 0);
  const values: Record<View, { value: string; champion: boolean }> = {
    division: { value: started ? ordinal(place(division.rows)) : '–', champion: s.titles?.division ?? false },
    conference: { value: started ? ordinal(place(mine.rows)) : '–', champion: s.titles?.conference ?? false },
    league: { value: started ? ordinal(place(s.league)) : '–', champion: s.titles?.league ?? false },
  };
  return (
    <div className="placement" role="group" aria-label="Your place">
      {VIEWS.map(({ view: v, label }) => {
        const c = values[v];
        const shown = c.champion ? '🏆 1st' : c.value;
        return (
          <button
            key={v}
            type="button"
            className={`placement__chip${c.champion ? ' is-champion' : ''}`}
            aria-pressed={view === v}
            aria-label={`${label}: ${c.champion ? `${label.toLowerCase()} champions` : shown}`}
            onClick={() => onView(v)}
          >
            <span className="placement__label">{label}</span>
            <span className="placement__value">{shown}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The same three choices at the bottom, so a long table never needs a scroll back up. */
function ViewSwitch({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div className="segmented segmented--small standings__switch" role="group" aria-label="Show standings for">
      {VIEWS.map(({ view: v, label }) => (
        <button key={v} type="button" className="segmented__item" aria-pressed={view === v} onClick={() => onView(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** One table at a time: yours open, the rest folded away underneath. */
function StandingsView({ s, view }: { s: StandingsDto; view: View }) {
  const ordered = [...s.conferences].sort((a, b) => Number(b.yours) - Number(a.yours));
  const mine = ordered[0]!;
  if (view === 'league') {
    return <Table title="League" note="Best record takes the title" rows={s.league} />;
  }
  if (view === 'conference') {
    return <Table title={mine.name} rows={mine.rows} />;
  }
  const division = mine.divisions.find((d) => d.yours)!;
  return <Table title={`${mine.abbreviation} ${division.name}`} note="Your division" rows={division.rows} />;
}

/** The tables you didn't pick for this view: every other division, or the other conference. */
function Others({ s, view }: { s: StandingsDto; view: View }) {
  const ordered = [...s.conferences].sort((a, b) => Number(b.yours) - Number(a.yours));
  if (view === 'league') return null;
  if (view === 'conference') {
    const other = ordered.find((c) => !c.yours);
    if (!other) return null;
    return (
      <details className="conference__race">
        <summary>{other.name}: all {other.rows.length} teams</summary>
        <Table title={other.name} rows={other.rows} />
      </details>
    );
  }
  const others = ordered.flatMap((c) => c.divisions.filter((d) => !d.yours).map((d) => ({ c, d })));
  return (
    <details className="conference__race">
      <summary>Other divisions</summary>
      <div className="standings__others">
        {others.map(({ c, d }) => (
          <Table key={`${c.name}-${d.name}`} title={`${c.abbreviation} ${d.name}`} rows={d.rows} />
        ))}
      </div>
    </details>
  );
}

export function StandingsScreen() {
  const [params, setParams] = useSearchParams();
  const view = viewOf(params.get('view'));
  const showView = (v: View) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'division') next.delete('view');
        else next.set('view', v);
        return next;
      },
      { replace: true },
    );
  const current = useCurrentSeasonQuery();
  const seasonId = params.get('season') ?? current.data?.id ?? null;
  const standings = useStandingsQuery(seasonId);

  const body = (() => {
    if (!params.get('season') && current.isPending) return <Loading label="Loading the standings" />;
    if (seasonId === null) {
      return (
        <EmptyState title="No standings yet">
          <p>Standings start with your first {vocab.term.season.toLowerCase()}.</p>
        </EmptyState>
      );
    }
    if (standings.isPending) return <Loading label="Loading the standings" />;
    if (standings.isError) return <ErrorPanel error={standings.error} onRetry={() => void standings.refetch()} />;
    const s = standings.data;
    return (
      <>
        <Placement s={s} view={view} onView={showView} />
        <StandingsView s={s} view={view} />
        <Others s={s} view={view} />
        <ViewSwitch view={view} onView={showView} />
        <p className="fine">
          Your league is split into two conferences of three divisions, dealt again every {vocab.term.season.toLowerCase()}. The best
          record when it ends takes each title: division, conference and league. Ties go to the better record in the division, then in the conference, then run
          differential.
        </p>
      </>
    );
  })();

  return (
    <div className="screen screen--team">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            <Link to="/team">{vocab.tabs.team}</Link> /
          </p>
          <h1 className="screen__title">Standings{standings.data ? ` · ${vocab.term.season} ${standings.data.seasonNumber}` : ''}</h1>
        </div>
      </header>
      {body}
    </div>
  );
}
