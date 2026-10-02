import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../api/client';
import { useApi } from '../app/context';
import { errorMessage } from '../app/errors';
import { deviceTimeZone } from '../app/hooks';
import { qk, useMeQuery } from '../app/queries';
import { Tile } from '../components/Tile';
import { vocab } from '../vocab';

export function SignInScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useMeQuery();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ email: string; devToken?: string } | null>(null);
  const emailId = useId();
  const autoVerified = useRef(false);

  const request = useMutation({
    mutationFn: (address: string) => api.call('requestMagicLink', { body: { email: address } }),
    onSuccess: (res, address) => setSent({ email: address, devToken: res.devToken }),
  });
  const verify = useMutation({
    // The device's zone becomes the account's zone on first sign-in.
    mutationFn: (token: string) => api.call('verifyMagicLink', { body: { token, timezone: deviceTimeZone() } }),
    onSuccess: (session) => {
      qc.clear();
      qc.setQueryData(qk.me, session.me);
      navigate(session.isNewUser ? '/film-room?tab=roster' : '/', { replace: true });
    },
  });

  // Landing from an emailed link: /sign-in?token=…
  useEffect(() => {
    const token = params.get('token');
    if (token && !autoVerified.current) {
      autoVerified.current = true;
      verify.mutate(token);
    }
  }, [params, verify]);

  const signedIn = me.data && !(isApiError(me.error) && me.error.code === 'UNAUTHORIZED');
  if (signedIn && !params.get('token')) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) request.mutate(email.trim());
  };

  return (
    <main className="signin">
      <section className="board board--hero" aria-label={vocab.app.name}>
        <p className="board__eyebrow">Welcome to the ballpark</p>
        <div className="hero-tiles" aria-hidden="true">
          <Tile value="7" size="l" />
          <span className="hero-tiles__word">Game Series</span>
        </div>
        <h1 className="signin__title">{vocab.app.tagline}</h1>
        <p className="signin__sub">Win the day by finishing your lineup. First to four takes the week.</p>
      </section>

      {verify.isPending ? <p className="loading-line">Checking your ticket…</p> : null}
      {verify.isError ? <p className="notice notice--error">{errorMessage(verify.error)}</p> : null}

      {sent ? (
        <section className="card signin__card" aria-live="polite">
          <h2 className="card__title">Check your email</h2>
          <p>
            We sent a sign-in link to <strong>{sent.email}</strong>. It works for 15 minutes.
          </p>
          {sent.devToken ? (
            <div className="devtoken">
              <p className="fine">Development: the API returned the link’s token instead of emailing it.</p>
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
            {request.isPending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className="fine">No passwords. We’ll email you a magic link.</p>
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
