import { TEXT } from '../../../constants.js';
import {
  buildPageHref,
  METRIC_SURFACE_ROUTE_PRIORITY,
  SECTION_ROUTE_REGISTRY,
  SURFACE_ROUTE_MAP,
} from './routes.js';

function getPageIdFromHref(href) {
  const value = String(href || '')
    .trim()
    .toLowerCase();
  if (!value || value === 'index.html') {
    return 'kpi';
  }
  if (value.includes('charts.html')) {
    return 'charts';
  }
  if (value.includes('recent.html')) {
    return 'recent';
  }
  if (value.includes('summaries.html')) {
    return 'summaries';
  }
  if (value.includes('gydytojai.html')) {
    return 'gydytojai';
  }
  if (value.includes('feedback.html')) {
    return 'feedback';
  }
  if (value.includes('ed.html')) {
    return 'ed';
  }
  return 'kpi';
}

export function buildPageResultsFromNavLinks(links, currentPageId) {
  return (Array.isArray(links) ? links : [])
    .map((link, index) => {
      const href = String(link?.getAttribute?.('href') || '').trim();
      const label = String(
        link?.querySelector?.('.section-nav__label')?.textContent || link?.textContent || ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (!href || !label) {
        return null;
      }
      const pageId = getPageIdFromHref(href);
      const isCurrent = pageId === currentPageId;
      return {
        id: `page:${pageId}`,
        kind: 'page',
        title: label,
        subtitle: isCurrent ? 'Dabartinis puslapis' : 'Atidaryti puslapį',
        aliases: [pageId, href.replace('.html', '')],
        rankBase: index * 10 + (isCurrent ? -5 : 0),
        showWhenEmpty: true,
        target: { type: 'navigate', href },
      };
    })
    .filter(Boolean);
}

export function buildSectionResults(currentPageId) {
  return SECTION_ROUTE_REGISTRY.map((entry, index) => ({
    id: `section:${entry.id}`,
    kind: 'section',
    title: entry.label,
    subtitle: entry.pageId === currentPageId ? 'Sekcija šiame puslapyje' : 'Sekcijos nuoroda',
    aliases: [entry.pageId, ...(Array.isArray(entry.aliases) ? entry.aliases : [])],
    rankBase: 100 + index,
    showWhenEmpty: entry.pageId === currentPageId,
    target: {
      type: 'navigate',
      href: buildPageHref(entry.pageId, entry.anchorId),
      anchorId: entry.anchorId,
      pageId: entry.pageId,
    },
  }));
}

export function buildActionResults({ selectors, currentPageId }) {
  const actions = [];
  const actionText = TEXT.globalSearch?.actions || {};
  if (selectors?.chartsHospitalTableSearch instanceof HTMLElement) {
    actions.push({
      id: 'action:charts-hospital-search',
      kind: 'action',
      title: actionText.chartsHospitalSearch || 'Fokusuoti skyriaus paiešką',
      subtitle: 'Grafikų puslapio stacionarizacijų lentelė',
      aliases: ['charts', 'hospital', 'skyrius', 'paieska'],
      rankBase: currentPageId === 'charts' ? 1 : 25,
      showWhenEmpty: true,
      target: { type: 'focus', actionKey: 'chartsHospitalSearch' },
    });
  }
  if (selectors?.gydytojaiSearch instanceof HTMLElement) {
    actions.push({
      id: 'action:doctors-search',
      kind: 'action',
      title: actionText.doctorsSearch || 'Fokusuoti gydytojų paiešką',
      subtitle: 'Gydytojų filtrų paieškos laukas',
      aliases: ['gydytojai', 'vardas', 'doctor'],
      rankBase: currentPageId === 'gydytojai' ? 2 : 30,
      showWhenEmpty: true,
      target: { type: 'focus', actionKey: 'doctorsSearch' },
    });
  }
  if (selectors?.edSearchInput instanceof HTMLElement) {
    actions.push({
      id: 'action:ed-search',
      kind: 'action',
      title: actionText.edSearch || 'Fokusuoti ED paiešką',
      subtitle: 'ED skydelio paieškos laukas',
      aliases: ['ed', 'search', 'paieska'],
      rankBase: currentPageId === 'ed' ? 3 : 35,
      showWhenEmpty: true,
      target: { type: 'focus', actionKey: 'edSearch' },
    });
  }
  return actions;
}

function resolveMetricRoute(metric) {
  const surfaces = Array.isArray(metric?.surfaces) ? metric.surfaces : [];
  for (const surfaceKey of METRIC_SURFACE_ROUTE_PRIORITY) {
    if (!surfaces.includes(surfaceKey)) {
      continue;
    }
    const route = SURFACE_ROUTE_MAP[surfaceKey];
    if (route) {
      return { ...route, surfaceKey };
    }
  }
  return null;
}

function metricAliases(metric) {
  const aliases = [metric?.id, metric?.domain, ...(Array.isArray(metric?.tags) ? metric.tags : [])].filter(
    Boolean
  );
  const surfaceMeta =
    metric?.surfaceMeta && typeof metric.surfaceMeta === 'object' ? metric.surfaceMeta : null;
  if (surfaceMeta) {
    Object.values(surfaceMeta).forEach((meta) => {
      if (meta?.label) {
        aliases.push(meta.label);
      }
    });
  }
  return aliases;
}

export async function buildMetricResults() {
  const metricsModule = await import('../../../../metrics/index.js');
  const catalog = metricsModule?.METRICS_CATALOG;
  const metrics = Array.isArray(catalog?.metrics) ? catalog.metrics : [];
  return metrics
    .filter((metric) => String(metric?.visibility || 'public') === 'public')
    .map((metric, index) => {
      const route = resolveMetricRoute(metric);
      if (!route) {
        return null;
      }
      const subtitleParts = [];
      if (metric?.description) {
        subtitleParts.push(metric.description);
      }
      if (route.surfaceKey) {
        subtitleParts.push(route.surfaceKey);
      }
      return {
        id: `metric:${metric.id}`,
        kind: 'metric',
        title: String(metric?.label || metric?.id || '').trim(),
        subtitle: subtitleParts.join(' • '),
        aliases: metricAliases(metric),
        rankBase: 300 + index,
        showWhenEmpty: false,
        target: {
          type: 'navigate',
          href: buildPageHref(route.pageId, route.anchorId),
          anchorId: route.anchorId,
          pageId: route.pageId,
        },
      };
    })
    .filter((result) => result?.title);
}
