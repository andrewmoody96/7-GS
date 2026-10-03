/** Message plus the `cause` chain (drizzle wraps driver errors such as deadlocks). */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    parts.push(current instanceof Error ? (depth === 0 ? (current.stack ?? current.message) : current.message) : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join('\n  caused by: ');
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function line(level: string, message: string, meta?: Record<string, unknown>): string {
  const time = new Date().toISOString();
  return meta && Object.keys(meta).length > 0
    ? `${time} ${level} ${message} ${JSON.stringify(meta)}`
    : `${time} ${level} ${message}`;
}

export const consoleLogger: Logger = {
  info: (message, meta) => console.log(line('INFO', message, meta)),
  warn: (message, meta) => console.warn(line('WARN', message, meta)),
  error: (message, meta) => console.error(line('ERROR', message, meta)),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Keeps every log line in memory (tests assert on the dev magic-link log). */
export class MemoryLogger implements Logger {
  readonly lines: { level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> }[] = [];

  info(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: 'error', message, meta });
  }
}
