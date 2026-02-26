import { describe, expect, it } from 'vitest';
import { validateHospitalConfig } from '../../scripts/check-hospital-config.mjs';

function buildValidConfig() {
  return {
    dataSource: {
      url: 'https://example.org/main.csv',
      feedback: { url: 'https://example.org/feedback.csv' },
      ed: { url: 'https://example.org/ed.csv' },
      historical: { enabled: false, label: 'Istorinis', url: '' },
    },
    csv: {
      arrival: 'Arrival',
      discharge: 'Discharge',
      dayNight: '',
      gmp: 'EMS',
      department: 'Department',
      number: 'Visit ID',
      closingDoctor: 'Doctor',
    },
    calculations: {
      windowDays: 365,
      recentDays: 7,
    },
    output: {
      pageTitle: 'ED statistika',
      title: 'ED statistika',
      subtitle: 'Greita statistikos apžvalga.',
    },
  };
}

describe('check-hospital-config validator', () => {
  it('accepts a valid minimal config and returns warnings for recommended fields', () => {
    const result = validateHospitalConfig(buildValidConfig());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((item) => item.includes('csv.dayNight'))).toBe(true);
  });

  it('reports missing required URLs and CSV mappings', () => {
    const invalid = buildValidConfig();
    invalid.dataSource.url = '';
    invalid.csv.arrival = ' ';
    const result = validateHospitalConfig(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes('dataSource.url'))).toBe(true);
    expect(result.errors.some((item) => item.includes('csv.arrival'))).toBe(true);
  });

  it('reports placeholder values and invalid calculation ranges', () => {
    const invalid = buildValidConfig();
    invalid.dataSource.ed.url = '<PASTE_ED_CSV_URL>';
    invalid.calculations.windowDays = 3;
    const result = validateHospitalConfig(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes('dataSource.ed.url'))).toBe(true);
    expect(result.errors.some((item) => item.includes('calculations.windowDays'))).toBe(true);
    expect(result.errors.some((item) => item.includes('rasta laikina reikšmė'))).toBe(true);
  });
});
