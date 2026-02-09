export function createEdRenderBridgeFeature(deps) {
  const {
    getEdRenderer,
    getChartRenderers,
  } = deps;

  async function renderEdDashboard(edData) {
    const renderer = getEdRenderer();
    if (!renderer || typeof renderer.renderEdDashboard !== 'function') {
      return;
    }
    return renderer.renderEdDashboard(edData);
  }

  async function renderEdDispositionsChart(dispositions, text, displayVariant) {
    const renderers = getChartRenderers();
    if (!renderers || typeof renderers.renderEdDispositionsChart !== 'function') {
      return;
    }
    return renderers.renderEdDispositionsChart(dispositions, text, displayVariant);
  }

  return {
    renderEdDashboard,
    renderEdDispositionsChart,
  };
}
