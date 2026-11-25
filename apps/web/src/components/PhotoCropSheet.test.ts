import { describe, expect, it } from 'vitest';
import { AVATAR_PX, centredCrop } from '../lib/avatar';
import { cropFor } from './PhotoCropSheet';

const photo = { naturalWidth: 4000, naturalHeight: 3000 };

/** Same square, give or take floating point. */
function expectCrop(actual: { x: number; y: number; side: number }, expected: { x: number; y: number; side: number }) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.side).toBeCloseTo(expected.side);
}

describe('cropping a team photo', () => {
  it('starts on the biggest centred square', () => {
    expect(centredCrop(photo)).toEqual({ x: 500, y: 0, side: 3000 });
    // The frame (280 px) shows the 3000 px side; centred means 500 px off each side.
    const scale = 280 / 3000;
    expectCrop(cropFor(photo, { zoom: 1, x: (280 - 4000 * scale) / 2, y: 0 }), { x: 500, y: 0, side: 3000 });
  });

  it('crops exactly what the frame shows when zoomed and moved', () => {
    // Zoomed 2×: the frame covers half the short side (1500 px). Moved to the top-left corner.
    expectCrop(cropFor(photo, { zoom: 2, x: 0, y: 0 }), { x: 0, y: 0, side: 1500 });
    // Moved 140 screen px right and down at 2× (186.67 px per 1000): 750 photo px in.
    const c = cropFor(photo, { zoom: 2, x: -140, y: -140 });
    expect(c.x).toBeCloseTo(750);
    expect(c.y).toBeCloseTo(750);
    expect(c.side).toBeCloseTo(1500);
  });

  it('uploads sharp enough for the Team page', () => {
    // Shown up to ~180 px; on a 3× screen that's 540 px.
    expect(AVATAR_PX).toBeGreaterThanOrEqual(512);
  });
});
