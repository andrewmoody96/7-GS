import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { GameDto } from '@7gs/contracts';
import { CHICAGO, createTasks, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// A new account: every default lineup is empty and needs 1 run to win.
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn('empty-days@example.com', CHICAGO);
  const ids = await createTasks(t, token, [
    { name: 'Call', points: 2 },
    { name: 'Playlists', points: 2 },
  ]);
  return { t, token, ids };
}

async function completeAll(t: TestApp, token: string, game: GameDto) {
  for (const e of game.entries.filter((x) => x.role === 'lineup')) {
    await t.ok('completeEntry', { token, params: { gameId: game.id, entryId: e.id }, body: { clientAt: t.clock.now().toISOString() } });
  }
}

describe('a day that starts out of reach', () => {
  it('lets pinch hitters make it winnable: doing every task wins', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '09:00', CHICAGO);
    const [empty] = (await t.ok('getToday', { token })).games;
    expect(empty).toMatchObject({ threshold: 1 });
    expect(empty!.entries).toHaveLength(0);

    // Not 1 + 2 = 3, which the 2-run lineup could never reach.
    expect(await t.ok('addPinchHitter', { token, params: { gameId: empty!.id }, body: { taskId: ids.Call! } })).toMatchObject({ threshold: 2 });
    // From a reachable day, the usual rule: runs to win rises by exactly the task's runs.
    const full = await t.ok('addPinchHitter', { token, params: { gameId: empty!.id }, body: { taskId: ids.Playlists! } });
    expect(full).toMatchObject({ threshold: 4 });

    await completeAll(t, token, full);
    t.at('2026-10-06', '00:30', CHICAGO);
    await t.finalize();
    expect(await t.ok('getGame', { token, params: { gameId: empty!.id } })).toMatchObject({ status: 'final', result: 'W' });
  });

  it('repairs days already stuck (migration 0008)', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '09:00', CHICAGO);
    const [game] = (await t.ok('getToday', { token })).games;
    await t.ok('addPinchHitter', { token, params: { gameId: game!.id }, body: { taskId: ids.Call! } });
    await t.ok('addPinchHitter', { token, params: { gameId: game!.id }, body: { taskId: ids.Playlists! } });
    // What the old rule left behind: 1 + 2 + 2 = 5 to win from a 4-run lineup.
    await t.db.execute(sql`UPDATE games SET threshold = 5 WHERE id = ${game!.id}`);

    const repair = readFileSync(new URL('../drizzle/0008_repair_unwinnable_days.sql', import.meta.url), 'utf8');
    await t.db.execute(sql.raw(repair));
    const [row] = rowsOf<{ threshold: number }>(await t.db.execute(sql`SELECT threshold FROM games WHERE id = ${game!.id}`));
    expect(row?.threshold).toBe(4);
  });
});
