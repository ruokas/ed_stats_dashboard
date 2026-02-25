import { describe, expect, test } from 'vitest';
import {
  buildDoctorPageQuery,
  getDoctorPageStateFromQuery,
} from '../../src/app/runtime/runtimes/gydytojai-runtime-impl.js';

describe('gydytojai runtime query helpers', () => {
  test('parses valid query values', () => {
    const state = getDoctorPageStateFromQuery(
      '?y=2025&top=20&min=40&sort=avgLos_desc&arr=ems&disp=hospitalized&shift=night&sp=resident&q=jon&tsort=losGt16Share_asc&am=nightShare&as=yoy_up&ad=Jonas, Ona'
    );
    expect(state.year).toBe('2025');
    expect(state.topN).toBe(20);
    expect(state.minCases).toBe(40);
    expect(state.sort).toBe('avgLos_desc');
    expect(state.arrival).toBe('ems');
    expect(state.disposition).toBe('hospitalized');
    expect(state.shift).toBe('night');
    expect(state.specialty).toBe('resident');
    expect(state.tableSort).toBe('losGt16Share_asc');
    expect(state.annualMetric).toBe('nightShare');
    expect(state.annualSort).toBe('yoy_up');
    expect(state.annualDoctors).toEqual(['Jonas', 'Ona']);
  });

  test('builds compact query and falls back on invalid values', () => {
    const parsed = getDoctorPageStateFromQuery('?top=-1&arr=bad&disp=x&shift=x&sort=bad&tsort=bad');
    expect(parsed.topN).toBe(15);
    expect(parsed.arrival).toBe('all');
    expect(parsed.disposition).toBe('all');
    expect(parsed.shift).toBe('all');
    expect(parsed.sort).toBe('volume_desc');
    expect(parsed.tableSort).toBe('count_desc');
    expect(parsed.annualMetric).toBe('count');
    expect(parsed.annualSort).toBe('latest_desc');
    expect(parsed.annualDoctors).toEqual([]);

    const query = buildDoctorPageQuery({
      year: '2025',
      topN: 15,
      minCases: 30,
      sort: 'volume_desc',
      arrival: 'all',
      disposition: 'all',
      shift: 'all',
      specialty: 'all',
      search: '',
      tableSort: 'count_desc',
      annualMetric: 'count',
      annualSort: 'latest_desc',
      annualDoctors: [],
    });
    expect(query).toBe('?y=2025');

    const annualQuery = buildDoctorPageQuery({
      year: 'all',
      topN: 15,
      minCases: 30,
      sort: 'volume_desc',
      arrival: 'all',
      disposition: 'all',
      shift: 'all',
      specialty: 'resident',
      search: '',
      tableSort: 'count_desc',
      annualMetric: 'nightShare',
      annualSort: 'yoy_up',
      annualDoctors: ['Jonas', 'Ona'],
    });
    expect(annualQuery).toContain('am=nightShare');
    expect(annualQuery).toContain('as=yoy_up');
    expect(annualQuery).toContain('sp=resident');
    expect(annualQuery).toContain('ad=Jonas%2COna');
  });
});
