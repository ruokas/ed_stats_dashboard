import { setSectionTitle } from './text-common.js';

export function applyFeedbackText({
  selectors,
  TEXT,
  getDatasetValue,
  populateFeedbackFilterControls,
  syncFeedbackFilterControls,
  updateFeedbackFiltersSummary,
  updateFeedbackTrendSubtitle,
  syncFeedbackTrendControls,
}) {
  setSectionTitle(selectors.feedbackHeading, TEXT.feedback.title);
  if (selectors.feedbackSubtitle) {
    selectors.feedbackSubtitle.textContent = TEXT.feedback.subtitle;
  }
  if (selectors.feedbackDescription) {
    selectors.feedbackDescription.textContent = TEXT.feedback.description;
  }

  const feedbackFiltersText = TEXT.feedback?.filters || {};
  if (selectors.feedbackRespondentLabel) {
    selectors.feedbackRespondentLabel.textContent = feedbackFiltersText.respondent?.label || 'Kas pildo anketą';
  }
  if (selectors.feedbackLocationLabel) {
    selectors.feedbackLocationLabel.textContent = feedbackFiltersText.location?.label || 'Šaltinis';
  }

  populateFeedbackFilterControls();
  syncFeedbackFilterControls();
  updateFeedbackFiltersSummary();

  if (selectors.feedbackTrendTitle) {
    selectors.feedbackTrendTitle.textContent = TEXT.feedback.trend.title;
  }
  updateFeedbackTrendSubtitle();

  if (selectors.feedbackTrendControlsLabel) {
    selectors.feedbackTrendControlsLabel.textContent = TEXT.feedback.trend.controlsLabel;
  }
  if (selectors.feedbackTrendButtons && selectors.feedbackTrendButtons.length) {
    const periodConfig = Array.isArray(TEXT.feedback.trend.periods) ? TEXT.feedback.trend.periods : [];
    selectors.feedbackTrendButtons.forEach((button) => {
      const months = Number.parseInt(getDatasetValue(button, 'trendMonths', ''), 10);
      const config = periodConfig.find((item) => Number.parseInt(item?.months, 10) === months);
      if (config?.label) {
        button.textContent = config.label;
      }
      if (config?.hint) {
        button.title = config.hint;
      } else {
        button.removeAttribute('title');
      }
    });
  }
  syncFeedbackTrendControls();

  if (selectors.feedbackCaption) {
    selectors.feedbackCaption.textContent = TEXT.feedback.table.caption;
  }
  if (selectors.feedbackColumnMonth) {
    selectors.feedbackColumnMonth.textContent = TEXT.feedback.table.headers.month;
  }
  if (selectors.feedbackColumnResponses) {
    selectors.feedbackColumnResponses.textContent = TEXT.feedback.table.headers.responses;
  }
  if (selectors.feedbackColumnOverall) {
    selectors.feedbackColumnOverall.textContent = TEXT.feedback.table.headers.overall;
  }
  if (selectors.feedbackColumnDoctors) {
    selectors.feedbackColumnDoctors.textContent = TEXT.feedback.table.headers.doctors;
  }
  if (selectors.feedbackColumnNurses) {
    selectors.feedbackColumnNurses.textContent = TEXT.feedback.table.headers.nurses;
  }
  if (selectors.feedbackColumnAides) {
    selectors.feedbackColumnAides.textContent = TEXT.feedback.table.headers.aides;
  }
  if (selectors.feedbackColumnWaiting) {
    selectors.feedbackColumnWaiting.textContent = TEXT.feedback.table.headers.waiting;
  }
  if (selectors.feedbackColumnContact) {
    selectors.feedbackColumnContact.textContent = TEXT.feedback.table.headers.contact;
  }
}
