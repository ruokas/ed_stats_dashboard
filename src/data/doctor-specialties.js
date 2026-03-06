function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const SPECIALTY_PLACEHOLDER_ID = '__SET_SPECIALTY_ID__';
const compiledSettingsCache = new WeakMap();
const validatedResolverCache = new WeakMap();

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareDateKeys(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function summarizeMessages(messages, limit = 8) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= limit) {
    return list;
  }
  return [...list.slice(0, limit), `… ir dar ${list.length - limit} klaidų.`];
}

function normalizeSpecialtyConfig(settings) {
  const raw = settings?.doctors?.specialties;
  if (!isPlainObject(raw) || raw.enabled === false) {
    return {
      enabled: false,
      strict: false,
      excludeUnmappedFromStats: false,
      effectiveDateField: 'arrival',
      groups: [],
      assignments: [],
    };
  }
  return {
    enabled: true,
    strict: raw.strict !== false,
    excludeUnmappedFromStats: raw.excludeUnmappedFromStats === true,
    effectiveDateField: toTrimmedString(raw.effectiveDateField) || 'arrival',
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
  };
}

function validateAndCompileGroups(groupsInput) {
  const errors = [];
  const groups = [];
  const byId = new Map();
  groupsInput.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`Specialybių grupė #${index + 1} turi būti objektas.`);
      return;
    }
    const id = toTrimmedString(entry.id);
    const label = toTrimmedString(entry.label);
    if (!id) {
      errors.push(`Specialybių grupė #${index + 1} neturi id.`);
      return;
    }
    if (!label) {
      errors.push(`Specialybių grupė "${id}" neturi label.`);
      return;
    }
    if (byId.has(id)) {
      errors.push(`Dubliuotas specialybės id "${id}".`);
      return;
    }
    const normalized = { id, label };
    byId.set(id, normalized);
    groups.push(normalized);
  });
  return { groups, groupsById: byId, errors };
}

function validateAndCompileAssignments(assignmentsInput, groupsById) {
  const errors = [];
  const assignmentsByDoctor = new Map();

  assignmentsInput.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`Priskyrimas #${index + 1} turi būti objektas.`);
      return;
    }
    const doctorNorm = toTrimmedString(entry.doctorNorm);
    if (!doctorNorm) {
      errors.push(`Priskyrimas #${index + 1} neturi doctorNorm.`);
      return;
    }
    if (assignmentsByDoctor.has(doctorNorm)) {
      errors.push(`Dubliuotas doctorNorm "${doctorNorm}" priskyrimuose.`);
      return;
    }
    const rawPeriods = Array.isArray(entry.periods) ? entry.periods : [];
    if (!rawPeriods.length) {
      errors.push(`Gydytojas "${doctorNorm}" neturi periods įrašų.`);
      return;
    }

    const periods = [];
    rawPeriods.forEach((period, periodIndex) => {
      if (!isPlainObject(period)) {
        errors.push(`Gydytojo "${doctorNorm}" periodas #${periodIndex + 1} turi būti objektas.`);
        return;
      }
      const from = toTrimmedString(period.from);
      const toRaw = period.to == null ? null : toTrimmedString(period.to);
      const specialtyId = toTrimmedString(period.specialtyId);
      if (!specialtyId || specialtyId === SPECIALTY_PLACEHOLDER_ID) {
        return;
      }
      if (!isIsoDateKey(from)) {
        errors.push(`Gydytojo "${doctorNorm}" periodas #${periodIndex + 1} turi neteisingą from datą.`);
        return;
      }
      if (toRaw != null && !isIsoDateKey(toRaw)) {
        errors.push(`Gydytojo "${doctorNorm}" periodas #${periodIndex + 1} turi neteisingą to datą.`);
        return;
      }
      if (toRaw != null && compareDateKeys(from, toRaw) > 0) {
        errors.push(`Gydytojo "${doctorNorm}" periode from yra vėliau nei to.`);
        return;
      }
      if (!groupsById.has(specialtyId)) {
        errors.push(`Gydytojo "${doctorNorm}" periode nenurodytas/neteisingas specialtyId "${specialtyId}".`);
        return;
      }
      periods.push({
        from,
        to: toRaw,
        specialtyId,
      });
    });

    if (!periods.length) {
      return;
    }

    periods.sort((a, b) => compareDateKeys(a.from, b.from));
    for (let i = 1; i < periods.length; i += 1) {
      const previous = periods[i - 1];
      const current = periods[i];
      if (previous.to == null) {
        errors.push(`Gydytojo "${doctorNorm}" atviras periodas turi būti paskutinis.`);
        break;
      }
      if (compareDateKeys(current.from, previous.to) <= 0) {
        errors.push(`Gydytojo "${doctorNorm}" periodai persidengia arba liečiasi neteisingai.`);
        break;
      }
    }

    assignmentsByDoctor.set(doctorNorm, {
      periods,
      startKeys: periods.map((period) => period.from),
    });
  });

  return { assignmentsByDoctor, errors };
}

function findSpecialtyForDate(periods, dateKey) {
  const periodList = Array.isArray(periods)
    ? periods
    : Array.isArray(periods?.periods)
      ? periods.periods
      : null;
  const startKeys = Array.isArray(periods?.startKeys) ? periods.startKeys : null;
  if (!Array.isArray(periodList) || !dateKey) {
    return null;
  }
  if (Array.isArray(startKeys) && startKeys.length === periodList.length) {
    let low = 0;
    let high = startKeys.length - 1;
    let candidateIndex = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (compareDateKeys(startKeys[mid], dateKey) <= 0) {
        candidateIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (candidateIndex >= 0) {
      const period = periodList[candidateIndex];
      if (period && (period.to == null || compareDateKeys(dateKey, period.to) <= 0)) {
        return period;
      }
    }
    return null;
  }
  for (let index = 0; index < periodList.length; index += 1) {
    const period = periodList[index];
    if (compareDateKeys(dateKey, period.from) >= 0) {
      if (period.to == null || compareDateKeys(dateKey, period.to) <= 0) {
        return period;
      }
    }
  }
  return null;
}

function getCompiledSpecialtyConfig(settings) {
  if (settings && typeof settings === 'object' && compiledSettingsCache.has(settings)) {
    return compiledSettingsCache.get(settings);
  }
  const normalized = normalizeSpecialtyConfig(settings);
  const validationErrors = [];
  if (normalized.effectiveDateField !== 'arrival') {
    validationErrors.push(
      `Nepalaikomas doctors.specialties.effectiveDateField="${normalized.effectiveDateField}" (v1 palaiko tik "arrival").`
    );
  }
  const { groups, groupsById, errors: groupErrors } = validateAndCompileGroups(normalized.groups);
  validationErrors.push(...groupErrors);
  const { assignmentsByDoctor, errors: assignmentErrors } = validateAndCompileAssignments(
    normalized.assignments,
    groupsById
  );
  validationErrors.push(...assignmentErrors);
  const compiled = {
    normalized,
    groups,
    groupsById,
    assignmentsByDoctor,
    validationErrors,
    groupLabelById: new Map(groups.map((group) => [group.id, group.label])),
  };
  if (settings && typeof settings === 'object') {
    compiledSettingsCache.set(settings, compiled);
  }
  return compiled;
}

function getValidatedResolverCacheBucket(settings) {
  if (!settings || typeof settings !== 'object') {
    return null;
  }
  let bucket = validatedResolverCache.get(settings);
  if (!(bucket instanceof WeakMap)) {
    bucket = new WeakMap();
    validatedResolverCache.set(settings, bucket);
  }
  return bucket;
}

function validateCoverageAgainstRecords({
  records,
  strict,
  enabled,
  excludeUnmappedFromStats,
  effectiveDateField,
  assignmentsByDoctor,
  groupsById,
}) {
  const errors = [];
  const warnings = [];
  const coverage = {
    totalWithDoctor: 0,
    assignableRecords: 0,
    mappedRecords: 0,
    unmappedRecords: 0,
    missingDateRecords: 0,
    doctorsSeen: 0,
    doctorsMapped: 0,
    doctorsUnmapped: 0,
  };

  if (!enabled) {
    return { errors, warnings, coverage };
  }

  const doctorSet = new Set();
  const doctorMappedSet = new Set();
  const doctorUnmappedSet = new Set();
  const list = Array.isArray(records) ? records : [];

  list.forEach((record) => {
    const doctorNorm = toTrimmedString(record?.closingDoctorNorm);
    if (!doctorNorm) {
      return;
    }
    coverage.totalWithDoctor += 1;
    doctorSet.add(doctorNorm);

    const dateValue = record?.arrival instanceof Date ? record.arrival : null;
    const dateKey = formatLocalDateKey(dateValue);
    if (!dateKey) {
      coverage.missingDateRecords += 1;
      doctorUnmappedSet.add(doctorNorm);
      return;
    }
    coverage.assignableRecords += 1;
    const matchedPeriod = findSpecialtyForDate(assignmentsByDoctor.get(doctorNorm), dateKey);
    if (!matchedPeriod || !groupsById.has(matchedPeriod.specialtyId)) {
      coverage.unmappedRecords += 1;
      doctorUnmappedSet.add(doctorNorm);
      return;
    }
    coverage.mappedRecords += 1;
    doctorMappedSet.add(doctorNorm);
  });

  coverage.doctorsSeen = doctorSet.size;
  coverage.doctorsMapped = doctorMappedSet.size;
  coverage.doctorsUnmapped = doctorUnmappedSet.size;

  if (strict && coverage.totalWithDoctor > 0) {
    if (coverage.unmappedRecords > 0 && excludeUnmappedFromStats !== true) {
      errors.push(
        `Nepriskirtų įrašų pagal specialybę: ${coverage.unmappedRecords} (gydytojai: ${coverage.doctorsUnmapped}).`
      );
    }
    if (coverage.missingDateRecords > 0 && effectiveDateField === 'arrival') {
      errors.push(`Įrašai be atvykimo datos specialybės priskyrimui: ${coverage.missingDateRecords}.`);
    }
  } else if (coverage.unmappedRecords > 0) {
    warnings.push(`Nepriskirtų įrašų pagal specialybę: ${coverage.unmappedRecords}.`);
  }

  return { errors, warnings, coverage };
}

export function createDoctorSpecialtyResolver(settings, records = []) {
  const validatedBucket = getValidatedResolverCacheBucket(settings);
  if (validatedBucket && Array.isArray(records) && validatedBucket.has(records)) {
    return validatedBucket.get(records);
  }
  const compiled = getCompiledSpecialtyConfig(settings);
  const normalized = compiled.normalized;
  const validationErrors = [];
  const validationWarnings = [];
  validationErrors.push(...compiled.validationErrors);
  const { groups, groupsById, assignmentsByDoctor, groupLabelById } = compiled;

  const coverageValidation = validateCoverageAgainstRecords({
    records,
    strict: normalized.strict,
    enabled: normalized.enabled,
    excludeUnmappedFromStats: normalized.excludeUnmappedFromStats,
    effectiveDateField: normalized.effectiveDateField,
    assignmentsByDoctor,
    groupsById,
  });
  validationErrors.push(...coverageValidation.errors);
  validationWarnings.push(...coverageValidation.warnings);

  const valid = normalized.enabled && validationErrors.length === 0;

  const resolver = {
    enabled: normalized.enabled,
    strict: normalized.strict,
    excludeUnmappedFromStats: normalized.excludeUnmappedFromStats,
    valid,
    groups,
    groupLabelById,
    coverage: coverageValidation.coverage,
    errors: summarizeMessages(validationErrors),
    warnings: summarizeMessages(validationWarnings),
    compiledAt: compiled,
    hasSpecialty(record) {
      return Boolean(this.resolveSpecialtyForRecord(record));
    },
    getSpecialtyOptionsForRecords(candidateRecords = []) {
      if (!(this._optionsCache instanceof WeakMap)) {
        this._optionsCache = new WeakMap();
      }
      if (Array.isArray(candidateRecords) && this._optionsCache.has(candidateRecords)) {
        return this._optionsCache.get(candidateRecords);
      }
      const labelsById = new Map();
      const list = Array.isArray(candidateRecords) ? candidateRecords : [];
      for (let index = 0; index < list.length; index += 1) {
        const specialty = this.resolveSpecialtyForRecord(list[index]);
        if (specialty?.id && !labelsById.has(specialty.id)) {
          labelsById.set(specialty.id, String(specialty.label || specialty.id));
        }
      }
      const optionsList = Array.from(labelsById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label), 'lt'));
      if (Array.isArray(candidateRecords)) {
        this._optionsCache.set(candidateRecords, optionsList);
      }
      return optionsList;
    },
    resolveSpecialtyForRecord(record) {
      if (!valid) {
        return null;
      }
      const doctorNorm = toTrimmedString(record?.closingDoctorNorm);
      if (!doctorNorm) {
        return null;
      }
      const arrivalDate = record?.arrival instanceof Date ? record.arrival : null;
      const dateKey = formatLocalDateKey(arrivalDate);
      if (!dateKey) {
        return null;
      }
      const period = findSpecialtyForDate(assignmentsByDoctor.get(doctorNorm), dateKey);
      if (!period) {
        return null;
      }
      const label = groupLabelById.get(period.specialtyId);
      if (!label) {
        return null;
      }
      return {
        id: period.specialtyId,
        label,
      };
    },
  };

  const result = {
    resolver,
    validation: {
      enabled: normalized.enabled,
      strict: normalized.strict,
      excludeUnmappedFromStats: normalized.excludeUnmappedFromStats,
      valid,
      effectiveDateField: normalized.effectiveDateField,
      groups,
      errors: resolver.errors,
      warnings: resolver.warnings,
      coverage: coverageValidation.coverage,
    },
  };
  if (validatedBucket && Array.isArray(records)) {
    validatedBucket.set(records, result);
  }
  return result;
}
