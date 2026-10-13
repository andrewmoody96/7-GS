import { randomInt } from 'node:crypto';
import type { Clock } from './clock';
import type { Db } from './db/client';
import type { Logger } from './logger';
import type { RollDice } from './services/rally';

export interface AppConfig {
  /** Mark the session cookie `Secure` (production, HTTPS). */
  cookieSecure: boolean;
  /** Parse every response with its contracts schema before sending (dev and tests). */
  validateResponses: boolean;
  /** Log one line per request (the dev server). */
  logRequests?: boolean;
  /** Public origin for links in emails, e.g. https://my-app.herokuapp.com. */
  appUrl?: string | null;
  /** Serve the built web app from this directory (production: one origin for app + API). */
  webRoot?: string | null;
  /** Redirect plain-HTTP requests (x-forwarded-proto) to HTTPS. */
  forceHttps?: boolean;
  /** With no mailer, hand the magic-link token back as `devToken` (development). */
  allowDevLogin?: boolean;
  /** Throttle magic-link requests per address and per client. */
  limitMagicLinks?: boolean;
}

/** Sends magic links (see mailer.ts). Without one, links come back as `devToken`. */
export interface Mailer {
  sendMagicLink(email: string, link: string): Promise<void>;
}

export interface Deps {
  db: Db;
  clock: Clock;
  log: Logger;
  config: AppConfig;
  mailer: Mailer | null;
  /** Percentile dice for Rally Caps (CSPRNG in production). */
  rollDice: RollDice;
}

export const defaultConfig: AppConfig = {
  cookieSecure: false,
  validateResponses: true,
  allowDevLogin: true,
};

/** crypto.randomInt(1, 101): an integer from 1 to 100 from the OS CSPRNG. */
export const cryptoDice: RollDice = () => randomInt(1, 101);
