let chartJsPromise = null;

export function loadChartJs() {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }

  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.defer = true;
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
