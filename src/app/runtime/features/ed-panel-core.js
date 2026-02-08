const MIN_STATUS_YEAR = 2000;
const MAX_STATUS_FUTURE_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

const edSectionIconDefinitions = {
  flow(svg) {
    svg.appendChild(createSvgElement('path', { d: 'M6 6C10 6 13 9 18 12C13 15 10 18 6 18' }));
  },
  efficiency(svg) {
    svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '8.5' }));
    svg.appendChild(createSvgElement('path', { d: 'M12 8v4.8l3 2.2' }));
  },
  feedback(svg) {
    svg.appendChild(createSvgElement('path', {
      d: 'M6 6.5h10a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H10l-3 2.5v-2.5H6a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3z',
    }));
    svg.appendChild(createSvgElement('path', { d: 'M8.5 12h7' }));
  },
  insights(svg) {
    svg.appendChild(createSvgElement('path', { d: 'M5 17V7' }));
    svg.appendChild(createSvgElement('path', { d: 'M9 17V11' }));
    svg.appendChild(createSvgElement('path', { d: 'M13 17V9' }));
    svg.appendChild(createSvgElement('path', { d: 'M17 17V6' }));
  },
  default(svg) {
    svg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '9' }));
    svg.appendChild(createSvgElement('path', { d: 'M9 12h6' }));
    svg.appendChild(createSvgElement('path', { d: 'M12 9v6' }));
  },
};

function createSvgElement(type, attributes = {}) {
  const element = document.createElementNS(SVG_NS, type);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  element.setAttribute('stroke-linecap', 'round');
  element.setAttribute('stroke-linejoin', 'round');
  return element;
}

export function createEdPanelCoreFeature(deps) {
  const {
    dashboardState,
    TEXT,
    statusTimeFormatter,
    renderEdDashboard,
  } = deps;

  function normalizeStatusTimestamp(candidate, fallback) {
    const fallbackDate = fallback instanceof Date && !Number.isNaN(fallback.getTime())
      ? fallback
      : null;
    if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
      return fallbackDate;
    }
    const year = candidate.getFullYear();
    const now = Date.now();
    const candidateTime = candidate.getTime();
    if (year < MIN_STATUS_YEAR || candidateTime > now + MAX_STATUS_FUTURE_OFFSET_MS) {
      console.warn('Ignoruojamas neadekvatus ED momentinio vaizdo laiko zymuo:', candidate.toISOString());
      return fallbackDate;
    }
    return candidate;
  }

  function buildEdStatus(summary, dataset, displayVariant) {
    const updatedAt = dataset?.updatedAt instanceof Date && !Number.isNaN(dataset.updatedAt.getTime())
      ? dataset.updatedAt
      : null;
    const snapshotDateRaw = summary?.latestSnapshotAt instanceof Date && !Number.isNaN(summary.latestSnapshotAt.getTime())
      ? summary.latestSnapshotAt
      : null;
    const statusDate = normalizeStatusTimestamp(snapshotDateRaw, updatedAt) || updatedAt || null;
    const timestampText = statusDate ? statusTimeFormatter.format(statusDate) : null;
    const hasEntries = displayVariant === 'snapshot'
      ? Number.isFinite(summary?.entryCount) && summary.entryCount > 0
      : Number.isFinite(summary?.totalPatients) && summary.totalPatients > 0;
    let tone = 'info';
    let message = '';
    if (dataset?.error) {
      message = TEXT.ed.status.error(dataset.error);
      tone = 'error';
    } else if (dataset?.usingFallback) {
      const reason = dataset.lastErrorMessage || TEXT.ed.status.noUrl;
      message = TEXT.ed.status.fallback(reason, timestampText);
      tone = 'warning';
    } else if (!hasEntries) {
      message = TEXT.ed.status.empty;
      tone = 'warning';
    } else {
      const successTimestamp = timestampText || statusTimeFormatter.format(new Date());
      message = TEXT.ed.status.success(successTimestamp);
      tone = 'success';
    }
    return {
      message,
      tone,
      timestamp: timestampText,
      statusDate,
      updatedAt,
      hasEntries,
    };
  }

  function createEdSectionIcon(iconKey) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const iconName = iconKey && edSectionIconDefinitions[iconKey]
      ? iconKey
      : 'default';
    edSectionIconDefinitions[iconName](svg);
    return svg;
  }

  function normalizeEdSearchQuery(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  function matchesEdSearch(record, query) {
    if (!query) {
      return true;
    }
    const haystack = [
      record?.disposition,
      record?.dispositionCategory,
      record?.nurseRatioText,
      record?.doctorRatioText,
      record?.rawTimestamp,
      record?.dateKey,
    ]
      .filter((part) => typeof part === 'string')
      .map((part) => part.toLowerCase())
      .join(' ');
    return haystack.includes(query);
  }

  function applyEdSearchFilter(query) {
    dashboardState.edSearchQuery = normalizeEdSearchQuery(query);
    renderEdDashboard(dashboardState.ed);
  }

  return {
    buildEdStatus,
    createEdSectionIcon,
    normalizeEdSearchQuery,
    matchesEdSearch,
    applyEdSearchFilter,
  };
}
