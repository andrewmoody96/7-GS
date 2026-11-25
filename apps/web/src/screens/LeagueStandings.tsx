// Team → Standings: a season's two conferences of three divisions (dealt again every
// season). Your place up top, then your conference (your division first, its other two, and
// the whole conference's title race), then the other conference. No playoffs: the best
// record when the season ends takes each title (GAME_DESIGN §8).

import type { StandingsDto, StandingsRowDto } from '@7gs/contracts';
import { OPPONENT_TOWNS, opponentAbbreviation } from '@7gs/rules';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentSeasonQuery, useStandingsQuery } from '../app/queries';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatWinPct } from '../lib/format';
import { vocab } from '../vocab';

type Conference = StandingsDto['conferences'][number];

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

/** Where you stand: two chips, or your titles once the season is over. */
function Placement({ s }: { s: StandingsDto }) {
  const mine = s.conferences.find((c) => c.yours)!;
  const division = mine.divisions.find((d) => d.yours)!;
  const place = (rows: StandingsRowDto[]) => rows.findIndex((r) => r.you) + 1;
  const started = mine.rows.some((r) => r.wins + r.losses > 0);
  const chips: { label: string; value: string; champion?: boolean }[] = [
    { label: 'Division', value: started ? ordinal(place(division.rows)) : '–', champion: s.titles?.division },
    { label: 'Conference', value: started ? ordinal(place(mine.rows)) : '–', champion: s.titles?.conference },
    { label: 'League', value: started ? ordinal(place(s.league)) : '–', champion: s.titles?.league },
  ];
  return (
    <div className="placement" aria-label="Your place">
      {chips.map((c) => (
        <div key={c.label} className={`placement__chip${c.champion ? ' is-champion' : ''}`}>
          <span className="placement__label">{c.label}</span>
          <span className="placement__value" aria-label={c.champion ? `${c.label} champions` : undefined}>
            {c.champion ? '🏆 1st' : c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConferenceSection({ conference }: { conference: Conference }) {
  const divisions = [...conference.divisions].sort((a, b) => Number(b.yours) - Number(a.yours));
  return (
    <section className="conference" aria-label={conference.name}>
      <header className="conference__head">
        <h2 className="conference__title">{conference.name}</h2>
        {conference.yours ? <span className="conference__tag">Yours</span> : null}
      </header>
      {divisions.map((d) => (
        <Table key={d.name} title={`${conference.abbreviation} ${d.name}`} note={d.yours ? 'Your division' : undefined} rows={d.rows} />
      ))}
      <details className="conference__race" open={conference.yours}>
        <summary>{conference.yours ? 'Conference race: all 15 teams' : 'All 15 teams'}</summary>
        <Table title={conference.name} note="Best record takes the title" rows={conference.rows} />
      </details>
    </section>
  );
}

export function StandingsScreen() {
  const [params] = useSearchParams();
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
    const ordered = [...s.conferences].sort((a, b) => Number(b.yours) - Number(a.yours));
    return (
      <>
        <Placement s={s} />
        {ordered.map((c) => (
          <ConferenceSection key={c.name} conference={c} />
        ))}
        <details className="conference__race">
          <summary>League: all 30 teams</summary>
          <Table title="League" note="Best record takes the league title" rows={s.league} />
        </details>
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
