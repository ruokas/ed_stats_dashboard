import { parseCsv } from './csv.js';
import { parseDate } from './date.js';

const FEEDBACK_HEADER_CANDIDATES = {
  date: 'timestamp,gauta,data,received,created,submitted,laikas,pildymo data,pildymo laikas,pildymo data ir laikas,užpildymo data,užpildymo laikas,forma pateikta,data pateikta,atsakymo data,atsakymo laikas,įrašo data,įrašo laikas',
  respondent: 'kas pildo formą?,kas pildo formą,kas pildo forma,respondentas,role,dalyvis,tipas',
  location:
    'kur pildėte anketą?,kur pildėte anketą,kur pildėte anketa,kur pildėte forma,kur pildėte formą?,kur pildoma anketa,pildymo vieta,pildymo vieta?,apklausos vieta,location,kur pildoma forma,šaltinis,saltinis',
  overall:
    'kaip vertinate savo bendrą patirtį mūsų skyriuje?,*bendr* patirt*,overall,general experience,experience rating',
  doctors:
    'kaip vertinate gydytojų darbą,*gydytojų darb*,gydytoju darba,gydytojų vertinimas,physician,doctor rating',
  nurses:
    'kaip vertinate slaugytojų darbą ?,kaip vertinate slaugytojų darbą,*slaugytojų darb*,slaugytoju darba,slaugytojų vertinimas,nurse rating',
  aidesContact:
    'ar bendravote su slaugytojų padėjėjais?,ar bendravote su slaugytojų padėjėjais,ar bendravote su slaugytoju padejejais,ar bendravote su padėjėjais,contact with aides',
  aides:
    'kaip vertinate slaugytojų padėjėjų darbą,*padėjėjų darb*,slaugytoju padejeju darba,padėjėjų vertinimas,aide rating',
  waiting: 'kaip vertinate laukimo laiką skyriuje?,*laukimo laik*,wait time,laukimo vertinimas',
  comments:
    'turite pasiūlymų ar pastabų, kaip galėtume tobulėti?,pasiūlymai,pastabos,komentarai,atsiliepimų komentarai',
};

const FEEDBACK_CONTACT_YES = 'taip,yes,yeah,1,true';
const FEEDBACK_CONTACT_NO = 'ne,no,0,false';

export function createFeedbackHandlers(context) {
  const {
    settings,
    DEFAULT_SETTINGS,
    TEXT,
    dashboardState,
    downloadCsv,
    describeError,
    parseCandidateList,
    matchesWildcard,
    FEEDBACK_RATING_MIN,
    FEEDBACK_RATING_MAX,
    FEEDBACK_LEGACY_MAX,
  } = context;

  const resolveFeedbackColumn = (headerNormalized, candidateList) => {
    const candidates = parseCandidateList(candidateList, candidateList);
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (!trimmed || trimmed.includes('*')) {
        continue;
      }
      const match = headerNormalized.find((column) => column.original === trimmed);
      if (match) {
        return match.index;
      }
    }

    for (const candidate of candidates) {
      const trimmed = candidate.trim().toLowerCase();
      if (!trimmed || candidate.includes('*')) {
        continue;
      }
      const match = headerNormalized.find((column) => column.normalized === trimmed);
      if (match) {
        return match.index;
      }
    }

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.trim().toLowerCase();
      if (!normalizedCandidate || candidate.includes('*')) {
        continue;
      }
      const match = headerNormalized.find((column) => column.normalized.includes(normalizedCandidate));
      if (match) {
        return match.index;
      }
    }

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.trim().toLowerCase();
      if (!normalizedCandidate) {
        continue;
      }
      const match = headerNormalized.find((column) =>
        matchesWildcard(column.normalized, normalizedCandidate)
      );
      if (match) {
        return match.index;
      }
    }

    return -1;
  };

  const normalizeFeedbackRating = (value) => {
    if (!Number.isFinite(value)) {
      return null;
    }
    if (value >= FEEDBACK_RATING_MIN && value <= FEEDBACK_RATING_MAX) {
      return value;
    }
    if (value > FEEDBACK_RATING_MAX && value <= FEEDBACK_LEGACY_MAX) {
      const scaled = (value / FEEDBACK_LEGACY_MAX) * FEEDBACK_RATING_MAX;
      const clamped = Math.min(FEEDBACK_RATING_MAX, Math.max(FEEDBACK_RATING_MIN, scaled));
      return clamped;
    }
    return null;
  };

  const parseFeedbackRatingCell = (value) => {
    if (value == null) {
      return null;
    }
    const text = String(value).trim();
    if (!text) {
      return null;
    }
    const normalized = text.replace(',', '.');
    const direct = Number.parseFloat(normalized);
    if (Number.isFinite(direct)) {
      return normalizeFeedbackRating(direct);
    }
    const match = normalized.match(/(-?\d+(?:\.\d+)?)/);
    if (match) {
      const fallback = Number.parseFloat(match[1]);
      return normalizeFeedbackRating(fallback);
    }
    return null;
  };

  const parseFeedbackContactValue = (value, yesCandidates, noCandidates) => {
    if (value == null) {
      return null;
    }
    const text = String(value).trim();
    if (!text) {
      return null;
    }
    const normalized = text.toLowerCase();
    if (yesCandidates.some((candidate) => matchesWildcard(normalized, candidate))) {
      return true;
    }
    if (noCandidates.some((candidate) => matchesWildcard(normalized, candidate))) {
      return false;
    }
    return null;
  };

  const transformFeedbackCsv = (text) => {
    if (typeof text !== 'string' || !text.trim()) {
      return [];
    }
    const { rows } = parseCsv(text);
    if (!rows.length) {
      return [];
    }
    const header = rows[0].map((cell) => String(cell ?? '').trim());
    const headerNormalized = header.map((column, index) => ({
      original: column,
      normalized: column.toLowerCase(),
      index,
    }));

    const indices = {
      date: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.date),
      respondent: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.respondent),
      location: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.location),
      overall: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.overall),
      doctors: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.doctors),
      nurses: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.nurses),
      aidesContact: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.aidesContact),
      aides: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.aides),
      waiting: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.waiting),
      comments: resolveFeedbackColumn(headerNormalized, FEEDBACK_HEADER_CANDIDATES.comments),
    };

    const yesCandidates = parseCandidateList(FEEDBACK_CONTACT_YES, FEEDBACK_CONTACT_YES).map((token) =>
      token.toLowerCase()
    );
    const noCandidates = parseCandidateList(FEEDBACK_CONTACT_NO, FEEDBACK_CONTACT_NO).map((token) =>
      token.toLowerCase()
    );

    const rowsWithoutHeader = rows
      .slice(1)
      .filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
    return rowsWithoutHeader
      .map((columns) => {
        const rawDate = indices.date >= 0 ? columns[indices.date] : '';
        const parsedDate = parseDate(rawDate);
        const dateValue =
          parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

        const respondent = indices.respondent >= 0 ? String(columns[indices.respondent] ?? '').trim() : '';

        const location = indices.location >= 0 ? String(columns[indices.location] ?? '').trim() : '';

        const overallRating = indices.overall >= 0 ? parseFeedbackRatingCell(columns[indices.overall]) : null;
        const doctorsRating = indices.doctors >= 0 ? parseFeedbackRatingCell(columns[indices.doctors]) : null;
        const nursesRating = indices.nurses >= 0 ? parseFeedbackRatingCell(columns[indices.nurses]) : null;
        const aidesContact =
          indices.aidesContact >= 0
            ? parseFeedbackContactValue(columns[indices.aidesContact], yesCandidates, noCandidates)
            : null;
        const aidesRating = indices.aides >= 0 ? parseFeedbackRatingCell(columns[indices.aides]) : null;
        const waitingRating = indices.waiting >= 0 ? parseFeedbackRatingCell(columns[indices.waiting]) : null;

        const commentRaw = indices.comments >= 0 ? String(columns[indices.comments] ?? '').trim() : '';
        const hasComment = commentRaw.length > 0;

        const hasRating = [overallRating, doctorsRating, nursesRating, aidesRating, waitingRating].some(
          (value) => Number.isFinite(value)
        );
        const hasContact = aidesContact === true || aidesContact === false;
        const hasRespondent = respondent.length > 0;
        const hasLocation = location.length > 0;

        if (!dateValue && !hasRating && !hasRespondent && !hasContact && !hasLocation && !hasComment) {
          return null;
        }

        return {
          receivedAt: dateValue,
          respondent,
          location,
          overallRating: Number.isFinite(overallRating) ? overallRating : null,
          doctorsRating: Number.isFinite(doctorsRating) ? doctorsRating : null,
          nursesRating: Number.isFinite(nursesRating) ? nursesRating : null,
          aidesContact: hasContact ? aidesContact : null,
          aidesRating: Number.isFinite(aidesRating) ? aidesRating : null,
          waitingRating: Number.isFinite(waitingRating) ? waitingRating : null,
          comment: hasComment ? commentRaw : '',
        };
      })
      .filter(Boolean);
  };

  const fetchFeedbackData = async (options = {}) => {
    const config = settings?.dataSource?.feedback || DEFAULT_SETTINGS.dataSource.feedback;
    const url = (config?.url ?? '').trim();

    if (!url) {
      dashboardState.feedback.usingFallback = false;
      dashboardState.feedback.lastErrorMessage = TEXT.feedback.status.missingUrl;
      return [];
    }

    try {
      const download = await downloadCsv(url, { signal: options?.signal });
      const dataset = transformFeedbackCsv(download.text);
      dashboardState.feedback.usingFallback = false;
      dashboardState.feedback.lastErrorMessage = '';
      return dataset;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      const errorInfo = describeError(error, { code: 'FEEDBACK_FETCH' });
      console.error(errorInfo.log, error);
      dashboardState.feedback.lastErrorMessage = errorInfo.userMessage;
      dashboardState.feedback.usingFallback = false;
      return [];
    }
  };

  return {
    transformFeedbackCsv,
    fetchFeedbackData,
  };
}
