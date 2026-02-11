export const KPI_WINDOW_OPTION_BASE = [7, 14, 30, 60, 90, 180, 365];

export const KPI_FILTER_LABELS = {
  shift: {
    all: 'visos pamainos',
    day: 'dieninės pamainos',
    night: 'naktinės pamainos',
  },
  arrival: {
    all: 'visi atvykimai',
    ems: 'tik GMP',
    self: 'be GMP',
  },
  disposition: {
    all: 'visos būsenos',
    hospitalized: 'hospitalizuoti',
    discharged: 'išleisti',
  },
  cardType: {
    all: 'visos kortelės',
    t: 'T kortelės',
    tr: 'TR kortelės',
    ch: 'CH kortelės',
  },
};

export const KPI_FILTER_TOGGLE_LABELS = {
  show: 'Išskleisti filtrus',
  hide: 'Sutraukti filtrus',
};

export const FEEDBACK_FILTER_ALL = 'all';
export const FEEDBACK_FILTER_MISSING = '__missing__';

export function createDefaultKpiFilters({ settings, DEFAULT_SETTINGS, DEFAULT_KPI_WINDOW_DAYS }) {
  const configuredWindow = Number.isFinite(Number(settings?.calculations?.windowDays))
    ? Number(settings.calculations.windowDays)
    : DEFAULT_SETTINGS.calculations.windowDays;
  const defaultWindow =
    Number.isFinite(configuredWindow) && configuredWindow > 0 ? configuredWindow : DEFAULT_KPI_WINDOW_DAYS;
  return {
    window: defaultWindow,
    shift: 'all',
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
  };
}

export function createDefaultChartFilters() {
  return {
    arrival: 'all',
    disposition: 'all',
    cardType: 'all',
    compareGmp: false,
  };
}

export function createDefaultFeedbackFilters() {
  return {
    respondent: FEEDBACK_FILTER_ALL,
    location: FEEDBACK_FILTER_ALL,
  };
}
