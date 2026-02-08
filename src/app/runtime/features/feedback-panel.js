import { computeFeedbackStats } from './feedback-stats.js';

export function createFeedbackPanelFeature(deps) {
  const {
    selectors,
    dashboardState,
    TEXT,
    FEEDBACK_RATING_MIN,
    FEEDBACK_RATING_MAX,
    getDefaultFeedbackFilters,
    FEEDBACK_FILTER_ALL,
    FEEDBACK_FILTER_MISSING,
    numberFormatter,
    textCollator,
    capitalizeSentence,
    formatLocalDateKey,
    getDatasetValue,
    setDatasetValue,
    renderFeedbackSection,
  } = deps;

  function sanitizeFeedbackFilters(filters, options = {}) {
    const defaults = getDefaultFeedbackFilters();
    const normalized = { ...defaults, ...(filters || {}) };
    const respondentValues = new Set([FEEDBACK_FILTER_ALL]);
    const locationValues = new Set([FEEDBACK_FILTER_ALL]);

    const respondentOptions = Array.isArray(options.respondent) ? options.respondent : [];
    respondentOptions.forEach((option) => {
      if (option && typeof option.value === 'string') {
        respondentValues.add(option.value);
      }
    });

    const locationOptions = Array.isArray(options.location) ? options.location : [];
    locationOptions.forEach((option) => {
      if (option && typeof option.value === 'string') {
        locationValues.add(option.value);
      }
    });

    if (!respondentValues.has(normalized.respondent)) {
      normalized.respondent = defaults.respondent;
    }
    if (!locationValues.has(normalized.location)) {
      normalized.location = defaults.location;
    }

    return normalized;
  }

  function normalizeFeedbackFilterValue(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  function buildFeedbackFilterOptions(records) {
    const filtersText = TEXT.feedback?.filters || {};
    const missingLabel = filtersText.missing || 'Nenurodyta';
    const respondentMap = new Map();
    const locationMap = new Map();

    const pushValue = (map, raw) => {
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      const key = trimmed ? trimmed.toLowerCase() : FEEDBACK_FILTER_MISSING;
      const existing = map.get(key) || {
        value: key,
        label: trimmed ? capitalizeSentence(trimmed) : missingLabel,
        count: 0,
        original: trimmed,
      };
      existing.count += 1;
      if (trimmed && !existing.original) {
        existing.original = trimmed;
        existing.label = capitalizeSentence(trimmed);
      }
      map.set(key, existing);
    };

    (Array.isArray(records) ? records : []).forEach((entry) => {
      pushValue(respondentMap, entry?.respondent);
      pushValue(locationMap, entry?.location);
    });

    const toOptions = (map) => Array.from(map.values())
      .filter((item) => Number.isFinite(item.count) && item.count > 0 && typeof item.value === 'string')
      .map((item) => ({
        value: item.value,
        label: item.label,
        count: item.count,
      }))
      .sort((a, b) => textCollator.compare(a.label, b.label));

    return {
      respondent: toOptions(respondentMap),
      location: toOptions(locationMap),
    };
  }

  function formatFeedbackFilterOption(option) {
    if (!option || typeof option !== 'object') {
      return '';
    }
    const label = option.label || '';
    const count = Number.isFinite(option.count) ? option.count : null;
    if (count != null && count > 0) {
      return `${label} (${numberFormatter.format(count)})`;
    }
    return label;
  }

  function buildFeedbackChipButtons(type, config, groupEl) {
    if (!groupEl) {
      return;
    }
    const filtersText = TEXT.feedback?.filters || {};
    const allLabel = type === 'respondent'
      ? (filtersText.respondent?.all || 'Visi dalyviai')
      : (filtersText.location?.all || 'Visos vietos');
    const items = [{ value: FEEDBACK_FILTER_ALL, label: allLabel }];
    (Array.isArray(config) ? config : []).forEach((option) => {
      if (!option || typeof option.value !== 'string') {
        return;
      }
      items.push({
        value: option.value,
        label: formatFeedbackFilterOption(option),
      });
    });
    const currentFilters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
    const activeValue = type === 'respondent'
      ? (currentFilters.respondent || FEEDBACK_FILTER_ALL)
      : (currentFilters.location || FEEDBACK_FILTER_ALL);
    const buttons = items.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip-button';
      setDatasetValue(button, 'feedbackFilter', type);
      setDatasetValue(button, 'feedbackValue', item.value);
      button.textContent = item.label;
      button.setAttribute('aria-pressed', item.value === activeValue ? 'true' : 'false');
      return button;
    });
    groupEl.replaceChildren(...buttons);
  }

  function populateFeedbackFilterControls(options = dashboardState.feedback.filterOptions) {
    const config = options || { respondent: [], location: [] };
    const filtersText = TEXT.feedback?.filters || {};
    if (selectors.feedbackRespondentFilter) {
      const select = selectors.feedbackRespondentFilter;
      const items = [];
      const allOption = document.createElement('option');
      allOption.value = FEEDBACK_FILTER_ALL;
      allOption.textContent = filtersText.respondent?.all || 'Visi dalyviai';
      items.push(allOption);
      (Array.isArray(config.respondent) ? config.respondent : []).forEach((option) => {
        if (!option || typeof option.value !== 'string') {
          return;
        }
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = formatFeedbackFilterOption(option);
        items.push(opt);
      });
      select.replaceChildren(...items);
    }
    if (selectors.feedbackRespondentChips) {
      buildFeedbackChipButtons('respondent', config.respondent, selectors.feedbackRespondentChips);
    }
    if (selectors.feedbackLocationFilter) {
      const select = selectors.feedbackLocationFilter;
      const items = [];
      const allOption = document.createElement('option');
      allOption.value = FEEDBACK_FILTER_ALL;
      allOption.textContent = filtersText.location?.all || 'Visos vietos';
      items.push(allOption);
      (Array.isArray(config.location) ? config.location : []).forEach((option) => {
        if (!option || typeof option.value !== 'string') {
          return;
        }
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = formatFeedbackFilterOption(option);
        items.push(opt);
      });
      select.replaceChildren(...items);
    }
    if (selectors.feedbackLocationChips) {
      buildFeedbackChipButtons('location', config.location, selectors.feedbackLocationChips);
    }
    selectors.feedbackFilterButtons = Array.from(document.querySelectorAll('[data-feedback-filter]'));
  }

  function syncFeedbackFilterControls() {
    const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
    if (selectors.feedbackRespondentFilter) {
      const select = selectors.feedbackRespondentFilter;
      const value = typeof filters.respondent === 'string' ? filters.respondent : FEEDBACK_FILTER_ALL;
      const hasOption = Array.from(select.options).some((option) => option.value === value);
      select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
    }
    if (selectors.feedbackLocationFilter) {
      const select = selectors.feedbackLocationFilter;
      const value = typeof filters.location === 'string' ? filters.location : FEEDBACK_FILTER_ALL;
      const hasOption = Array.from(select.options).some((option) => option.value === value);
      select.value = hasOption ? value : FEEDBACK_FILTER_ALL;
    }
    if (Array.isArray(selectors.feedbackFilterButtons) && selectors.feedbackFilterButtons.length) {
      selectors.feedbackFilterButtons.forEach((button) => {
        if (!(button instanceof HTMLElement)) {
          return;
        }
        const type = getDatasetValue(button, 'feedbackFilter', '');
        const value = getDatasetValue(button, 'feedbackValue', FEEDBACK_FILTER_ALL);
        if (type !== 'respondent' && type !== 'location') {
          return;
        }
        const activeValue = type === 'respondent'
          ? (filters.respondent || FEEDBACK_FILTER_ALL)
          : (filters.location || FEEDBACK_FILTER_ALL);
        button.setAttribute('aria-pressed', value === activeValue ? 'true' : 'false');
      });
    }
  }

  function getFeedbackFilterLabel(type, value) {
    const filtersText = TEXT.feedback?.filters || {};
    if (value === FEEDBACK_FILTER_ALL || !value) {
      if (type === 'respondent') {
        return filtersText.respondent?.all || 'Visi dalyviai';
      }
      if (type === 'location') {
        return filtersText.location?.all || 'Visos vietos';
      }
      return '';
    }
    if (value === FEEDBACK_FILTER_MISSING) {
      return filtersText.missing || 'Nenurodyta';
    }
    const options = dashboardState.feedback.filterOptions?.[type];
    if (Array.isArray(options)) {
      const match = options.find((option) => option?.value === value);
      if (match) {
        return match.label || match.value;
      }
    }
    return value;
  }

  function updateFeedbackFiltersSummary(summary = dashboardState.feedback.summary) {
    const summaryElement = selectors.feedbackFiltersSummary;
    if (!summaryElement) {
      return;
    }
    const filters = dashboardState.feedback.filters || getDefaultFeedbackFilters();
    const filtersText = TEXT.feedback?.filters || {};
    const respondentLabel = getFeedbackFilterLabel('respondent', filters.respondent);
    const locationLabel = getFeedbackFilterLabel('location', filters.location);
    const parts = [];
    if (respondentLabel) {
      parts.push(respondentLabel);
    }
    if (locationLabel) {
      parts.push(locationLabel);
    }
    const baseText = parts.length
      ? (filtersText.summaryLabel ? `${filtersText.summaryLabel} ${parts.join(' • ')}` : parts.join(' • '))
      : filtersText.summaryDefault || '';
    const totalResponses = Number.isFinite(summary?.totalResponses) ? summary.totalResponses : null;
    const countLabel = filtersText.countLabel || TEXT.feedback?.table?.headers?.responses || 'Atsakymai';
    const countText = Number.isFinite(totalResponses) ? `${countLabel}: ${numberFormatter.format(totalResponses)}` : '';
    const finalText = baseText && countText ? `${baseText} • ${countText}` : (baseText || countText || filtersText.summaryDefault || '');
    summaryElement.textContent = finalText;
    const isDefault = filters.respondent === FEEDBACK_FILTER_ALL && filters.location === FEEDBACK_FILTER_ALL;
    setDatasetValue(summaryElement, 'default', isDefault ? 'true' : 'false');
  }

  function filterFeedbackRecords(records, filters) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!filters) {
      return list;
    }
    return list.filter((entry) => {
      if (!entry) {
        return false;
      }
      const respondentValue = normalizeFeedbackFilterValue(entry.respondent);
      const locationValue = normalizeFeedbackFilterValue(entry.location);
      if (filters.respondent !== FEEDBACK_FILTER_ALL) {
        if (filters.respondent === FEEDBACK_FILTER_MISSING) {
          if (respondentValue) {
            return false;
          }
        } else if (respondentValue !== filters.respondent) {
          return false;
        }
      }
      if (filters.location !== FEEDBACK_FILTER_ALL) {
        if (filters.location === FEEDBACK_FILTER_MISSING) {
          if (locationValue) {
            return false;
          }
        } else if (locationValue !== filters.location) {
          return false;
        }
      }
      return true;
    });
  }

  function applyFeedbackFiltersAndRender() {
    const options = dashboardState.feedback.filterOptions || { respondent: [], location: [] };
    const sanitized = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
    dashboardState.feedback.filters = sanitized;
    syncFeedbackFilterControls();
    const filteredRecords = filterFeedbackRecords(dashboardState.feedback.records, sanitized);
    dashboardState.feedback.filteredRecords = filteredRecords;
    const feedbackStats = computeFeedbackStats(filteredRecords, {
      FEEDBACK_RATING_MIN,
      FEEDBACK_RATING_MAX,
      formatLocalDateKey,
    });
    dashboardState.feedback.summary = feedbackStats.summary;
    dashboardState.feedback.monthly = feedbackStats.monthly;
    renderFeedbackSection(feedbackStats);
    updateFeedbackFiltersSummary(feedbackStats.summary);
    return feedbackStats;
  }

  function handleFeedbackFilterChange(event) {
    const target = event?.target;
    if (!target || target.tagName !== 'SELECT') {
      return;
    }
    const { name, value } = target;
    if (name === 'respondent' || name === 'location') {
      dashboardState.feedback.filters = {
        ...dashboardState.feedback.filters,
        [name]: typeof value === 'string' ? value : FEEDBACK_FILTER_ALL,
      };
      applyFeedbackFiltersAndRender();
    }
  }

  function handleFeedbackFilterChipClick(event) {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button[data-feedback-filter][data-feedback-value]');
    if (!button) {
      return;
    }
    const type = getDatasetValue(button, 'feedbackFilter', '');
    if (type !== 'respondent' && type !== 'location') {
      return;
    }
    const value = getDatasetValue(button, 'feedbackValue', FEEDBACK_FILTER_ALL);
    dashboardState.feedback.filters = {
      ...dashboardState.feedback.filters,
      [type]: typeof value === 'string' ? value : FEEDBACK_FILTER_ALL,
    };
    applyFeedbackFiltersAndRender();
  }

  function updateFeedbackFilterOptions(records) {
    const options = buildFeedbackFilterOptions(records);
    dashboardState.feedback.filterOptions = options;
    populateFeedbackFilterControls(options);
    dashboardState.feedback.filters = sanitizeFeedbackFilters(dashboardState.feedback.filters, options);
    syncFeedbackFilterControls();
  }

  return {
    populateFeedbackFilterControls,
    syncFeedbackFilterControls,
    updateFeedbackFiltersSummary,
    applyFeedbackFiltersAndRender,
    handleFeedbackFilterChange,
    handleFeedbackFilterChipClick,
    updateFeedbackFilterOptions,
  };
}
