export function initScrollTopButton(env) {
  const { selectors, updateScrollTopButtonVisibility, scheduleScrollTopUpdate } = env;
  const button = selectors.scrollTopBtn;
  if (!button) {
    return;
  }
  button.setAttribute('aria-hidden', 'true');
  button.setAttribute('tabindex', '-1');
  updateScrollTopButtonVisibility();
  button.addEventListener('click', () => {
    const prefersReduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof window.scrollTo === 'function') {
      if (!prefersReduced && 'scrollBehavior' in document.documentElement.style) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });
  window.addEventListener('scroll', scheduleScrollTopUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollTopUpdate, { passive: true });
}
