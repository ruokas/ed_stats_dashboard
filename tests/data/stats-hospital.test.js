import { describe, expect, it } from 'vitest';

import {
  computeHospitalizedByDepartmentAndSpsStay,
  computeHospitalizedDepartmentYearlyStayTrend,
} from '../../src/data/stats-hospital.js';

describe('stats-hospital shift date aggregation', () => {
  it('attributes pre-shift arrivals to the previous shift day and year', () => {
    const records = [
      {
        arrival: new Date('2025-01-01T03:15:00'),
        discharge: new Date('2025-01-01T06:00:00'),
        department: 'Terapija',
        hospitalized: true,
      },
    ];

    const result = computeHospitalizedByDepartmentAndSpsStay(records, {
      calculations: {},
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });

    expect(result.yearOptions).toEqual([2024]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        department: 'Terapija',
        count_lt4: 1,
        total: 1,
        pct_lt4: 100,
      }),
    ]);
  });

  it('builds yearly stay trend rows for the selected department', () => {
    const records = [
      {
        arrival: new Date('2025-02-10T09:00:00'),
        discharge: new Date('2025-02-10T14:30:00'),
        department: 'Chirurgija',
        hospitalized: true,
      },
      {
        arrival: new Date('2026-02-10T09:00:00'),
        discharge: new Date('2026-02-10T18:30:00'),
        department: 'Chirurgija',
        hospitalized: true,
      },
    ];

    const trend = computeHospitalizedDepartmentYearlyStayTrend(records, {
      department: 'Chirurgija',
      calculations: { shiftStartHour: 7 },
      defaultSettings: { calculations: { nightEndHour: 7 } },
    });

    expect(trend.rows).toEqual([
      expect.objectContaining({ year: 2025, count_4_8: 1, total: 1, pct_4_8: 100 }),
      expect.objectContaining({ year: 2026, count_8_16: 1, total: 1, pct_8_16: 100 }),
    ]);
  });
});
