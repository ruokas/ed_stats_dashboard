import { normalizeSearchText, tokenizeSearchText } from './normalize.js';

function scoreField(field, normalizedQuery, queryTokens) {
  const value = normalizeSearchText(field);
  if (!value) {
    return 0;
  }
  if (value === normalizedQuery) {
    return 1000;
  }
  if (value.startsWith(normalizedQuery)) {
    return 700;
  }
  if (queryTokens.length && queryTokens.every((token) => value.includes(token))) {
    if (queryTokens.every((token) => value.split(' ').some((part) => part.startsWith(token)))) {
      return 500;
    }
    return 350;
  }
  if (value.includes(normalizedQuery)) {
    return 350;
  }
  return 0;
}

function scoreAliases(aliases, normalizedQuery, queryTokens) {
  if (!Array.isArray(aliases) || !aliases.length) {
    return 0;
  }
  let best = 0;
  aliases.forEach((alias) => {
    const aliasScore = scoreField(alias, normalizedQuery, queryTokens);
    if (aliasScore >= 1000) {
      best = Math.max(best, 650);
      return;
    }
    if (aliasScore > 0) {
      best = Math.max(best, aliasScore >= 700 ? 450 : 250);
    }
  });
  return best;
}

function kindBoost(kind, isEmptyQuery) {
  if (isEmptyQuery && kind === 'action') {
    return 30;
  }
  if (kind === 'page') {
    return 40;
  }
  if (kind === 'section') {
    return 10;
  }
  return 0;
}

export function rankGlobalSearchResults(results, query, options = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchText(query);
  const isEmptyQuery = !normalizedQuery;
  const includeMetrics = options.includeMetrics !== false;
  const perGroupLimit = {
    page: 8,
    section: 12,
    metric: 8,
    action: 6,
    ...(options.perGroupLimit || {}),
  };
  const totalLimit = Number.isFinite(options.totalLimit) ? options.totalLimit : 30;

  const scored = (Array.isArray(results) ? results : [])
    .filter((result) => result && typeof result === 'object')
    .filter((result) => includeMetrics || result.kind !== 'metric')
    .filter((result) => !isEmptyQuery || result.showWhenEmpty === true)
    .map((result) => {
      if (isEmptyQuery) {
        const score = (Number(result.rankBase) || 0) + kindBoost(result.kind, true);
        return { result, score };
      }
      const titleScore = scoreField(result.title, normalizedQuery, queryTokens);
      const aliasScore = scoreAliases(result.aliases, normalizedQuery, queryTokens);
      const subtitleScore = scoreField(result.subtitle, normalizedQuery, queryTokens) > 0 ? 120 : 0;
      const score = Math.max(titleScore, aliasScore, subtitleScore) + kindBoost(result.kind, false);
      if (score <= 0) {
        return null;
      }
      return { result, score };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const aRank = Number(a.result.rankBase) || 0;
      const bRank = Number(b.result.rankBase) || 0;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return String(a.result.title || '').localeCompare(String(b.result.title || ''), 'lt');
    });

  const counts = { page: 0, section: 0, metric: 0, action: 0 };
  const limited = [];
  for (const item of scored) {
    const kind = item.result.kind;
    if (!Object.hasOwn(counts, kind)) {
      continue;
    }
    if (counts[kind] >= (perGroupLimit[kind] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    limited.push(item.result);
    counts[kind] += 1;
    if (limited.length >= totalLimit) {
      break;
    }
  }
  return limited;
}
