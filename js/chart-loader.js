/**
 * Chart.js loader helper – ensures the library is loaded once and reused.
 */
let chartJsPromise = null;

export function loadChartJs() {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }

  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.async = true;
      script.onload = () => resolve(window.Chart ?? null);
      script.onerror = (error) => {
        console.error('Nepavyko įkelti Chart.js bibliotekos:', error);
        chartJsPromise = null;
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  return chartJsPromise;
}

/**
 * Preloads Chart.js right away so that charts render faster when needed.
 * @returns {Promise<typeof window.Chart|null>}
 */
export function preloadChartJs() {
  return loadChartJs();
}
