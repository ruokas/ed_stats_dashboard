import { describe, expect, test } from 'vitest';
import {
  buildDoctorPageQuery,
  getDoctorPageStateFromQuery,
} from '../../src/app/runtime/runtimes/gydytojai-runtime-legacy.js';

describe('gydytojai runtime query helpers', () => {
  test('parses valid query values', () => {
    const state = getDoctorPageStateFromQuery(
      '?y=2025&top=20&min=40&sort=avgLos_desc&doc=Jonas&arr=ems&disp=hospitalized&shift=night&diag=I&q=jon&tsort=alias_asc'
    );
    expect(state.year).toBe('2025');
    expect(state.topN).toBe(20);
    expect(state.minCases).toBe(40);
    expect(state.sort).toBe('avgLos_desc');
    expect(state.arrival).toBe('ems');
    expect(state.disposition).toBe('hospitalized');
    expect(state.shift).toBe('night');
    expect(state.tableSort).toBe('alias_asc');
  });

  test('builds compact query and falls back on invalid values', () => {
    const parsed = getDoctorPageStateFromQuery('?top=-1&arr=bad&disp=x&shift=x&sort=bad&tsort=bad');
    expect(parsed.topN).toBe(15);
    expect(parsed.arrival).toBe('all');
    expect(parsed.disposition).toBe('all');
    expect(parsed.shift).toBe('all');
    expect(parsed.sort).toBe('volume_desc');
    expect(parsed.tableSort).toBe('count_desc');

    const query = buildDoctorPageQuery({
      year: '2025',
      topN: 15,
      minCases: 30,
      sort: 'volume_desc',
      doctor: '__top3__',
      arrival: 'all',
      disposition: 'all',
      shift: 'all',
      diagnosis: 'all',
      search: '',
      tableSort: 'count_desc',
    });
    expect(query).toBe('?y=2025');
  });
});
