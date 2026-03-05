export const HOURLY_WEEKDAY_ALL = 'all';
export const HOURLY_STAY_BUCKET_ALL = 'all';
export const HOURLY_METRIC_ARRIVALS = 'arrivals';
export const HOURLY_METRIC_DISCHARGES = 'discharges';
export const HOURLY_METRIC_BALANCE = 'balance';
export const HOURLY_METRIC_HOSPITALIZED = 'hospitalized';
export const HOURLY_METRICS = [
  HOURLY_METRIC_ARRIVALS,
  HOURLY_METRIC_DISCHARGES,
  HOURLY_METRIC_BALANCE,
  HOURLY_METRIC_HOSPITALIZED,
];
export const HOURLY_COMPARE_SERIES_ALL = 'all';
export const HOURLY_COMPARE_SERIES_EMS = 'ems';
export const HOURLY_COMPARE_SERIES_SELF = 'self';
export const HOURLY_COMPARE_SERIES = [
  HOURLY_COMPARE_SERIES_ALL,
  HOURLY_COMPARE_SERIES_EMS,
  HOURLY_COMPARE_SERIES_SELF,
];
export const HOURLY_STAY_BUCKETS = [
  { key: 'lt4', min: 0, max: 4 },
  { key: '4to8', min: 4, max: 8 },
  { key: '8to16', min: 8, max: 16 },
  { key: 'gt16', min: 16, max: Number.POSITIVE_INFINITY },
];
