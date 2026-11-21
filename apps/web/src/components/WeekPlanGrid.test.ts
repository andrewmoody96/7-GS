import type { StarterDto, TaskDto } from '@7gs/contracts';
import { describe, expect, it } from 'vitest';
import { initialPlan, samePlan, weekPlanBodies } from './WeekPlanGrid';

const task = (id: string, status: TaskDto['status'] = 'active'): TaskDto => ({
  id,
  name: id,
  notes: null,
  points: 1,
  status,
  kind: 'recurring',
  carryover: false,
  ilStartedOn: null,
  ilMinUntil: null,
  currentStreak: 0,
  longestStreak: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  deletedAt: null,
  lockedThrough: null,
  lockedPoints: null,
});

const starter = (weekday: number, lineup: [string, boolean][], bench: string[] = []): StarterDto => ({
  weekday,
  name: `Day ${weekday}`,
  threshold: 1,
  minTasks: 0,
  lockTime: weekday === 1 ? '09:00' : null,
  lineup: lineup.map(([taskId, required], i) => ({ taskId, position: i + 1, required })),
  bench: bench.map((taskId, i) => ({ taskId, position: i + 1 })),
  warnings: [],
});

describe('week plan', () => {
  const gym = task('gym');
  const read = task('read');
  const walk = task('walk');
  const hurt = task('hurt', 'injured');
  const starters = [starter(1, [['hurt', true], ['read', false], ['gym', true]], ['walk']), ...[2, 3, 4, 5, 6, 7].map((d) => starter(d, [['gym', false]]))];
  const rows = [gym, read, walk];

  it('starts from the saved lineups', () => {
    const plan = initialPlan(rows, starters, { fillEmpty: false });
    expect([...plan.get('gym')!.days].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...plan.get('gym')!.mustDays]).toEqual([1]);
    expect(plan.get('walk')!.days.size).toBe(0);
    // In setup, a task on no day yet starts on every day, unless it's on a bench.
    const fresh = task('fresh');
    const filled = initialPlan([...rows, fresh], starters, { fillEmpty: (t) => t.id === 'fresh' || t.id === 'walk' });
    expect(filled.get('fresh')!.days.size).toBe(7);
    expect(filled.get('walk')!.days.size).toBe(0);
    expect(weekPlanBodies(plan, rows, starters).size).toBe(0);
    expect(samePlan(plan, initialPlan(rows, starters, { fillEmpty: false }))).toBe(true);
  });

  it('saves only changed days, keeping order, the day’s settings and tasks off the grid', () => {
    const plan = initialPlan(rows, starters, { fillEmpty: false });
    plan.set('walk', { days: new Set([1]), mustDays: new Set() });
    plan.set('read', { days: new Set([1]), mustDays: new Set([1]) });
    const bodies = weekPlanBodies(plan, rows, starters);
    expect([...bodies.keys()]).toEqual([1]);
    expect(bodies.get(1)).toEqual({
      name: 'Day 1',
      lockTime: '09:00',
      // The injured task stays put; Walk joins at the end and leaves the bench.
      lineup: [
        { taskId: 'hurt', required: true, position: 1 },
        { taskId: 'read', required: true, position: 2 },
        { taskId: 'gym', required: true, position: 3 },
        { taskId: 'walk', required: false, position: 4 },
      ],
      bench: [],
    });
  });

  it('takes a task off a day', () => {
    const plan = initialPlan(rows, starters, { fillEmpty: false });
    plan.set('gym', { days: new Set([1, 2, 3, 4, 5, 6]), mustDays: new Set([1]) });
    const bodies = weekPlanBodies(plan, rows, starters);
    expect([...bodies.keys()]).toEqual([7]);
    expect(bodies.get(7)!.lineup).toEqual([]);
  });
});
