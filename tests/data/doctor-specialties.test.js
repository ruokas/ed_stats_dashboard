import { describe, expect, test } from 'vitest';
import { createDoctorSpecialtyResolver } from '../../src/data/doctor-specialties.js';

function createRecord(doctorNorm, arrival) {
  return {
    closingDoctorNorm: doctorNorm,
    arrival: arrival ? new Date(arrival) : null,
  };
}

function createSettings(overrides = {}) {
  return {
    doctors: {
      specialties: {
        enabled: true,
        strict: true,
        effectiveDateField: 'arrival',
        groups: [
          { id: 'resident', label: 'Resident' },
          { id: 'emergency', label: 'Emergency' },
        ],
        assignments: [
          {
            doctorNorm: 'jonas jonaitis',
            periods: [
              { from: '2024-01-01', to: '2024-12-31', specialtyId: 'resident' },
              { from: '2025-01-01', to: null, specialtyId: 'emergency' },
            ],
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('doctor specialties resolver', () => {
  test('resolves date-effective specialty by arrival date', () => {
    const { resolver, validation } = createDoctorSpecialtyResolver(createSettings(), [
      createRecord('jonas jonaitis', '2024-06-01T10:00:00'),
      createRecord('jonas jonaitis', '2025-06-01T10:00:00'),
    ]);

    expect(validation.valid).toBe(true);
    expect(resolver.resolveSpecialtyForRecord(createRecord('jonas jonaitis', '2024-12-31T23:00:00'))).toEqual(
      {
        id: 'resident',
        label: 'Resident',
      }
    );
    expect(resolver.resolveSpecialtyForRecord(createRecord('jonas jonaitis', '2025-01-01T00:00:00'))).toEqual(
      {
        id: 'emergency',
        label: 'Emergency',
      }
    );
  });

  test('rejects overlapping periods', () => {
    const settings = createSettings({
      doctors: {
        specialties: {
          enabled: true,
          strict: true,
          effectiveDateField: 'arrival',
          groups: [
            { id: 'resident', label: 'Resident' },
            { id: 'emergency', label: 'Emergency' },
          ],
          assignments: [
            {
              doctorNorm: 'jonas jonaitis',
              periods: [
                { from: '2024-01-01', to: '2024-12-31', specialtyId: 'resident' },
                { from: '2024-12-31', to: null, specialtyId: 'emergency' },
              ],
            },
          ],
        },
      },
    });
    const { validation } = createDoctorSpecialtyResolver(settings, []);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('persidengia');
  });

  test('reports unmapped records in strict mode', () => {
    const { validation } = createDoctorSpecialtyResolver(createSettings(), [
      createRecord('ona onaite', '2025-06-01T10:00:00'),
    ]);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('Nepriskirtų įrašų');
  });

  test('ignores placeholder periods and can allow unmapped coverage when excluded from stats', () => {
    const settings = createSettings({
      doctors: {
        specialties: {
          enabled: true,
          strict: true,
          excludeUnmappedFromStats: true,
          effectiveDateField: 'arrival',
          groups: [
            { id: 'resident', label: 'Resident' },
            { id: 'emergency', label: 'Emergency' },
          ],
          assignments: [
            {
              doctorNorm: 'jonas jonaitis',
              periods: [
                { from: '2024-01-01', to: null, specialtyId: '__SET_SPECIALTY_ID__' },
                { from: '2025-01-01', to: null, specialtyId: 'emergency' },
              ],
            },
          ],
        },
      },
    });
    const { validation } = createDoctorSpecialtyResolver(settings, [
      createRecord('jonas jonaitis', '2025-06-01T10:00:00'),
      createRecord('ona onaite', '2025-06-01T10:00:00'),
    ]);
    expect(validation.valid).toBe(true);
    expect(validation.excludeUnmappedFromStats).toBe(true);
  });
});
