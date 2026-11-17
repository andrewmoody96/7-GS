// Team → Settings → Accounts (ADMIN_EMAILS only): who has an account, when it was
// created, when it last signed in, and when it was last seen using the app.

import type { AdminAccountDto } from '@7gs/contracts';
import { Link } from 'react-router-dom';
import { useAdminAccountsQuery } from '../app/queries';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { THEME_TERMS } from '@7gs/rules';
import { vocab } from '../vocab';

const dateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "just now", "3 hours ago", "yesterday", "5 days ago", or a date once it's older. */
export function sinceText(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return minutes < 2 ? 'just now' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function When({ label, iso, empty }: { label: string; iso: string | null; empty: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={iso ? dateTime.format(new Date(iso)) : undefined}>{iso ? sinceText(iso) : empty}</dd>
    </div>
  );
}

function AccountCard({ account: a }: { account: AdminAccountDto }) {
  return (
    <li className="card account">
      <p className="account__name">
        <strong>{a.displayName}</strong> <span className="muted">· {THEME_TERMS[a.theme].name}</span>
      </p>
      <p className="account__email">{a.email}</p>
      <dl className="facts account__facts">
        <When label="Last seen" iso={a.lastSeenAt} empty="Not yet recorded" />
        <When label="Last sign-in" iso={a.lastSignInAt} empty="—" />
        <When label="Created" iso={a.createdAt} empty="—" />
        <div>
          <dt>Devices signed in</dt>
          <dd>{a.devices}</dd>
        </div>
      </dl>
    </li>
  );
}

export function AccountsScreen() {
  const accounts = useAdminAccountsQuery();
  return (
    <div className="screen screen--team">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            <Link to="/team">{vocab.tabs.team}</Link> / <Link to="/team/settings">Settings</Link> /
          </p>
          <h1 className="screen__title">Accounts</h1>
        </div>
      </header>
      {accounts.isPending ? (
        <Loading label="Loading accounts" />
      ) : accounts.isError ? (
        <ErrorPanel error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : accounts.data.length === 0 ? (
        <EmptyState title="No accounts yet" />
      ) : (
        <>
          <p className="muted">
            {accounts.data.length} {accounts.data.length === 1 ? 'account' : 'accounts'}, most recently active first. “Last seen” is
            to the hour.
          </p>
          <ul className="accounts">
            {accounts.data.map((a) => (
              <AccountCard key={a.email} account={a} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
