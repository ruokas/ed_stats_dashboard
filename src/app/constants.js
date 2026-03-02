import { TEXT } from './constants/text.js';

export const DEFAULT_ED_SOURCE_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTx5aS_sRmpVE78hB57h6J2C2r3OQAKm4T2qoC4JBfY7hFm97prfSajgtQHzitrcqzQx5GZefyEY2vR/pub?gid=715561082&single=true&output=csv';
export const ED_TOTAL_BEDS = 29;
export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;
export const FEEDBACK_LEGACY_MAX = 10;
export const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
export const DEFAULT_FOOTER_SOURCE = '';
export const DEFAULT_KPI_WINDOW_DAYS = 365;
export const DEFAULT_PAGE_TITLE = (typeof document !== 'undefined' && document?.title) || 'ED statistika';
export const THEME_STORAGE_KEY = 'edDashboardTheme';
export const CLIENT_CONFIG_KEY = 'edDashboardClientConfig-v1';

export { TEXT };
