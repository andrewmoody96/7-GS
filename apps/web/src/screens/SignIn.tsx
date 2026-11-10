import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionDto } from '@7gs/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../api/client';
import { useApi } from '../app/context';
import { errorMessage } from '../app/errors';
import { deviceTimeZone } from '../app/hooks';
import { qk, useMeQuery } from '../app/queries';
import { Tile } from '../components/Tile';
import { WELCOME_PARAM } from '../components/WelcomeSetup';
import { vocab } from '../vocab';

export function SignInScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useMeQuery();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ email: string; devToken?: string; emailed?: boolean } | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const emailId = useId();
  const autoVerified = useRef(false);

  const request = useMutation({
    mutationFn: (address: string) => api.call('requestMagicLink', { body: { email: address } }),
    onSuccess: (res, address) => {
      setSent({ email: address, devToken: res.devToken, emailed: res.emailed });
      setSentAt(Date.now());
    },
  });
  const signedIn = (session: SessionDto) => {
    qc.clear();
    qc.setQueryData(qk.me, session.me);
    // A brand-new account starts with the welcome setup (sport, then look).
    navigate(session.isNewUser ? `/?${WELCOME_PARAM}=start` : '/', { replace: true });
  };
  const verify = useMutation({
    // The device's zone becomes the account's zone on first sign-in.
    mutationFn: (token: string) => api.call('verifyMagicLink', { body: { token, timezone: deviceTimeZone() } }),
    onSuccess: signedIn,
  });

  // Landing from an emailed link: /sign-in?token=…
  useEffect(() => {
    const token = params.get('token');
    if (token && !autoVerified.current) {
      autoVerified.current = true;
      verify.mutate(token);
    }
  }, [params, verify]);

  const hasSession = me.data && !(isApiError(me.error) && me.error.code === 'UNAUTHORIZED');
  // Already signed in: go home. (Not right after verifying: onSuccess picks the
  // destination, Today for everyone; a new account sees the How it works guide there.)
  if (hasSession && !params.get('token') && verify.isIdle) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) request.mutate(email.trim());
  };

  return (
    <main className="signin">
      <section className="board board--hero" aria-label={vocab.app.name}>
        <p className="board__eyebrow">{vocab.flavor.welcome}</p>
        <div className="hero-tiles" aria-hidden="true">
          <Tile value="7" size="l" />
          <span className="hero-tiles__word">Game Series</span>
        </div>
        <h1 className="signin__title">{vocab.app.tagline}</h1>
        <p className="signin__sub">Win the day by finishing your lineup. First to four takes the week.</p>
      </section>

      {verify.isPending ? <p className="loading-line">{vocab.flavor.signingIn}</p> : null}
      {verify.isError ? <p className="notice notice--error">{errorMessage(verify.error)}</p> : null}

      {sent ? (
        <section className="card signin__card" aria-live="polite">
          <h2 className="card__title">{sent.devToken && sent.emailed !== true ? 'Sign in' : 'Check your email'}</h2>
          {sent.emailed === false ? (
            <p>
              We couldn’t email a code to <strong>{sent.email}</strong> just now, but you can still sign in below.
            </p>
          ) : sent.devToken && sent.emailed === undefined ? null : (
            <CodeEntry
              email={sent.email}
              onSignedIn={signedIn}
              onResend={() => request.mutate(sent.email)}
              resending={request.isPending}
              sentAt={sentAt}
            />
          )}
          {sent.devToken ? (
            <div className="devtoken">
              <p className="fine">
                {sent.emailed === true
                  ? 'Or skip the email: quick sign-in is still on for testing.'
                  : sent.emailed === false
                    ? 'Quick sign-in is on for testing.'
                    : 'No email service is set up, so you can sign in directly.'}
              </p>
              <button type="button" className="btn btn--primary btn--block" onClick={() => verify.mutate(sent.devToken!)} disabled={verify.isPending}>
                Sign in now
              </button>
            </div>
          ) : null}
          <button type="button" className="btn btn--quiet" onClick={() => setSent(null)}>
            Use a different email
          </button>
        </section>
      ) : (
        <form className="card signin__card" onSubmit={submit}>
          <label className="field__label" htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {request.isError ? <p className="notice notice--error">{errorMessage(request.error)}</p> : null}
          <button type="submit" className="btn btn--primary btn--block" disabled={request.isPending || !email.trim()}>
            {request.isPending ? 'Sending…' : 'Email me a sign-in code'}
          </button>
          <p className="fine">No passwords. We’ll email you a 6-digit code.</p>
          {api.mode === 'mock' ? (
            <p className="fine">
              Demo mode: <code>demo@7gs.app</code> signs back into the demo team; any other email starts a fresh account in{' '}
              {vocab.term.preseason}.
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}

const RESEND_AFTER_S = 30;

/**
 * The 6-digit code from the sign-in email. One field, the number pad, and iOS's "From
 * Mail" suggestion above the keyboard; it signs in as soon as the 6th digit is in.
 */
function CodeEntry({
  email,
  onSignedIn,
  onResend,
  resending,
  sentAt,
}: {
  email: string;
  onSignedIn: (session: SessionDto) => void;
  onResend: () => void;
  resending: boolean;
  sentAt: number;
}) {
  const api = useApi();
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const codeId = useId();
  const check = useMutation({
    mutationFn: (value: string) =>
      api.call('verifyLoginCode', { body: { email, code: value, timezone: deviceTimeZone() } }),
    onSuccess: onSignedIn,
    onError: () => {
      setCode('');
      input.current?.focus();
    },
  });

  useEffect(() => {
    setCode('');
    check.reset();
    input.current?.focus();
    // A new email means a new code.
  }, [sentAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (check.isError) check.reset();
    if (digits.length === 6 && !check.isPending) check.mutate(digits);
  };

  return (
    <div className="codeentry">
      <p>
        Enter the 6-digit code we sent to <strong>{email}</strong>.
      </p>
      <label className="sr-only" htmlFor={codeId}>
        6-digit code
      </label>
      <input
        ref={input}
        id={codeId}
        className={`input input--code${check.isError ? ' is-invalid' : ''}`}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        placeholder="••••••"
        value={code}
        disabled={check.isPending}
        aria-invalid={check.isError}
        onChange={(e) => onChange(e.target.value)}
      />
      {check.isPending ? <p className="loading-line">Signing in…</p> : null}
      {check.isError ? (
        <p className="notice notice--error" role="alert">
          {/* The server says what went wrong with the code ("2 tries left"); keep its words. */}
          {isApiError(check.error) && check.error.code === 'UNAUTHORIZED' ? check.error.message : errorMessage(check.error)}
        </p>
      ) : null}
      <p className="fine">The code works once, for 15 minutes. You can also tap the link in the email to sign in on that device.</p>
      <button type="button" className="btn btn--quiet" disabled={wait > 0 || resending} onClick={onResend}>
        {resending ? 'Sending…' : wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
      </button>
    </div>
  );
}
