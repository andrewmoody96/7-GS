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
}

/** Sends magic links. None is configured yet, so links come back as `devToken`. */
export interface Mailer {
  sendMagicLink(email: string, token: string): Promise<void>;
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
};

/** crypto.randomInt(1, 101): an integer from 1 to 100 from the OS CSPRNG. */
export const cryptoDice: RollDice = () => randomInt(1, 101);
