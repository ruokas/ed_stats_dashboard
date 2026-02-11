import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from '../../src/data/csv.js';

describe('detectDelimiter', () => {
  it('parenka taska-kabliataski kaip skirtuka', () => {
    const text = 'name;age;city\nJonas;34;Vilnius';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('ignoruoja skirtukus kabutese', () => {
    const text = 'name,comment\nJonas,"a,b,c"';
    expect(detectDelimiter(text)).toBe(',');
  });
});

describe('parseCsv', () => {
  it('parses rows with quoted cells and escaped quotes', () => {
    const text = 'name,comment\nJonas,"Labas, ""pasauli"""';
    const parsed = parseCsv(text);
    expect(parsed.delimiter).toBe(',');
    expect(parsed.rows).toEqual([
      ['name', 'comment'],
      ['Jonas', 'Labas, "pasauli"'],
    ]);
  });

  it('filters out empty rows', () => {
    const text = 'a,b\n1,2\n\n';
    const parsed = parseCsv(text);
    expect(parsed.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
