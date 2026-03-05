import { createDoctorSpecialtyResolver } from '../../../../data/doctor-specialties.js';

export function buildDoctorSpecialtyConfigSignature(settings) {
  const raw = settings?.doctors?.specialties;
  if (!raw || typeof raw !== 'object') {
    return 'disabled';
  }
  try {
    return JSON.stringify({
      enabled: raw.enabled !== false,
      strict: raw.strict !== false,
      excludeUnmappedFromStats: raw.excludeUnmappedFromStats === true,
      effectiveDateField: raw.effectiveDateField || 'arrival',
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    });
  } catch (_error) {
    return 'unserializable';
  }
}

export function getCachedDoctorSpecialtyModel(dashboardState, settings, records) {
  const cache = dashboardState?.doctorsSpecialtyModelCache || {};
  const configSignature = buildDoctorSpecialtyConfigSignature(settings);
  if (cache.recordsRef === records && cache.configSignature === configSignature && cache.model) {
    return cache.model;
  }
  const model = createDoctorSpecialtyResolver(settings, records);
  dashboardState.doctorsSpecialtyModelCache = {
    recordsRef: records,
    configSignature,
    model,
  };
  return model;
}

export function buildDoctorAnnualModelCacheKey(dashboardState, sharedOptions) {
  return JSON.stringify({
    year: sharedOptions?.yearFilter ?? 'all',
    topN: sharedOptions?.topN ?? 15,
    minCases: sharedOptions?.minCases ?? 30,
    sortBy: sharedOptions?.sortBy ?? 'volume_desc',
    arrivalFilter: sharedOptions?.arrivalFilter ?? 'all',
    dispositionFilter: sharedOptions?.dispositionFilter ?? 'all',
    shiftFilter: sharedOptions?.shiftFilter ?? 'all',
    specialtyFilter: sharedOptions?.specialtyFilter ?? 'all',
    searchQuery: sharedOptions?.searchQuery ?? '',
    annualMetric: dashboardState?.doctorsAnnualMetric ?? 'count',
    annualMinYearCount: dashboardState?.doctorsAnnualMinYearCount ?? 2,
    annualSelected: Array.isArray(dashboardState?.doctorsAnnualSelected)
      ? dashboardState.doctorsAnnualSelected
      : [],
  });
}

export function buildSpecialtyAnnualModelCacheKey(dashboardState, sharedOptions) {
  return JSON.stringify({
    year: sharedOptions?.yearFilter ?? 'all',
    topN: sharedOptions?.topN ?? 15,
    minCases: sharedOptions?.minCases ?? 30,
    sortBy: sharedOptions?.sortBy ?? 'volume_desc',
    arrivalFilter: sharedOptions?.arrivalFilter ?? 'all',
    dispositionFilter: sharedOptions?.dispositionFilter ?? 'all',
    shiftFilter: sharedOptions?.shiftFilter ?? 'all',
    specialtyFilter: sharedOptions?.specialtyFilter ?? 'all',
    searchQuery: sharedOptions?.searchQuery ?? '',
    specialtyAnnualMetric: dashboardState?.doctorsSpecialtyAnnualMetric ?? 'count',
    specialtyAnnualTopN: dashboardState?.doctorsSpecialtyAnnualTopN ?? 6,
    specialtyAnnualMinYearCount: dashboardState?.doctorsSpecialtyAnnualMinYearCount ?? 2,
    specialtyAnnualSelected: Array.isArray(dashboardState?.doctorsSpecialtyAnnualSelected)
      ? dashboardState.doctorsSpecialtyAnnualSelected
      : [],
  });
}

export function getCachedDoctorAnnualModel(dashboardState, records, sharedOptions, computeFn) {
  const key = buildDoctorAnnualModelCacheKey(dashboardState, sharedOptions);
  const cache = dashboardState?.doctorsAnnualModelCache || {};
  if (cache.recordsRef === records && cache.key === key && cache.model) {
    return cache.model;
  }
  const model = computeFn();
  dashboardState.doctorsAnnualModelCache = { recordsRef: records, key, model };
  return model;
}

export function getCachedDoctorSpecialtyAnnualModel(dashboardState, records, sharedOptions, computeFn) {
  const key = buildSpecialtyAnnualModelCacheKey(dashboardState, sharedOptions);
  const cache = dashboardState?.doctorsSpecialtyAnnualModelCache || {};
  if (cache.recordsRef === records && cache.key === key && cache.model) {
    return cache.model;
  }
  const model = computeFn();
  dashboardState.doctorsSpecialtyAnnualModelCache = { recordsRef: records, key, model };
  return model;
}

export function buildDoctorBaseModelsCacheKey(sharedOptions) {
  return JSON.stringify({
    year: sharedOptions?.yearFilter ?? 'all',
    topN: sharedOptions?.topN ?? 15,
    minCases: sharedOptions?.minCases ?? 30,
    sortBy: sharedOptions?.sortBy ?? 'volume_desc',
    arrivalFilter: sharedOptions?.arrivalFilter ?? 'all',
    dispositionFilter: sharedOptions?.dispositionFilter ?? 'all',
    shiftFilter: sharedOptions?.shiftFilter ?? 'all',
    specialtyFilter: sharedOptions?.specialtyFilter ?? 'all',
    requireMappedSpecialty: sharedOptions?.requireMappedSpecialty === true,
    searchQuery: sharedOptions?.searchQuery ?? '',
  });
}

export function getCachedDoctorBaseModels(dashboardState, records, sharedOptions, computeFn) {
  const key = buildDoctorBaseModelsCacheKey(sharedOptions);
  const cache = dashboardState?.doctorsBaseModelsCache || {};
  if (cache.recordsRef === records && cache.key === key && cache.models) {
    return cache.models;
  }
  const models = computeFn();
  dashboardState.doctorsBaseModelsCache = { recordsRef: records, key, models };
  return models;
}
