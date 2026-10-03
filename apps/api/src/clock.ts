// Every service reads time from an injected clock so tests can simulate days, local
// midnights and time zones. Nothing outside this file calls `new Date()` for "now".

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock that only moves when told to. Used by tests and the demo seed. */
export class ManualClock implements Clock {
  #ms: number;

  constructor(start: Date | string) {
    this.#ms = new Date(start).getTime();
    if (Number.isNaN(this.#ms)) throw new RangeError(`Invalid clock start: ${String(start)}`);
  }

  now(): Date {
    return new Date(this.#ms);
  }

  set(at: Date | string): void {
    const ms = new Date(at).getTime();
    if (Number.isNaN(ms)) throw new RangeError(`Invalid clock time: ${String(at)}`);
    this.#ms = ms;
  }

  advance(ms: number): void {
    this.#ms += ms;
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60_000);
  }

  advanceDays(days: number): void {
    this.advance(days * 86_400_000);
  }
}
