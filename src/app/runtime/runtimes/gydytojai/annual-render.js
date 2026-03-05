import { numberFormatter, oneDecimalFormatter } from '../../../../utils/format.js';
import { storeCopyButtonBaseLabel } from '../../clipboard.js';
import { syncAriaPressed } from '../../filters/ui-sync.js';

export function getAnnualMetricConfig(metric) {
  if (metric === 'hospitalizedShare') {
    return {
      label: 'Hospitalizacija',
      format: (value) => `${oneDecimalFormatter.format(Number(value) * 100)}%`,
      short: '%',
    };
  }
  if (metric === 'avgLosHours') {
    return {
      label: 'Vid. LOS',
      format: (value) => `${oneDecimalFormatter.format(value)} val.`,
      short: 'val.',
    };
  }
  if (metric === 'nightShare') {
    return {
      label: 'Naktiniai',
      format: (value) => `${oneDecimalFormatter.format(Number(value) * 100)}%`,
      short: '%',
    };
  }
  return {
    label: 'Atvejų sk.',
    format: (value) => numberFormatter.format(Number(value || 0)),
    short: '',
  };
}

export function formatAnnualDelta(metric, deltaAbs, deltaPct) {
  if (!Number.isFinite(deltaAbs)) {
    return 'YoY: N/A';
  }
  const absPrefix = deltaAbs > 0 ? '+' : '';
  if (metric === 'count') {
    const pctLabel = Number.isFinite(deltaPct)
      ? ` (${deltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(deltaPct)}%)`
      : '';
    return `YoY: ${absPrefix}${numberFormatter.format(Math.round(deltaAbs))}${pctLabel}`;
  }
  const scaledAbs = metric === 'avgLosHours' ? deltaAbs : deltaAbs * 100;
  const unit = metric === 'avgLosHours' ? ' val.' : ' p.p.';
  const pctLabel = Number.isFinite(deltaPct)
    ? ` (${deltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(deltaPct)}%)`
    : '';
  return `YoY: ${scaledAbs >= 0 ? '+' : ''}${oneDecimalFormatter.format(scaledAbs)}${unit}${pctLabel}`;
}

export function getTrendSymbol(trend) {
  if (trend === 'up') {
    return '↑';
  }
  if (trend === 'down') {
    return '↓';
  }
  if (trend === 'flat') {
    return '↔';
  }
  return '·';
}

export function sortAnnualCards(cards, mode) {
  const list = Array.isArray(cards) ? cards.slice() : [];
  const toNumberOr = (value, fallback) => (Number.isFinite(value) ? Number(value) : fallback);
  if (mode === 'yoy_up') {
    return list.sort((a, b) => toNumberOr(b?.yoyDeltaPct, -Infinity) - toNumberOr(a?.yoyDeltaPct, -Infinity));
  }
  if (mode === 'yoy_down') {
    return list.sort((a, b) => toNumberOr(a?.yoyDeltaPct, Infinity) - toNumberOr(b?.yoyDeltaPct, Infinity));
  }
  return list.sort((a, b) => toNumberOr(b?.latestValue, -Infinity) - toNumberOr(a?.latestValue, -Infinity));
}

export function buildAnnualExportPreface(dashboardState, metricLabel, buildDoctorFilterSummary) {
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  return [
    `# Filtrai: ${buildDoctorFilterSummary(dashboardState)}`,
    `# Metinė dinamika: metrika=${metricLabel}; rikiavimas=${dashboardState.doctorsAnnualSort}; pasirinkta=${selected.join('; ')}`,
  ];
}

export function normalizeDoctorAliasToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function resolveAnnualDoctorAlias(inputValue, availableDoctors) {
  const query = normalizeDoctorAliasToken(inputValue);
  if (!query) {
    return '';
  }
  const list = Array.isArray(availableDoctors) ? availableDoctors : [];
  const exact = list.find((entry) => normalizeDoctorAliasToken(entry?.alias) === query);
  if (exact?.alias) {
    return String(exact.alias);
  }
  const startsWith = list.find((entry) => normalizeDoctorAliasToken(entry?.alias).startsWith(query));
  if (startsWith?.alias) {
    return String(startsWith.alias);
  }
  const contains = list.find((entry) => normalizeDoctorAliasToken(entry?.alias).includes(query));
  return contains?.alias ? String(contains.alias) : '';
}

export function getAnnualDoctorSuggestions(dashboardState, limit = 8) {
  const query = normalizeDoctorAliasToken(dashboardState?.doctorsAnnualSearchInput);
  const selected = Array.isArray(dashboardState?.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  const selectedSet = new Set(selected.map((value) => normalizeDoctorAliasToken(value)));
  const available = Array.isArray(dashboardState?.doctorsAnnualAvailable)
    ? dashboardState.doctorsAnnualAvailable
    : [];
  const list = available
    .filter((entry) => {
      const alias = String(entry?.alias || '').trim();
      if (!alias || selectedSet.has(normalizeDoctorAliasToken(alias))) {
        return false;
      }
      if (!query) {
        return true;
      }
      return normalizeDoctorAliasToken(alias).includes(query);
    })
    .map((entry) => {
      const alias = String(entry?.alias || '').trim();
      const normalized = normalizeDoctorAliasToken(alias);
      let rank = 2;
      if (query && normalized === query) {
        rank = 0;
      } else if (query && normalized.startsWith(query)) {
        rank = 1;
      }
      return {
        alias,
        total: Number(entry?.total || 0),
        rank,
      };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (a.total !== b.total) {
        return b.total - a.total;
      }
      return a.alias.localeCompare(b.alias, 'lt');
    });
  return list.slice(0, Math.max(1, Number(limit) || 8));
}

export function renderAnnualDoctorSuggestions(selectors, dashboardState) {
  const host = selectors?.gydytojaiAnnualSuggestions;
  if (!(host instanceof HTMLElement)) {
    return [];
  }
  const input = selectors?.gydytojaiAnnualDoctorInput;
  const query = normalizeDoctorAliasToken(dashboardState?.doctorsAnnualSearchInput);
  const shouldShow = query.length > 0 || (input instanceof HTMLElement && document.activeElement === input);
  if (!shouldShow) {
    host.replaceChildren();
    host.hidden = true;
    dashboardState.doctorsAnnualSuggestIndex = -1;
    return [];
  }
  const suggestions = getAnnualDoctorSuggestions(dashboardState);
  host.replaceChildren();
  if (!suggestions.length) {
    host.hidden = true;
    dashboardState.doctorsAnnualSuggestIndex = -1;
    return suggestions;
  }
  const currentIndex = Number.isFinite(dashboardState.doctorsAnnualSuggestIndex)
    ? Number(dashboardState.doctorsAnnualSuggestIndex)
    : 0;
  const nextIndex = currentIndex >= 0 && currentIndex < suggestions.length ? currentIndex : 0;
  dashboardState.doctorsAnnualSuggestIndex = nextIndex;
  suggestions.forEach((entry, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `gydytojai-annual-suggestion${index === nextIndex ? ' is-active' : ''}`;
    option.setAttribute('data-annual-suggest', entry.alias);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', index === nextIndex ? 'true' : 'false');
    option.textContent = `${entry.alias} (n=${numberFormatter.format(entry.total)})`;
    host.appendChild(option);
  });
  host.hidden = false;
  return suggestions;
}

export function renderAnnualSelectedChips(selectors, dashboardState, annualModel) {
  if (!selectors.gydytojaiAnnualSelected || !selectors.gydytojaiAnnualSelectionHelp) {
    return;
  }
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  selectors.gydytojaiAnnualSelected.replaceChildren();
  const missingSelected = Array.isArray(annualModel?.meta?.missingSelected)
    ? annualModel.meta.missingSelected
    : [];
  selected.forEach((alias) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-annual-chip${missingSelected.includes(alias) ? ' is-error' : ''}`;
    chip.setAttribute('data-annual-remove', alias);
    chip.textContent = alias;
    selectors.gydytojaiAnnualSelected.appendChild(chip);
  });
  if (!selected.length) {
    selectors.gydytojaiAnnualSelectionHelp.textContent = 'Įveskite bent 1 gydytoją metinei dinamikai.';
  } else if (missingSelected.length) {
    selectors.gydytojaiAnnualSelectionHelp.textContent = `Nerasta pagal filtrus: ${missingSelected.join(', ')}`;
  } else {
    selectors.gydytojaiAnnualSelectionHelp.textContent = `Pasirinkta gydytojų: ${selected.length}.`;
  }
}

export function destroyAnnualCardCharts(dashboardState) {
  const refs = dashboardState?.doctorsAnnualCardsChartRefs || {};
  Object.keys(refs).forEach((key) => {
    const chart = refs[key];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
    refs[key] = null;
  });
}

export function renderDoctorAnnualSmallMultiples(
  selectors,
  dashboardState,
  chartLib,
  annualModel,
  buildDoctorFilterSummary,
  exportState,
  handleReportExportClick
) {
  if (!selectors.gydytojaiAnnualCards || !selectors.gydytojaiAnnualEmpty) {
    return;
  }
  const metric = String(dashboardState.doctorsAnnualMetric || 'count');
  const metricConfig = getAnnualMetricConfig(metric);
  const cards = sortAnnualCards(annualModel?.cards || [], dashboardState.doctorsAnnualSort);
  const selected = Array.isArray(dashboardState.doctorsAnnualSelected)
    ? dashboardState.doctorsAnnualSelected
    : [];
  selectors.gydytojaiAnnualCards.replaceChildren();
  if (!selected.length) {
    selectors.gydytojaiAnnualEmpty.hidden = true;
    destroyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }
  if (!cards.length) {
    selectors.gydytojaiAnnualEmpty.hidden = false;
    selectors.gydytojaiAnnualEmpty.textContent = 'Nepakanka bent 2 metų duomenų pagal aktyvius filtrus.';
    destroyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }
  selectors.gydytojaiAnnualEmpty.hidden = true;
  destroyAnnualCardCharts(dashboardState);
  Object.keys(exportState)
    .filter((key) => key.startsWith('annual:'))
    .forEach((key) => {
      delete exportState[key];
    });

  const refs = dashboardState.doctorsAnnualCardsChartRefs || {};
  dashboardState.doctorsAnnualCardsChartRefs = refs;
  cards.forEach((card, index) => {
    const key = `annual:${String(card?.doctorKey || index)}`;
    const latestLabel = Number.isFinite(card?.latestValue) ? metricConfig.format(card.latestValue) : 'N/A';
    const wrapper = document.createElement('article');
    wrapper.className = 'report-card gydytojai-annual-card';
    wrapper.innerHTML = `
      <div class="report-card__head">
        <h4>${card.alias}</h4>
        <div class="report-card__actions">
          <button type="button" class="chart-copy-btn" data-report-export="copy" data-report-key="${key}" data-tooltip="Kopijuoti grafiką" aria-label="Kopijuoti metinę kortelę" title="Kopijuoti metinę kortelę"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect></svg></button>
          <button type="button" class="chart-download-btn" data-report-export="png" data-report-key="${key}" data-tooltip="Parsisiųsti PNG" aria-label="Parsisiųsti metinę kortelę PNG" title="Parsisiųsti metinę kortelę PNG"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M8 11l4 4 4-4"></path><path d="M4 21h16"></path></svg></button>
        </div>
      </div>
      <p class="gydytojai-annual-card__meta">
        <strong>${latestLabel}</strong>
        <span>${formatAnnualDelta(metric, card?.yoyDeltaAbs, card?.yoyDeltaPct)}</span>
        <span>${getTrendSymbol(card?.trend)}</span>
      </p>
      <canvas class="gydytojai-annual-card__chart" height="120"></canvas>
      <p class="report-card__hint">Metai: ${(card.points || []).map((point) => point.year).join(', ')}</p>
    `;
    selectors.gydytojaiAnnualCards.appendChild(wrapper);

    const canvas = wrapper.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        refs[key] = new chartLib(ctx, {
          type: 'line',
          data: {
            labels: (card.points || []).map((point) => point.year),
            datasets: [
              {
                label: metricConfig.label,
                data: (card.points || []).map((point) => {
                  const value = point?.[metric];
                  if (!Number.isFinite(value)) {
                    return null;
                  }
                  return metric === 'count' || metric === 'avgLosHours' ? Number(value) : Number(value) * 100;
                }),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.16)',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
              y: { ticks: { maxTicksLimit: 5 } },
            },
          },
        });
      }
    }

    exportState[key] = {
      title: `Metinė dinamika - ${card.alias}`,
      exportTitle: `Metinė dinamika - ${card.alias}`,
      prefaceLines: buildAnnualExportPreface(dashboardState, metricConfig.label, buildDoctorFilterSummary),
      headers: ['Metai', metricConfig.label, 'Imtis (n)'],
      rows: (card.points || []).map((point) => {
        const metricValue = point?.[metric];
        const renderedValue = Number.isFinite(metricValue) ? metricConfig.format(metricValue) : 'N/A';
        return [point.year, renderedValue, numberFormatter.format(Number(point?.count || 0))];
      }),
      target: canvas,
    };

    Array.from(wrapper.querySelectorAll('[data-report-export]')).forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleReportExportClick);
    });
  });
}

export function getSpecialtyAnnualMetricConfig(metric) {
  if (metric === 'losGroups') {
    return {
      label: 'LOS grupės (%)',
      format: (value) =>
        Number.isFinite(value) ? `${oneDecimalFormatter.format(Number(value) * 100)}%` : 'N/A',
      summaryFormat: (card, value) => {
        const bucketLabel = getLosBucketLabel(card?.latestDominantBucketKey);
        return Number.isFinite(value)
          ? `${bucketLabel}: ${oneDecimalFormatter.format(Number(value) * 100)}%`
          : 'N/A';
      },
    };
  }
  return {
    ...getAnnualMetricConfig(metric),
    summaryFormat: (_card, value) =>
      Number.isFinite(value) ? getAnnualMetricConfig(metric).format(value) : 'N/A',
  };
}

export function getLosBucketLabel(key) {
  const map = {
    losLt4Share: '<4h',
    los4to8Share: '4-8h',
    los8to16Share: '8-16h',
    losGt16Share: '>16h',
  };
  return map[String(key || '')] || 'LOS';
}

export function formatSpecialtyAnnualDelta(metric, card) {
  if (metric === 'losGroups') {
    if (!Number.isFinite(card?.yoyDeltaAbs)) {
      return 'YoY: N/A';
    }
    const pctLabel = Number.isFinite(card?.yoyDeltaPct)
      ? ` (${card.yoyDeltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(card.yoyDeltaPct)}%)`
      : '';
    return `YoY: ${card.yoyDeltaAbs >= 0 ? '+' : ''}${oneDecimalFormatter.format(
      Number(card.yoyDeltaAbs) * 100
    )} p.p.${pctLabel}`;
  }
  return formatAnnualDelta(metric, card?.yoyDeltaAbs, card?.yoyDeltaPct);
}

export function formatSpecialtyAnnualDeltaAbs(metric, deltaAbs) {
  if (!Number.isFinite(deltaAbs)) {
    return 'N/A';
  }
  if (metric === 'count') {
    return `${deltaAbs >= 0 ? '+' : ''}${numberFormatter.format(Math.round(Number(deltaAbs)))}`;
  }
  const scaled = metric === 'avgLosHours' ? Number(deltaAbs) : Number(deltaAbs) * 100;
  const unit = metric === 'avgLosHours' ? ' val.' : ' p.p.';
  return `${scaled >= 0 ? '+' : ''}${oneDecimalFormatter.format(scaled)}${unit}`;
}

export function normalizeSpecialtyToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function syncSpecialtyAnnualSelection(dashboardState, availableSpecialties) {
  const available = Array.isArray(availableSpecialties) ? availableSpecialties : [];
  dashboardState.doctorsSpecialtyAnnualAvailable = available;
  const current = Array.isArray(dashboardState.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  const seen = new Set();
  dashboardState.doctorsSpecialtyAnnualSelected = current.filter((value) => {
    const token = normalizeSpecialtyToken(value);
    if (!token || seen.has(token)) {
      return false;
    }
    seen.add(token);
    return true;
  });
}

export function renderSpecialtyAnnualControls(selectors, dashboardState, annualModel) {
  const section = selectors?.gydytojaiSpecialtyAnnualSection;
  const selectedHost = selectors?.gydytojaiSpecialtyAnnualSelected;
  const clearButton = selectors?.gydytojaiSpecialtyAnnualClear;
  if (
    !(section instanceof HTMLElement) ||
    !(selectedHost instanceof HTMLElement) ||
    !(clearButton instanceof HTMLElement)
  ) {
    return;
  }
  const enabled = dashboardState?.doctorsSpecialtyUiEnabled === true;
  section.hidden = !enabled;
  if (!enabled) {
    selectedHost.replaceChildren();
    clearButton.disabled = true;
    return;
  }

  syncAriaPressed(
    selectors?.gydytojaiSpecialtyAnnualMetricButtons || [],
    (button) => String(button.getAttribute('data-gydytojai-specialty-annual-metric') || ''),
    String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count')
  );
  syncAriaPressed(
    selectors?.gydytojaiSpecialtyAnnualSortButtons || [],
    (button) => String(button.getAttribute('data-gydytojai-specialty-annual-sort') || ''),
    String(dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc')
  );

  const availableFromModel = Array.isArray(annualModel?.meta?.availableSpecialties)
    ? annualModel.meta.availableSpecialties
    : [];
  const availableFromState = Array.isArray(dashboardState?.doctorsSpecialtyAnnualAvailable)
    ? dashboardState.doctorsSpecialtyAnnualAvailable
    : [];
  const availableFromValidationGroups = Array.isArray(dashboardState?.doctorsSpecialtyValidation?.groups)
    ? dashboardState.doctorsSpecialtyValidation.groups.map((group) => ({
        specialtyId: String(group?.id || '').trim(),
        alias: String(group?.label || group?.id || '').trim(),
        total: Number(group?.count || 0),
      }))
    : [];
  const available =
    availableFromModel.length > 0
      ? availableFromModel
      : availableFromState.length > 0
        ? availableFromState
        : availableFromValidationGroups;
  const selected = Array.isArray(dashboardState?.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  const selectedSet = new Set(selected.map((value) => normalizeSpecialtyToken(value)));
  selectedHost.replaceChildren();
  available.forEach((entry) => {
    const specialtyId = String(entry?.specialtyId || '').trim();
    const alias = String(entry?.alias || specialtyId).trim();
    if (!specialtyId || !alias) {
      return;
    }
    const pressed =
      selectedSet.has(normalizeSpecialtyToken(specialtyId)) ||
      selectedSet.has(normalizeSpecialtyToken(alias));
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-button gydytojai-annual-chip${pressed ? '' : ' chip-button--ghost'}`;
    chip.setAttribute('data-gydytojai-specialty-annual-select', specialtyId);
    chip.setAttribute('data-gydytojai-specialty-annual-label', alias);
    chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    chip.textContent = `${alias} (n=${numberFormatter.format(Number(entry?.total || 0))})`;
    selectedHost.appendChild(chip);
  });
  clearButton.disabled = !selected.length;
}

export function destroySpecialtyAnnualCardCharts(dashboardState) {
  const refs = dashboardState?.doctorsSpecialtyAnnualCardsChartRefs || {};
  Object.keys(refs).forEach((key) => {
    const chart = refs[key];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
    refs[key] = null;
  });
}

export function renderSpecialtyAnnualSummary(selectors, dashboardState, annualModel) {
  const body = selectors?.gydytojaiSpecialtyAnnualSummaryBody;
  if (!(body instanceof HTMLElement)) {
    return;
  }
  body.replaceChildren();
  if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
    return;
  }
  const metric = String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count');
  const metricConfig = getSpecialtyAnnualMetricConfig(metric);
  const cards = sortAnnualCards(
    annualModel?.cards || [],
    dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc'
  );
  cards.forEach((card) => {
    const latestPoint = Array.isArray(card?.points)
      ? [...card.points].reverse().find((point) => Number(point?.count || 0) > 0) || null
      : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${card?.alias || '-'}</td>
      <td>${metricConfig.summaryFormat(card, card?.latestValue)}</td>
      <td>${metricConfig.summaryFormat(card, card?.previousValue)}</td>
      <td>${formatSpecialtyAnnualDeltaAbs(metric, card?.yoyDeltaAbs)}</td>
      <td>${Number.isFinite(card?.yoyDeltaPct) ? `${card.yoyDeltaPct >= 0 ? '+' : ''}${oneDecimalFormatter.format(card.yoyDeltaPct)}%` : 'N/A'}</td>
      <td>${numberFormatter.format(Number(latestPoint?.count || 0))}</td>
    `;
    body.appendChild(tr);
  });
}

export function buildSpecialtyAnnualExportPreface(dashboardState, metricLabel, buildDoctorFilterSummary) {
  const selected = Array.isArray(dashboardState.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  return [
    `# Filtrai: ${buildDoctorFilterSummary(dashboardState)}`,
    `# Specialybių metinė dinamika: metrika=${metricLabel}; rikiavimas=${dashboardState.doctorsSpecialtyAnnualSort}; pasirinkta=${selected.join('; ')}`,
  ];
}

export function renderSpecialtyAnnualSmallMultiples(
  selectors,
  dashboardState,
  chartLib,
  annualModel,
  buildDoctorFilterSummary,
  exportState,
  handleReportExportClick
) {
  const host = selectors?.gydytojaiSpecialtyAnnualCards;
  const empty = selectors?.gydytojaiSpecialtyAnnualEmpty;
  if (!(host instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
    return;
  }
  if (dashboardState?.doctorsSpecialtyUiEnabled !== true) {
    host.replaceChildren();
    empty.hidden = true;
    destroySpecialtyAnnualCardCharts(dashboardState);
    Object.keys(exportState)
      .filter((key) => key.startsWith('specialty-annual:'))
      .forEach((key) => {
        delete exportState[key];
      });
    return;
  }

  const metric = String(dashboardState?.doctorsSpecialtyAnnualMetric || 'count');
  const metricConfig = getSpecialtyAnnualMetricConfig(metric);
  const cards = sortAnnualCards(
    annualModel?.cards || [],
    dashboardState?.doctorsSpecialtyAnnualSort || 'latest_desc'
  );
  const selected = Array.isArray(dashboardState?.doctorsSpecialtyAnnualSelected)
    ? dashboardState.doctorsSpecialtyAnnualSelected
    : [];
  host.replaceChildren();
  destroySpecialtyAnnualCardCharts(dashboardState);
  Object.keys(exportState)
    .filter((key) => key.startsWith('specialty-annual:'))
    .forEach((key) => {
      delete exportState[key];
    });

  if (!selected.length) {
    empty.hidden = false;
    empty.textContent = 'Pasirinkite bent 1 specialybę metinei dinamikai.';
    return;
  }
  if (!cards.length) {
    empty.hidden = false;
    empty.textContent = 'Nepakanka bent 2 metų duomenų pasirinktoms specialybėms pagal aktyvius filtrus.';
    return;
  }

  empty.hidden = true;
  const refs = dashboardState.doctorsSpecialtyAnnualCardsChartRefs || {};
  dashboardState.doctorsSpecialtyAnnualCardsChartRefs = refs;
  const losPalette = {
    losLt4Share: '#10b981',
    los4to8Share: '#f59e0b',
    los8to16Share: '#f97316',
    losGt16Share: '#ef4444',
  };
  cards.forEach((card, index) => {
    const key = `specialty-annual:${String(card?.specialtyId || card?.doctorKey || index)}`;
    const latestLabel =
      metric === 'losGroups'
        ? metricConfig.summaryFormat(card, card?.latestValue)
        : Number.isFinite(card?.latestValue)
          ? metricConfig.summaryFormat(card, card?.latestValue)
          : 'N/A';
    const wrapper = document.createElement('article');
    wrapper.className = 'report-card gydytojai-annual-card';
    wrapper.innerHTML = `
      <div class="report-card__head">
        <h4>${card?.alias || 'Specialybė'}</h4>
        <div class="report-card__actions">
          <button type="button" class="chart-copy-btn" data-report-export="copy" data-report-key="${key}" data-tooltip="Kopijuoti grafiką" aria-label="Kopijuoti specialybės metinę kortelę" title="Kopijuoti specialybės metinę kortelę"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><rect x="4" y="4" width="11" height="11" rx="2"></rect></svg></button>
          <button type="button" class="chart-download-btn" data-report-export="png" data-report-key="${key}" data-tooltip="Parsisiųsti PNG" aria-label="Parsisiųsti specialybės metinę kortelę PNG" title="Parsisiųsti specialybės metinę kortelę PNG"><svg viewBox="0 0 24 24" fill="none" role="img" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M8 11l4 4 4-4"></path><path d="M4 21h16"></path></svg></button>
        </div>
      </div>
      <p class="gydytojai-annual-card__meta">
        <strong>${latestLabel}</strong>
        <span>${formatSpecialtyAnnualDelta(metric, card)}</span>
        <span>${getTrendSymbol(card?.trend)}</span>
      </p>
      <canvas class="gydytojai-annual-card__chart" height="120"></canvas>
      <p class="report-card__hint">Metai: ${(card?.points || []).map((point) => point.year).join(', ')}</p>
    `;
    host.appendChild(wrapper);

    const canvas = wrapper.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (metric === 'losGroups') {
          refs[key] = new chartLib(ctx, {
            type: 'bar',
            data: {
              labels: (card.points || []).map((point) => point.year),
              datasets: ['losLt4Share', 'los4to8Share', 'los8to16Share', 'losGt16Share'].map((bucketKey) => ({
                label: getLosBucketLabel(bucketKey),
                data: (card.points || []).map((point) =>
                  Number.isFinite(point?.[bucketKey]) ? Number(point[bucketKey]) * 100 : 0
                ),
                backgroundColor: losPalette[bucketKey],
                borderWidth: 0,
                stack: 'los',
              })),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true, position: 'bottom' } },
              scales: {
                x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: {
                  stacked: true,
                  min: 0,
                  max: 100,
                  ticks: {
                    maxTicksLimit: 5,
                    callback: (value) => `${value}%`,
                  },
                },
              },
            },
          });
        } else {
          refs[key] = new chartLib(ctx, {
            type: 'line',
            data: {
              labels: (card.points || []).map((point) => point.year),
              datasets: [
                {
                  label: metricConfig.label,
                  data: (card.points || []).map((point) => {
                    const value = point?.[metric];
                    if (!Number.isFinite(value)) {
                      return null;
                    }
                    return metric === 'count' || metric === 'avgLosHours'
                      ? Number(value)
                      : Number(value) * 100;
                  }),
                  borderColor: '#0f766e',
                  backgroundColor: 'rgba(15, 118, 110, 0.14)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 2,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: {
                  ticks: {
                    maxTicksLimit: 5,
                    callback:
                      metric === 'hospitalizedShare' || metric === 'nightShare'
                        ? (value) => `${value}%`
                        : undefined,
                  },
                },
              },
            },
          });
        }
      }
    }

    exportState[key] = {
      title: `Specialybės metinė dinamika - ${card?.alias || 'Specialybė'}`,
      exportTitle: `Specialybės metinė dinamika - ${card?.alias || 'Specialybė'}`,
      prefaceLines: buildSpecialtyAnnualExportPreface(
        dashboardState,
        metricConfig.label,
        buildDoctorFilterSummary
      ),
      headers:
        metric === 'losGroups'
          ? ['Metai', '<4h %', '4-8h %', '8-16h %', '>16h %', 'Imtis (n)']
          : ['Metai', metricConfig.label, 'Imtis (n)'],
      rows:
        metric === 'losGroups'
          ? (card.points || []).map((point) => [
              point.year,
              Number.isFinite(point?.losLt4Share)
                ? `${oneDecimalFormatter.format(point.losLt4Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.los4to8Share)
                ? `${oneDecimalFormatter.format(point.los4to8Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.los8to16Share)
                ? `${oneDecimalFormatter.format(point.los8to16Share * 100)}%`
                : 'N/A',
              Number.isFinite(point?.losGt16Share)
                ? `${oneDecimalFormatter.format(point.losGt16Share * 100)}%`
                : 'N/A',
              numberFormatter.format(Number(point?.count || 0)),
            ])
          : (card.points || []).map((point) => {
              const metricValue = point?.[metric];
              const renderedValue = Number.isFinite(metricValue) ? metricConfig.format(metricValue) : 'N/A';
              return [point.year, renderedValue, numberFormatter.format(Number(point?.count || 0))];
            }),
      target: canvas,
    };

    Array.from(wrapper.querySelectorAll('[data-report-export]')).forEach((button) => {
      storeCopyButtonBaseLabel(button);
      button.addEventListener('click', handleReportExportClick);
    });
  });
}
