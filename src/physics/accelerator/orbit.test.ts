import { describe, expect, it } from 'vitest';
import { closedOrbitOffset, isBeamLost, momentumDeviation } from './orbit';

describe('closed orbit and beam loss', () => {
  it('a 0.5 % momentum error with 2 m dispersion shifts the orbit by 10 mm', () => {
    const delta = momentumDeviation(1005, 1000);
    expect(delta).toBeCloseTo(0.005, 9);
    expect(closedOrbitOffset(delta, 2)).toBeCloseTo(0.01, 9);
  });

  it('the beam survives inside the aperture and is lost outside it', () => {
    expect(isBeamLost(0.01, 0.017)).toBe(false);
    expect(isBeamLost(-0.02, 0.017)).toBe(true);
  });
});
