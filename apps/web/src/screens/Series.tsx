import type { GameSummaryDto, SeriesDto } from '@7gs/contracts';
import { compareDates, generateOpponent, localDateOf } from '@7gs/rules';
import { useState } from 'react';
import { useNow, useTimeZone } from '../app/hooks';
import { useCurrentSeriesQuery, useMeQuery } from '../app/queries';
import { OpponentBadge, TeamBadge } from '../components/Badges';
import { BoxScoreSheet } from '../components/BoxScoreSheet';
import { Chyron } from '../components/Chyron';
import { IconChevronRight } from '../components/icons';
import { RainoutSheet } from '../components/RainoutSheet';
import { RallySheet } from '../components/RallySheet';
import { SeriesStrip, stripState, stripText } from '../components/SeriesStrip';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { Tile } from '../components/Tile';
import { formatDate, formatMonthDay, formatRange, weekdayShort } from '../lib/format';
import { situationKeys, statusOfSeries } from '../lib/game';
import { vocab } from '../vocab';

function nextGameLine(series: SeriesDto, today: string): string {
  const upcoming = series.games
    .filter((g) => g.status !== 'final')
    .sort((a, b) => compareDates(a.playedDate, b.playedDate) || a.slot - b.slot);
  const next = upcoming[0];
  if (!next) return vocab.chyron.final;
  const sameDay = upcoming.filter((g) => g.playedDate === next.playedDate).length > 1;
  const when = next.playedDate === today ? 'today' : weekdayShort(next.playedDate);
  return sameDay ? `${vocab.term.doubleheader} ${when}` : `${vocab.gameLabel(next.gameNumber)} ${when}`;
}

export function SeriesScreen() {
  const series = useCurrentSeriesQuery();
  const me = useMeQuery();
  const timeZone = useTimeZone();
  const now = useNow();
  const [boxGame, setBoxGame] = useState<GameSummaryDto | null>(null);
  const [rallyGame, setRallyGame] = useState<GameSummaryDto | null>(null);
  const [rainoutGame, setRainoutGame] = useState<GameSummaryDto | null>(null);

  if (series.isPending) return <Loading label="Loading the series" />;
  if (series.isError) return <ErrorPanel error={series.error} onRetry={() => void series.refetch()} />;

  const s = series.data;
  if (!s) {
    const phase = me.data?.position.phase;
    return (
      <div className="screen">
        <h1 className="screen__title">{vocab.term.series}</h1>
        <EmptyState title={phase === 'offseason' ? vocab.term.offseason : vocab.term.preseason}>
          <p>No series this week. {phase === 'offseason' ? 'The next season opens Monday.' : vocab.chyron.seriesStarts}.</p>
        </EmptyState>
      </div>
    );
  }

  const today = me.data?.today ?? localDateOf(now, timeZone);
  const status = statusOfSeries(s);
  const tags = situationKeys(status);
  const teamName = me.data?.displayName ?? vocab.terms.you;
  const abbr = generateOpponent(s.opponent.seed).abbreviation;

  return (
    <div className="screen screen--series" data-situation={tags[0] ?? 'normal'}>
      <header className="matchup">
        <div className="matchup__badges" aria-hidden="true">
          <TeamBadge name={teamName} size={52} />
          <span className="matchup__vs">vs</span>
          <OpponentBadge opponent={s.opponent} size={52} />
        </div>
        <h1 className="matchup__title">{s.opponent.name}</h1>
        <p className="matchup__meta">
          {vocab.term.series} {s.number} · {vocab.term.season} {s.seasonNumber} · {formatRange(s.startDate, s.endDate)}
        </p>
      </header>

      <Chyron tags={tags} headline={`${vocab.seriesLabel(status)} · ${nextGameLine(s, today)}`} live={s.games.some((g) => g.status === 'live')} />

      <section className="series-score" aria-label="Series score">
        <div className="series-score__side">
          <span className="series-score__name">{teamName}</span>
          <Tile value={status.wins} size="l" />
        </div>
        <span className="series-score__dash" aria-hidden="true">
          –
        </span>
        <div className="series-score__side">
          <Tile value={status.losses} size="l" />
          <span className="series-score__name">{abbr}</span>
        </div>
        <p className="sr-only">
          {teamName} {status.wins}, {s.opponent.name} {status.losses}
        </p>
      </section>

      <SeriesStrip series={s} today={today} onSelect={setBoxGame} />

      <section className="card" aria-labelledby="gamelog-title">
        <header className="card__head">
          <h2 id="gamelog-title" className="card__title">
            Game log
          </h2>
          <p className="card__sub">First to 4 wins the series. All 7 are played.</p>
        </header>
        <ol className="gamelog">
          {s.games.map((g) => {
            const state = stripState(g, today);
            return (
              <li key={g.id}>
                <button type="button" className={`gamelog__row gamelog__row--${state}`} onClick={() => setBoxGame(g)}>
                  <span className="gamelog__num">G{g.gameNumber}</span>
                  <span className="gamelog__when">
                    {weekdayShort(g.scheduledDate)} {formatMonthDay(g.scheduledDate)}
                    {g.postponed ? (
                      <small>
                        {vocab.terms.postponedShort} → {formatDate(g.playedDate)}
                      </small>
                    ) : null}
                  </span>
                  <span className="gamelog__starter">{g.starterName}</span>
                  <span className={`gamelog__result gamelog__result--${state}`}>{stripText(g, state)}</span>
                  <IconChevronRight width={18} height={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        {status.comeback ? <p className="notice notice--win">Comeback series: won after trailing.</p> : null}
        {s.ironMan ? <p className="notice notice--win">{vocab.terms.ironMan}: every game as scheduled, 5+ wins. Bonus Rainout earned.</p> : null}
      </section>

      <BoxScoreSheet
        game={boxGame}
        today={today}
        timeZone={timeZone}
        now={now}
        onClose={() => setBoxGame(null)}
        onRally={(g) => {
          setBoxGame(null);
          setRallyGame(g);
        }}
        onRainout={(g) => {
          setBoxGame(null);
          setRainoutGame(g);
        }}
      />
      {rallyGame ? <RallySheet game={rallyGame} open onClose={() => setRallyGame(null)} timeZone={timeZone} /> : null}
      {rainoutGame ? <RainoutSheet game={rainoutGame} open onClose={() => setRainoutGame(null)} /> : null}
    </div>
  );
}
