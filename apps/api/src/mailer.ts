// Email: sign-in links and reminders. Resend (RESEND_API_KEY) or Postmark
// (POSTMARK_API_TOKEN) over their HTTP APIs, or a Gmail account over SMTP with an app
// password (GMAIL_USER + GMAIL_APP_PASSWORD), which needs no domain of your own.

import nodemailer from 'nodemailer';
import type { Mailer } from './deps';

export type EmailConfig =
  | { provider: 'resend' | 'postmark'; apiKey: string; from: string }
  | { provider: 'gmail'; user: string; password: string; from: string };

function createGmailMailer(config: Extract<EmailConfig, { provider: 'gmail' }>): Mailer {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.password },
  });
  const mailer: Mailer = {
    async sendMagicLink(email, link, code) {
      await mailer.sendMessage(email, magicLinkEmail(link, code));
    },
    async sendMessage(email, { subject, text, html }) {
      try {
        await transport.sendMail({ from: config.from, to: email, subject, text, html });
      } catch (error) {
        throw new Error(`Gmail rejected the email: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
  return mailer;
}

type Fetch = typeof fetch;

/**
 * The sign-in email. The code leads the subject so iOS can offer it above the keyboard
 * ("From Mail") in the Home Screen app, where the link would open Safari instead.
 */
export function magicLinkEmail(link: string, code: string): { subject: string; text: string; html: string } {
  const subject = `${code} is your 7-Game Series 6-digit code`;
  const text = [
    'Using the app? Enter this 6-digit code:',
    '',
    `    ${code}`,
    '',
    'On iPhone, this is the one to use in the app on your Home Screen.',
    '',
    'Using a web browser? Sign in with browser:',
    '',
    link,
    '',
    "Each works once, for 15 minutes. If you didn't ask for this, you can ignore this email.",
  ].join('\n');
  const href = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const label = 'margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c9c3b2';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0c1f16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4efe1">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;background:#123d2a;border-radius:12px;padding:28px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f2c14e">7-Game Series</p>
<h1 style="margin:0 0 20px;font-size:22px;color:#f4efe1">Sign in</h1>
<p style="${label}">Using the app</p>
<p style="margin:0 0 4px;line-height:1.5">Enter this 6-digit code:</p>
<p style="margin:0 0 4px;font-size:36px;font-weight:700;letter-spacing:.3em;color:#f2c14e">${code}</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#c9c3b2">On iPhone, this is the one to use in the app on your Home Screen.</p>
<p style="${label}">Using a web browser</p>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#f2c14e;color:#0c1f16;font-weight:700;text-decoration:none">Sign in with browser</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#c9c3b2">Each works once, for 15 minutes. If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function createMailer(config: EmailConfig, fetchImpl: Fetch = fetch): Mailer {
  if (config.provider === 'gmail') return createGmailMailer(config);
  const mailer: Mailer = {
    async sendMagicLink(email, link, code) {
      await mailer.sendMessage(email, magicLinkEmail(link, code));
    },
    async sendMessage(email, { subject, text, html }) {
      const request: { url: string; headers: Record<string, string>; body: unknown } =
        config.provider === 'resend'
          ? {
              url: 'https://api.resend.com/emails',
              headers: { authorization: `Bearer ${config.apiKey}` },
              body: { from: config.from, to: [email], subject, text, html },
            }
          : {
              url: 'https://api.postmarkapp.com/email',
              headers: { 'x-postmark-server-token': config.apiKey, accept: 'application/json' },
              body: { From: config.from, To: email, Subject: subject, TextBody: text, HtmlBody: html, MessageStream: 'outbound' },
            };
      const res = await fetchImpl(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...request.headers },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`${config.provider} rejected the email (${res.status}): ${detail}`);
      }
    },
  };
  return mailer;
}
