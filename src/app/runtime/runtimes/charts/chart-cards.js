function resolveChartCards(selectors) {
  return Array.isArray(selectors?.chartCards) ? selectors.chartCards : [];
}

export function clearChartError(selectors) {
  const cards = resolveChartCards(selectors);
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) {
      return;
    }
    delete card.dataset.error;
    const message = card.querySelector('.chart-card__message');
    if (message instanceof HTMLElement) {
      message.hidden = true;
      message.textContent = '';
    }
  });
}

export function showChartSkeletons(selectors) {
  const cards = resolveChartCards(selectors);
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    card.dataset.loading = 'true';
    const skeleton = card.querySelector('.chart-card__skeleton');
    if (skeleton instanceof HTMLElement) {
      skeleton.hidden = false;
    }
  });
}

export function hideChartSkeletons(selectors) {
  const cards = resolveChartCards(selectors);
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    delete card.dataset.loading;
    const skeleton = card.querySelector('.chart-card__skeleton');
    if (skeleton instanceof HTMLElement) {
      skeleton.hidden = true;
    }
  });
}

export function showChartError(selectors, message) {
  const cards = resolveChartCards(selectors);
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) {
      return;
    }
    card.dataset.error = 'true';
    const text = String(message || '').trim();
    const msgNode = card.querySelector('.chart-card__message');
    if (msgNode instanceof HTMLElement) {
      msgNode.hidden = !text;
      msgNode.textContent = text;
    }
  });
}

export function setChartCardMessage(element, message) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const card = element.closest('.chart-card');
  if (!(card instanceof HTMLElement)) {
    return;
  }
  const text = String(message || '').trim();
  const msgNode = card.querySelector('.chart-card__message');
  if (!(msgNode instanceof HTMLElement)) {
    return;
  }
  msgNode.hidden = !text;
  msgNode.textContent = text;
}
