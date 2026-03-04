import {
  DEFAULT_ED_SOURCE_URL,
  DEFAULT_FOOTER_SOURCE,
  DEFAULT_KPI_WINDOW_DAYS,
  DEFAULT_PAGE_TITLE,
  TEXT,
} from './constants.js';

export const DEFAULT_SETTINGS = {
  dataSource: {
    // Pagrindinis operatyvinių duomenų šaltinis (Google Sheets → Publish to CSV)
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8xfS3FxpD5pT6rm-ClSf9DjV3usXjvJG4uKj7aC3_QtThtXidQZaN0ZQe9SEMOXB94XeLshwwLUSW/pub?gid=706041848&single=true&output=csv',
    feedback: {
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTr4ghdkkUJw5pYjb7nTDgoGdaTIUjLT7bD_8q05QyBNR4Z-tTVqhWMvXGemJUIneXyyUF_8-O-EftK/pub?gid=369777093&single=true&output=csv',
    },
    ed: {
      url: DEFAULT_ED_SOURCE_URL,
    },
    historical: {
      enabled: true,
      label: 'Papildomas istorinis (5 metai)',
      url: '',
      sources: [
        {
          label: '2021',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRpfCwv4WgdRbBkwYTJVcfxupkTFOsn6kLQjWOctyuagIFznO7uaoCfd056lmtFgftbA2SEQDV-vXy7/pub?gid=0&single=true&output=csv',
        },
        {
          label: '2022',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSPkr8xxCQk2lO5nZG1ohp5yibWpKUV07JzVuNFtkdzHcly_E3lc7SHiIRfSyGV_rtrH8M9Rx4VqUy9/pub?gid=0&single=true&output=csv',
        },
        {
          label: '2023',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQaOJnVCtJbgWwHlLFHeKnD9Qj9xbcQXWAC7lbyQ5vHjK4jr8ez0d1RdEiFtB1Fu82JI93Fnj5GtCRQ/pub?gid=0&single=true&output=csv',
        },
        {
          label: '2024',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSI3aD1EYfqN-6RHlzJv-XR8tWD2Dm_XyI4g57TQYqJ0q_39fBWe7twSeiWADPKz-PKkF1YzQt_KI9v/pub?gid=0&single=true&output=csv',
        },
        {
          label: '2025',
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSOtG7CuPVq_nYNTuhTnNiGnyzg93HK2JcPjYcuJ442EiMPz9HYXsBi1niQNj5Yzg/pub?gid=8931977&single=true&output=csv',
        },
      ],
    },
  },
  csv: {
    arrival: 'Atvykimo data',
    discharge: 'Išrašymo data',
    dayNight: 'Diena/naktis',
    gmp: 'GMP',
    department: 'Nukreiptas į padalinį',

    closingDoctor: 'Uždaręs gydytojas',
    age: 'Amžius',
    sex: 'Lytis',
    address: 'Adresas',
    pspc: 'PSPC įstaiga',
    diagnosis: 'Galutinės diagnozės',
    referral: 'Siuntimas',
    trueValues: '1,true,taip,t,yes,y,GMP,su GMP,GMP (su GMP)',
    hospitalizedValues: '',
    nightKeywords: 'nakt,night',
    dayKeywords: 'dien,ryt,vak,day',
  },
  calculations: {
    windowDays: DEFAULT_KPI_WINDOW_DAYS,
    recentDays: 7,
    nightStartHour: 20,
    nightEndHour: 7,
  },
  metrics: {
    enabledMetricIds: null,
    overrides: {},
  },
  output: {
    pageTitle: DEFAULT_PAGE_TITLE,
    title: TEXT.title,
    subtitle: TEXT.subtitle,
    kpiTitle: TEXT.kpis.title,
    kpiSubtitle: TEXT.kpis.subtitle,
    chartsTitle: TEXT.charts.title,
    chartsSubtitle: TEXT.charts.subtitle,
    recentTitle: TEXT.recent.title,
    recentSubtitle: TEXT.recent.subtitle,
    monthlyTitle: TEXT.monthly.title,
    monthlySubtitle: TEXT.monthly.subtitle,
    yearlyTitle: TEXT.yearly.title,
    yearlySubtitle: TEXT.yearly.subtitle,
    feedbackTitle: TEXT.feedback.title,
    feedbackSubtitle: TEXT.feedback.subtitle,
    feedbackDescription: TEXT.feedback.description,
    feedbackTrendTitle: TEXT.feedback.trend.title,
    footerSource: DEFAULT_FOOTER_SOURCE,
    scrollTopLabel: TEXT.scrollTop,
    tabOverviewLabel: TEXT.tabs.overview,
    tabEdLabel: TEXT.tabs.ed,
    edTitle: TEXT.ed.title,
    showRecent: true,
    showMonthly: true,
    showYearly: true,
    showFeedback: true,
  },
};
