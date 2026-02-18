import { describe, expect, it } from 'vitest';
import {
  buildDailyWindowKeys,
  filterDailyStatsByWindow,
  filterRecordsByWindow,
} from '../../src/app/runtime/chart-primitives.js';

describe('chart primitives window helpers', () => {
  it('filters daily stats by latest valid UTC window', () => {
    const dailyStats = [
      { date: 'bad-date', count: 99 },
      { date: '2026-01-01', count: 1 },
      { date: '2026-01-03', count: 3 },
      { date: '2026-01-02', count: 2 },
    ];

    const result = filterDailyStatsByWindow(dailyStats, 2);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.date).sort()).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('filters records by latest window using arrival/discharge fallback', () => {
    const first = { arrival: new Date('2026-01-01T08:00:00') };
    const second = { discharge: new Date('2026-01-02T10:00:00') };
    const third = { arrival: new Date('2026-01-03T12:00:00') };
    const invalid = { arrival: null, discharge: null };

    const result = filterRecordsByWindow([first, invalid, second, third], 2);

    expect(result).toEqual([second, third]);
  });

  it('builds complete daily keys window from latest valid date', () => {
    const keys = buildDailyWindowKeys(
      [{ date: 'invalid' }, { date: '2026-01-02' }, { date: '2026-01-05' }],
      3
    );
    expect(keys).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
  });
});
