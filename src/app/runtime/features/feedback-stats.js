export function computeFeedbackStats(records, options = {}) {
  const {
    FEEDBACK_RATING_MIN,
    FEEDBACK_RATING_MAX,
    formatLocalDateKey,
  } = options;

  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const sorted = list
    .slice()
    .sort((a, b) => {
      const aTime = a?.receivedAt instanceof Date ? a.receivedAt.getTime() : -Infinity;
      const bTime = b?.receivedAt instanceof Date ? b.receivedAt.getTime() : -Infinity;
      return bTime - aTime;
    });

  const comments = sorted
    .map((entry) => {
      const text = typeof entry?.comment === 'string' ? entry.comment.trim() : '';
      if (!text) {
        return null;
      }
      const receivedAt = entry?.receivedAt instanceof Date && !Number.isNaN(entry.receivedAt.getTime())
        ? entry.receivedAt
        : null;
      return {
        text,
        receivedAt,
        respondent: typeof entry?.respondent === 'string' ? entry.respondent.trim() : '',
        location: typeof entry?.location === 'string' ? entry.location.trim() : '',
      };
    })
    .filter(Boolean);

  const totalResponses = sorted.length;
  const collectValues = (key, predicate = null) => sorted
    .filter((entry) => (typeof predicate === 'function' ? predicate(entry) : true))
    .map((entry) => {
      const value = entry?.[key];
      return Number.isFinite(value) ? Number(value) : null;
    })
    .filter((value) => Number.isFinite(value)
      && value >= FEEDBACK_RATING_MIN
      && value <= FEEDBACK_RATING_MAX);

  const overallRatings = collectValues('overallRating');
  const doctorsRatings = collectValues('doctorsRating');
  const nursesRatings = collectValues('nursesRating');
  const aidesRatings = collectValues('aidesRating', (entry) => entry?.aidesContact === true);
  const waitingRatings = collectValues('waitingRating');

  const average = (values) => (values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null);

  const contactResponses = sorted
    .filter((entry) => entry?.aidesContact === true || entry?.aidesContact === false)
    .length;
  const contactYes = sorted.filter((entry) => entry?.aidesContact === true).length;
  const contactShare = contactResponses > 0 ? contactYes / contactResponses : null;

  const monthlyMap = new Map();
  sorted.forEach((entry) => {
    if (!(entry?.receivedAt instanceof Date) || Number.isNaN(entry.receivedAt.getTime())) {
      return;
    }
    const dateKey = formatLocalDateKey(entry.receivedAt);
    if (!dateKey) {
      return;
    }
    const monthKey = dateKey.slice(0, 7);
    if (!monthKey) {
      return;
    }
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: monthKey,
        responses: 0,
        overallSum: 0,
        overallCount: 0,
        doctorsSum: 0,
        doctorsCount: 0,
        nursesSum: 0,
        nursesCount: 0,
        aidesSum: 0,
        aidesCount: 0,
        waitingSum: 0,
        waitingCount: 0,
        contactResponses: 0,
        contactYes: 0,
      });
    }

    const bucket = monthlyMap.get(monthKey);
    bucket.responses += 1;

    if (Number.isFinite(entry?.overallRating)
      && entry.overallRating >= FEEDBACK_RATING_MIN
      && entry.overallRating <= FEEDBACK_RATING_MAX) {
      bucket.overallSum += Number(entry.overallRating);
      bucket.overallCount += 1;
    }
    if (Number.isFinite(entry?.doctorsRating)
      && entry.doctorsRating >= FEEDBACK_RATING_MIN
      && entry.doctorsRating <= FEEDBACK_RATING_MAX) {
      bucket.doctorsSum += Number(entry.doctorsRating);
      bucket.doctorsCount += 1;
    }
    if (Number.isFinite(entry?.nursesRating)
      && entry.nursesRating >= FEEDBACK_RATING_MIN
      && entry.nursesRating <= FEEDBACK_RATING_MAX) {
      bucket.nursesSum += Number(entry.nursesRating);
      bucket.nursesCount += 1;
    }
    if (entry?.aidesContact === true
      && Number.isFinite(entry?.aidesRating)
      && entry.aidesRating >= FEEDBACK_RATING_MIN
      && entry.aidesRating <= FEEDBACK_RATING_MAX) {
      bucket.aidesSum += Number(entry.aidesRating);
      bucket.aidesCount += 1;
    }
    if (Number.isFinite(entry?.waitingRating)
      && entry.waitingRating >= FEEDBACK_RATING_MIN
      && entry.waitingRating <= FEEDBACK_RATING_MAX) {
      bucket.waitingSum += Number(entry.waitingRating);
      bucket.waitingCount += 1;
    }
    if (entry?.aidesContact === true) {
      bucket.contactResponses += 1;
      bucket.contactYes += 1;
    } else if (entry?.aidesContact === false) {
      bucket.contactResponses += 1;
    }
  });

  const monthly = Array.from(monthlyMap.values()).map((bucket) => ({
    month: bucket.month,
    responses: bucket.responses,
    overallAverage: bucket.overallCount > 0 ? bucket.overallSum / bucket.overallCount : null,
    doctorsAverage: bucket.doctorsCount > 0 ? bucket.doctorsSum / bucket.doctorsCount : null,
    nursesAverage: bucket.nursesCount > 0 ? bucket.nursesSum / bucket.nursesCount : null,
    aidesAverage: bucket.aidesCount > 0 ? bucket.aidesSum / bucket.aidesCount : null,
    waitingAverage: bucket.waitingCount > 0 ? bucket.waitingSum / bucket.waitingCount : null,
    contactResponses: bucket.contactResponses,
    contactShare: bucket.contactResponses > 0 ? bucket.contactYes / bucket.contactResponses : null,
  }));

  const monthlySorted = monthly.slice().sort((a, b) => {
    if (a?.month === b?.month) {
      return 0;
    }
    if (!a?.month) {
      return 1;
    }
    if (!b?.month) {
      return -1;
    }
    return a.month > b.month ? 1 : -1;
  });

  return {
    summary: {
      totalResponses,
      overallAverage: average(overallRatings),
      doctorsAverage: average(doctorsRatings),
      nursesAverage: average(nursesRatings),
      aidesAverage: average(aidesRatings),
      waitingAverage: average(waitingRatings),
      overallCount: overallRatings.length,
      doctorsCount: doctorsRatings.length,
      nursesCount: nursesRatings.length,
      aidesResponses: aidesRatings.length,
      waitingCount: waitingRatings.length,
      contactResponses,
      contactYes,
      contactShare,
      comments,
    },
    monthly: monthlySorted,
  };
}
