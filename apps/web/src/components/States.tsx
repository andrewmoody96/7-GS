import type { ReactNode } from 'react';
import { errorMessage } from '../app/errors';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <div className="skeleton skeleton--board" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--card" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">Rain delay</p>
      <p>{errorMessage(error)}</p>
      {onRetry ? (
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children}
    </div>
  );
}
