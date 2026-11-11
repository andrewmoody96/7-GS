import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { GameDto } from '@7gs/contracts';
import { CHICAGO, createTasks, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();

/** Every weekday: Gym (2) must-hit, Read and Walk. Runs to win: 2 + half of 2 = 3. */
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn('lineup-math@example.com', CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }, { name: 'Walk' }, { name: 'Dishes', points: 3 }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: false },
          { taskId: ids.Walk!, position: 3, required: false },
        ],
        bench: [],
      },
    });
  }
  return { t, token, ids };
}

const entry = (g: GameDto, name: string) => g.entries.find((e) => e.taskName === name)!;

describe('runs to win from the lineup', () => {
  it('works it out for default lineups and the days built from them', async () => {
    const { t, token } = await setup();
    const { starters } = await t.ok('listStarters', { token });
    expect(starters.every((s) => s.threshold === 3 && s.minTasks === null)).toBe(true);
    t.at('2026-10-05', '08:00', CHICAGO);
    const week = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    expect(week.games.map((g) => g.threshold)).toEqual(Array(7).fill(3));
  });

  it('follows the lineup while the week is planned, then only a new must-hit raises it', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const week = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    const [monday, , wednesday] = week.games;

    // Planning: a must-hit added to Wednesday is just part of the plan (2 + 3 + half of 2 = 6).
    const planned = await t.ok('addPinchHitter', { token, params: { gameId: wednesday!.id }, body: { taskId: ids.Dishes! } });
    expect(planned.threshold).toBe(6);

    // First check-off: the week is locked.
    t.at('2026-10-05', '09:00', CHICAGO);
    await t.ok('completeEntry', { token, params: { gameId: monday!.id, entryId: entry(monday!, 'Read').id }, body: { clientAt: t.clock.now().toISOString() } });

    // A regular task on a later day: no raise. Making a batting task a must-hit: no raise.
    const thursday = week.games[3]!;
    const regular = await t.ok('addPinchHitter', { token, params: { gameId: thursday.id }, body: { taskId: ids.Dishes!, required: false } });
    expect(regular.threshold).toBe(3);
    const required = await t.ok('addPinchHitter', { token, params: { gameId: thursday.id }, body: { taskId: ids.Read! } });
    expect(required.threshold).toBe(3);

    // A new must-hit today: exactly its runs (3 → 6), and every task done still wins.
    const pinch = await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Dishes! } });
    expect(pinch.threshold).toBe(6);
    for (const name of ['Gym', 'Walk', 'Dishes']) {
      const g = await t.ok('getGame', { token, params: { gameId: monday!.id } });
      await t.ok('completeEntry', { token, params: { gameId: g.id, entryId: entry(g, name).id }, body: { clientAt: t.clock.now().toISOString() } });
    }
    t.at('2026-10-06', '00:30', CHICAGO);
    await t.finalize();
    expect(await t.ok('getGame', { token, params: { gameId: monday!.id } })).toMatchObject({ result: 'W', runs: 7, threshold: 6 });
  });

  it('fixes unfinished days from before (migration 0009)', async () => {
    const { t, token } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    // An old hand-set target above the 4-run lineup, and a minimum task count.
    await t.db.execute(sql`UPDATE games SET threshold = 9, min_tasks = 3 WHERE id = ${monday!.id}`);

    const migration = readFileSync(new URL('../drizzle/0009_runs_to_win_from_lineup.sql', import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) await t.db.execute(sql.raw(statement));
    const [row] = rowsOf<{ threshold: number; min_tasks: number | null }>(
      await t.db.execute(sql`SELECT threshold, min_tasks FROM games WHERE id = ${monday!.id}`),
    );
    expect(row).toEqual({ threshold: 4, min_tasks: null });
  });
});
