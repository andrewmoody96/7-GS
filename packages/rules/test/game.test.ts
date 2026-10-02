import { describe, expect, it } from 'vitest';
import { evaluateGame, type EntryState } from '../src';

const task = (points: number, completed: boolean, extra: Partial<EntryState> = {}): EntryState => ({
  points,
  completed,
  required: false,
  role: 'lineup',
  ...extra,
});

describe('evaluateGame', () => {
  it('wins when must-hits are done and runs meet the threshold', () => {
    const e = evaluateGame(
      [task(2, true, { required: true }), task(1, true), task(1, false)],
      { threshold: 3, minTasks: null },
    );
    expect(e).toMatchObject({ runs: 3, tasksDone: 2, result: 'W', detail: 'clean', missedRequired: 0 });
  });

  it('loses short when runs fall below the threshold', () => {
    const e = evaluateGame([task(1, true), task(1, false)], { threshold: 2, minTasks: null });
    expect(e).toMatchObject({ result: 'L', detail: 'short', runsNeeded: 1, rallyEligible: true });
  });

  it('loses short when the minimum task count is not met', () => {
    const e = evaluateGame([task(5, true), task(1, false)], { threshold: 3, minTasks: 2 });
    expect(e).toMatchObject({ result: 'L', detail: 'short', minMet: false, tasksNeeded: 1 });
  });

  it('forfeits with exactly one missed must-hit, even with plenty of runs', () => {
    const e = evaluateGame(
      [task(1, false, { required: true, partial: true }), task(9, true)],
      { threshold: 3, minTasks: null },
    );
    expect(e).toMatchObject({
      result: 'L',
      detail: 'forfeit',
      missedRequired: 1,
      rallyEligible: true,
      partialOnMissed: true,
    });
  });

  it('cannot be appealed with two or more missed must-hits', () => {
    const e = evaluateGame(
      [task(1, false, { required: true }), task(1, false, { required: true }), task(9, true)],
      { threshold: 3, minTasks: null },
    );
    expect(e).toMatchObject({ result: 'L', detail: 'no_appeal', rallyEligible: false });
  });

  it('ignores bench and subbed-out entries', () => {
    const e = evaluateGame(
      [
        task(1, true),
        task(5, true, { role: 'bench' }),
        task(1, false, { role: 'subbed_out', required: false }),
      ],
      { threshold: 2, minTasks: null },
    );
    expect(e).toMatchObject({ runs: 1, lineupSize: 1, result: 'L' });
  });

  it('loses with an empty lineup', () => {
    expect(evaluateGame([], { threshold: 1, minTasks: null }).result).toBe('L');
  });

  it('defaults to one run per task when points are 1', () => {
    const e = evaluateGame([task(1, true), task(1, true), task(1, true)], { threshold: 3, minTasks: null });
    expect(e.result).toBe('W');
  });
});
