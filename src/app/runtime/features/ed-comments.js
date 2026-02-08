export function createEdCommentsFeature(deps) {
  const {
    dashboardState,
    TEXT,
    statusTimeFormatter,
  } = deps;

  function resetEdCommentRotation() {
    const rotation = dashboardState?.ed?.commentRotation;
    if (rotation?.timerId) {
      window.clearInterval(rotation.timerId);
    }
    if (dashboardState?.ed) {
      dashboardState.ed.commentRotation = { timerId: null, index: 0, entries: [] };
    }
  }

  function applyEdCommentAutoScroll(wrapper) {
    if (!wrapper) {
      return;
    }
    const scroller = wrapper.querySelector('.ed-dashboard__comment-scroller');
    if (!scroller) {
      return;
    }

    scroller.style.removeProperty('--scroll-distance');
    scroller.style.removeProperty('--scroll-duration');
    scroller.style.transform = 'translateY(0)';
    wrapper.classList.remove('is-scrollable');

    window.requestAnimationFrame(() => {
      const containerHeight = wrapper.clientHeight;
      const contentHeight = scroller.scrollHeight;
      const overflow = contentHeight - containerHeight;
      if (overflow > 4) {
        const duration = Math.min(30000, Math.max(8000, overflow * 80));
        scroller.style.setProperty('--scroll-distance', `${overflow}px`);
        scroller.style.setProperty('--scroll-duration', `${duration}ms`);
        wrapper.classList.add('is-scrollable');
      }
    });
  }

  function renderEdCommentsCard(cardElement, cardConfig, rawComments, fallbackMeta = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'ed-dashboard__comment-wrapper';

    const scroller = document.createElement('div');
    scroller.className = 'ed-dashboard__comment-scroller';

    const content = document.createElement('p');
    content.className = 'ed-dashboard__comment';
    content.setAttribute('aria-live', 'polite');

    const meta = document.createElement('p');
    meta.className = 'ed-dashboard__card-meta ed-dashboard__comment-meta';

    scroller.append(content, meta);
    wrapper.appendChild(scroller);
    cardElement.appendChild(wrapper);

    const rotation = dashboardState.ed.commentRotation || { timerId: null, index: 0, entries: [] };
    if (rotation.timerId) {
      window.clearInterval(rotation.timerId);
    }

    const comments = Array.isArray(rawComments)
      ? rawComments.filter((item) => item && typeof item.text === 'string' && item.text.trim())
      : [];
    rotation.entries = comments.map((item) => ({
      ...item,
      text: item.text.trim(),
    }));
    rotation.index = 0;
    rotation.timerId = null;
    dashboardState.ed.commentRotation = rotation;

    if (!rotation.entries.length) {
      content.textContent = cardConfig.empty || TEXT.ed?.empty || '—';
      meta.textContent = typeof fallbackMeta === 'string' && fallbackMeta.trim().length
        ? fallbackMeta.trim()
        : (cardConfig.description || '');
      applyEdCommentAutoScroll(wrapper);
      return;
    }

    const renderEntry = (entry) => {
      content.textContent = entry?.text || (cardConfig.empty || TEXT.ed?.empty || '—');
      const metaParts = [];
      if (entry?.receivedAt instanceof Date && !Number.isNaN(entry.receivedAt.getTime())) {
        metaParts.push(statusTimeFormatter.format(entry.receivedAt));
      }
      if (entry?.respondent) {
        metaParts.push(entry.respondent);
      }
      if (entry?.location) {
        metaParts.push(entry.location);
      }
      if (!metaParts.length) {
        const metaText = typeof fallbackMeta === 'string' ? fallbackMeta.trim() : '';
        if (metaText) {
          metaParts.push(metaText);
        }
      }
      if (!metaParts.length && cardConfig?.description) {
        metaParts.push(cardConfig.description);
      }
      meta.textContent = metaParts.join(' • ');
      applyEdCommentAutoScroll(wrapper);
    };

    const rotateMs = Number.isFinite(Number(cardConfig.rotateMs)) ? Math.max(3000, Number(cardConfig.rotateMs)) : 10000;

    const advance = () => {
      const entry = rotation.entries[rotation.index] || rotation.entries[0];
      renderEntry(entry);
      if (rotation.entries.length > 1) {
        rotation.index = (rotation.index + 1) % rotation.entries.length;
      }
    };

    advance();
    if (rotation.entries.length > 1) {
      rotation.timerId = window.setInterval(advance, rotateMs);
    }
  }

  return {
    resetEdCommentRotation,
    renderEdCommentsCard,
  };
}
