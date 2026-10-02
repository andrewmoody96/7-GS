import { vocab, type SituationKey } from '../vocab';

interface ChyronProps {
  /** Broadcast tags such as "Clinch game", most important first. */
  tags: SituationKey[];
  headline: string;
  sub?: string;
  live?: boolean;
}

/** A TV-style lower third: "SERIES TIED 2–2 · GAME 5 TONIGHT". */
export function Chyron({ tags, headline, sub, live }: ChyronProps) {
  const [primary, ...rest] = tags;
  const blurb = sub ?? (primary ? vocab.situation[primary].blurb : undefined);
  return (
    <div className={`chyron${primary ? ` chyron--${primary}` : ''}`}>
      <div className="chyron__bar">
        <span className="chyron__bug" aria-hidden="true">
          7GS
        </span>
        {primary ? <span className={`chyron__tag chyron__tag--${primary}`}>{vocab.situation[primary].tag}</span> : null}
        <p className="chyron__headline">{headline}</p>
        {live ? (
          <span className="chyron__live">
            <span className="chyron__dot" aria-hidden="true" />
            {vocab.gameStatus.live}
          </span>
        ) : null}
      </div>
      {blurb || rest.length > 0 ? (
        <p className="chyron__sub">
          {rest.map((tag) => (
            <span key={tag} className={`chyron__subtag chyron__tag--${tag}`}>
              {vocab.situation[tag].tag}
            </span>
          ))}
          {blurb}
        </p>
      ) : null}
    </div>
  );
}
