import { describe, expect, test } from 'vitest';
import {
  buildDoctorPageQuery,
  getDoctorPageStateFromQuery,
} from '../../src/app/runtime/runtimes/gydytojai-runtime-impl.js';

describe('gydytojai runtime query helpers', () => {
  test('parses valid query values', () => {
    const state = getDoctorPageStateFromQuery(
      '?y=2025&top=20&min=40&sort=avgLos_desc&arr=ems&disp=hospitalized&shift=night&sp=resident&q=jon&tsort=losGt16Share_asc&am=nightShare&as=yoy_up&ad=Jonas, Ona&sam=losGroups&sas=yoy_down&sase=emergency_doctor,surgery&ga=specialty&gfa=1&gse=results,annual,charts'
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
    expect(state.specialtyAnnualMetric).toBe('losGroups');
    expect(state.specialtyAnnualSort).toBe('yoy_down');
    expect(state.specialtyAnnualSelected).toEqual(['emergency_doctor', 'surgery']);
    expect(state.gydytojaiAnnualSubview).toBe('specialty');
    expect(state.gydytojaiFiltersAdvancedExpanded).toBe(true);
    expect(state.gydytojaiSectionExpanded).toEqual(['results', 'annual', 'charts']);
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
    expect(parsed.specialtyAnnualMetric).toBe('count');
    expect(parsed.specialtyAnnualSort).toBe('latest_desc');
    expect(parsed.specialtyAnnualSelected).toEqual([]);
    expect(parsed.gydytojaiAnnualSubview).toBe('doctor');
    expect(parsed.gydytojaiFiltersAdvancedExpanded).toBe(false);
    expect(parsed.gydytojaiSectionExpanded).toEqual([]);

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
      specialtyAnnualMetric: 'count',
      specialtyAnnualSort: 'latest_desc',
      specialtyAnnualSelected: [],
      gydytojaiAnnualSubview: 'doctor',
      gydytojaiFiltersAdvancedExpanded: false,
      gydytojaiSectionExpanded: ['results'],
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
      specialtyAnnualMetric: 'losGroups',
      specialtyAnnualSort: 'yoy_down',
      specialtyAnnualSelected: ['emergency_doctor', 'surgery'],
      gydytojaiAnnualSubview: 'specialty',
      gydytojaiFiltersAdvancedExpanded: true,
      gydytojaiSectionExpanded: ['results', 'annual', 'charts'],
    });
    expect(annualQuery).toContain('am=nightShare');
    expect(annualQuery).toContain('as=yoy_up');
    expect(annualQuery).toContain('sp=resident');
    expect(annualQuery).toContain('ad=Jonas%2COna');
    expect(annualQuery).toContain('sam=losGroups');
    expect(annualQuery).toContain('sas=yoy_down');
    expect(annualQuery).toContain('sase=emergency_doctor%2Csurgery');
    expect(annualQuery).toContain('ga=specialty');
    expect(annualQuery).toContain('gfa=1');
    expect(annualQuery).toContain('gse=results%2Cannual%2Ccharts');
  });
});
