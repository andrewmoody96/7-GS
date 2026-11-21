// Team → Standings: a season's two leagues of three divisions (dealt again every season),
// with the player's division first, then their league's title race, then the other league.
// No playoffs: the best record when the season ends takes the title (GAME_DESIGN §8).

import type { StandingsDto, StandingsRowDto } from '@7gs/contracts';
import { opponentAbbreviation } from '@7gs/rules';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentSeasonQuery, useStandingsQuery } from '../app/queries';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatWinPct } from '../lib/format';
import { vocab } from '../vocab';

function TeamMark({ row }: { row: StandingsRowDto }) {
  if (!row.colors) return <span className="standings__mark standings__mark--you" aria-hidden="true">★</span>;
  return (
    <span className="standings__mark" aria-hidden="true" style={{ background: row.colors[0], color: row.colors[1] }}>
      {opponentAbbreviation(row.name)}
    </span>
  );
}

function Table({ title, rows, caption }: { title: string; rows: StandingsRowDto[]; caption?: string }) {
  return (
    <section className="card standings" aria-label={title}>
      <h2 className="card__title">{title}</h2>
      {caption ? <p className="card__sub">{caption}</p> : null}
      <table className="standings__table">
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
                <TeamMark row={r} />
                <span className="standings__name">{r.name}</span>
              </th>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{formatWinPct(r.wins + r.losses === 0 ? null : r.winPct)}</td>
              <td>{r.gamesBack === 0 ? '–' : r.gamesBack}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TitleBanner({ s }: { s: StandingsDto }) {
  const mine = s.leagues.find((l) => l.yours)!;
  const division = mine.divisions.find((d) => d.yours)!;
  const place = (rows: StandingsRowDto[]) => rows.findIndex((r) => r.you) + 1;
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
  const where = `${mine.name} ${division.name}`;
  if (!s.complete) {
    return (
      <p className="notice standings__race">
        {ordinal(place(division.rows))} in the {where}, {ordinal(place(mine.rows))} in the {mine.name}. The best record when the{' '}
        {vocab.term.season.toLowerCase()} ends takes each title.
      </p>
    );
  }
  const won = [s.titles?.division ? `${where} champions` : null, s.titles?.league ? `${mine.name} champions` : null].filter(Boolean);
  return (
    <p className={`notice standings__race${won.length > 0 ? ' is-champion' : ''}`}>
      {won.length > 0
        ? `🏆 ${won.join(' · ')}`
        : `Finished ${ordinal(place(division.rows))} in the ${where} and ${ordinal(place(mine.rows))} in the ${mine.name}.`}
    </p>
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
    const mine = s.leagues.find((l) => l.yours)!;
    const other = s.leagues.find((l) => !l.yours)!;
    const myDivision = mine.divisions.find((d) => d.yours)!;
    return (
      <>
        <TitleBanner s={s} />
        <Table title={`${mine.name} ${myDivision.name}`} caption="Your division" rows={myDivision.rows} />
        <Table title={mine.name} caption="Your league: the best record wins it" rows={mine.rows} />
        {mine.divisions
          .filter((d) => !d.yours)
          .map((d) => (
            <Table key={d.name} title={`${mine.name} ${d.name}`} rows={d.rows} />
          ))}
        {other.divisions.map((d) => (
          <Table key={d.name} title={`${other.name} ${d.name}`} rows={d.rows} />
        ))}
        <p className="fine">
          Divisions and leagues are dealt again every {vocab.term.season.toLowerCase()}. Ties go to the better record in the
          division, then in the league, then run differential.
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
