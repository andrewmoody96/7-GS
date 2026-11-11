import { afterEach, describe, expect, it } from 'vitest';
import { activeTheme, applyTheme, AVAILABLE_THEMES, vocab } from './vocab';

afterEach(() => {
  applyTheme('baseball');
});

describe('sport themes', () => {
  it('offers all three sports', () => {
    expect(AVAILABLE_THEMES).toEqual(['baseball', 'basketball', 'hockey']);
  });

  it('swaps every word in place and marks the page for its colors', () => {
    applyTheme('hockey');
    expect(activeTheme()).toBe('hockey');
    expect(vocab.term.required).toBe('Must-score');
    expect(vocab.terms.runsShort).toBe('G');
    expect(vocab.runs(2)).toBe('2 shots');
    expect(document.documentElement.dataset.sport).toBe('hockey');
    expect(vocab.flavor.management).toBe('Coaching');
    applyTheme('basketball');
    expect(vocab.term.required).toBe('Must-make');
    expect(vocab.flavor.management).toBe('Coaching');
    expect(vocab.jumbotron.walkOff).toBe('Buzzer beater');
    applyTheme('baseball');
    expect(vocab.term.required).toBe('Must-hit');
    expect(vocab.jumbotron.walkOff).toBe('Walk-off W');
    expect(vocab.flavor.management).toBe('Management');
  });

  it('calls every loss just a loss', () => {
    for (const theme of AVAILABLE_THEMES) {
      applyTheme(theme);
      const labels = [...Object.values(vocab.resultDetail), ...Object.values(vocab.resultDetailShort)];
      expect(labels.filter((l) => /forfeit/i.test(l))).toEqual([]);
    }
    applyTheme('baseball');
    for (const theme of AVAILABLE_THEMES) {
      applyTheme(theme);
      for (const detail of ['short', 'forfeit', 'no_appeal'] as const) {
        expect(vocab.resultDetail[detail]).toBe('Loss');
        expect(vocab.resultDetailShort[detail]).toBe('');
      }
    }
    applyTheme('baseball');
  });
});
