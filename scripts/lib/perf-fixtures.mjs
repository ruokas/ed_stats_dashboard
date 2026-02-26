function createRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)] || values[0];
}

function shuffle(rng, values) {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const PERF_PROFILES = Object.freeze({
  small: { records: 10000, seed: 2026022601 },
  medium: { records: 50000, seed: 2026022602 },
  large: { records: 100000, seed: 2026022603 },
  wideCardinality: { records: 50000, seed: 2026022604, wideCardinality: true },
  historicalHeavy: { records: 60000, seed: 2026022605, historicalRatio: 0.85 },
});

export function resolvePerfProfile(name) {
  const key = String(name || '').trim();
  return PERF_PROFILES[key] || PERF_PROFILES.medium;
}

function buildDoctorNames(count) {
  return Array.from({ length: count }, (_, index) => `gydytojas_${String(index + 1).padStart(2, '0')}`);
}

function buildDepartments(count) {
  const base = [
    'Chirurgija',
    'Vidaus ligos',
    'Kardiologija',
    'Neurologija',
    'Ortopedija',
    'Pediatrija',
    'Infekcinės ligos',
    'Pulmonologija',
    'Urologija',
    'Ginekologija',
    'Toksikologija',
    'Oftalmologija',
    'Otorinolaringologija',
    'Nefrologija',
    'Endokrinologija',
  ];
  if (count <= base.length) return base.slice(0, count);
  return base.concat(
    Array.from({ length: count - base.length }, (_, index) => `Skyrius ${String(index + 1).padStart(2, '0')}`)
  );
}

function buildPspcList(count) {
  const cities = ['Vilniaus', 'Kauno', 'Klaipėdos', 'Šiaulių', 'Panevėžio', 'Alytaus'];
  const suffixes = ['miesto PSPC', 'rajono PSPC', 'poliklinika', 'klinika'];
  return Array.from({ length: count }, (_, index) => {
    const city = cities[index % cities.length];
    const suffix = suffixes[index % suffixes.length];
    return `${city} ${suffix} ${index + 1}`;
  });
}

function buildDiagnosisCodes() {
  return [
    'I10',
    'I20',
    'J18',
    'J06',
    'K52',
    'N39',
    'S09',
    'S72',
    'R10',
    'R07',
    'A09',
    'E11',
    'G44',
    'M54',
    'Z76.9',
  ];
}

function toAgeBand(age) {
  if (!Number.isFinite(age)) return 'unknown';
  if (age <= 17) return '0-17';
  if (age <= 34) return '18-34';
  if (age <= 49) return '35-49';
  if (age <= 64) return '50-64';
  if (age <= 79) return '65-79';
  return '80+';
}

function toDiagnosisGroup(code) {
  return (
    String(code || '')
      .trim()
      .toUpperCase()
      .charAt(0) || 'N'
  );
}

function buildSpecialtySettings(doctorNorms = []) {
  const groups = [
    { id: 'int', label: 'Vidaus ligos' },
    { id: 'surg', label: 'Chirurgija' },
    { id: 'neuro', label: 'Neurologija' },
    { id: 'card', label: 'Kardiologija' },
    { id: 'ped', label: 'Pediatrija' },
    { id: 'misc', label: 'Kitos' },
  ];
  const specialtyIds = groups.map((group) => group.id);
  const assignments = doctorNorms.map((doctorNorm, index) => ({
    doctorNorm,
    periods: [{ from: '2022-01-01', to: null, specialtyId: specialtyIds[index % specialtyIds.length] }],
  }));
  return {
    doctors: {
      specialties: {
        enabled: true,
        strict: false,
        excludeUnmappedFromStats: false,
        effectiveDateField: 'arrival',
        groups,
        assignments,
      },
    },
  };
}

export function createSyntheticRecords({
  count = 50000,
  seed = 20260226,
  departmentCount = 18,
  pspcCount = 40,
  doctorCount = 36,
  historicalRatio = 0.35,
  wideCardinality = false,
} = {}) {
  const rng = createRng(seed);
  const doctors = buildDoctorNames(wideCardinality ? Math.max(doctorCount, 64) : doctorCount);
  const departments = buildDepartments(wideCardinality ? Math.max(departmentCount, 40) : departmentCount);
  const pspcList = buildPspcList(wideCardinality ? Math.max(pspcCount, 140) : pspcCount);
  const diagnosisCodes = buildDiagnosisCodes();
  const diagnosisGroups = Array.from(new Set(diagnosisCodes.map(toDiagnosisGroup)));
  const cities = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Alytus'];
  const cardTypes = ['t', 'tr', 'ch'];
  const baseUtc = Date.UTC(2023, 0, 1, 0, 0, 0);
  const records = [];

  for (let index = 0; index < count; index += 1) {
    const dayOffset = Math.floor(rng() * 1150);
    const hour = Math.floor(rng() * 24);
    const minute = Math.floor(rng() * 60);
    const arrivalMs = baseUtc + dayOffset * 24 * 3600000 + hour * 3600000 + minute * 60000;
    const losHours = Math.max(0.2, Math.min(30, 0.3 + rng() * 18 + (rng() > 0.9 ? rng() * 8 : 0)));
    const dischargeMs = arrivalMs + Math.round(losHours * 3600000);
    const codeA = pick(rng, diagnosisCodes);
    const maybeSecond = rng() > 0.7 ? pick(rng, diagnosisCodes) : null;
    const codes = maybeSecond && maybeSecond !== codeA ? [codeA, maybeSecond] : [codeA];
    const age = Math.floor(rng() * 101);
    const doctorNorm = pick(rng, doctors);
    const department = pick(rng, departments);
    const ems = rng() > 0.52;
    const hospitalized = rng() > 0.68;
    const referral = rng() > 0.58 ? 'su siuntimu' : 'be siuntimo';
    const sourceId = rng() < historicalRatio ? 'historical' : 'main';
    const sexRoll = rng();
    const sex = sexRoll < 0.48 ? 'female' : sexRoll < 0.96 ? 'male' : 'other';
    const night = hour < 7 || hour >= 19;

    records.push({
      sourceId,
      hasExtendedHistoricalFields: sourceId === 'historical' || rng() > 0.05,
      arrival: new Date(arrivalMs),
      discharge: new Date(dischargeMs),
      hospitalized,
      ems,
      referral,
      night,
      cardType: pick(rng, cardTypes),
      department,
      number: String(100000 + index),
      gmp: ems ? 'GMP' : 'Ne GMP',
      closingDoctorNorm: doctorNorm,
      closingDoctorRaw: doctorNorm.replaceAll('_', ' '),
      diagnosisCodes: codes,
      diagnosisGroups: Array.from(new Set(codes.map(toDiagnosisGroup))),
      diagnosisGroup: pick(rng, diagnosisGroups),
      pspc: pick(rng, pspcList),
      age,
      ageBand: toAgeBand(age),
      sex,
      addressArea: rng() > 0.3 ? 'Miestas' : 'Rajonas',
      cityNorm: pick(rng, cities),
      cityRaw: pick(rng, cities),
      year: new Date(arrivalMs).getFullYear(),
    });
  }

  return {
    records,
    meta: {
      doctors,
      departments,
      pspcList,
      diagnosisCodes,
      specialtySettings: buildSpecialtySettings(doctors),
      summary: {
        count,
        departmentCount: departments.length,
        pspcCount: pspcList.length,
        doctorCount: doctors.length,
        historicalRatio,
        wideCardinality,
      },
    },
  };
}

export function createFixtureFromProfile(profileName, overrides = {}) {
  const profile = resolvePerfProfile(profileName);
  return createSyntheticRecords({
    count: profile.records,
    seed: profile.seed,
    historicalRatio: profile.historicalRatio ?? 0.35,
    wideCardinality: profile.wideCardinality === true,
    ...overrides,
  });
}

export function listPerfProfileNames() {
  return Object.keys(PERF_PROFILES);
}

export function shuffleWithSeed(values, seed = 20260226) {
  return shuffle(createRng(seed), values);
}
