export async function renderEdDispositionsChart(env, dispositions, text, displayVariant) {
  const {
    dashboardState,
    selectors,
    loadChartJs,
    getThemePalette,
    getThemeStyleTarget,
    percentFormatter,
  } = env;

  const canvas = selectors.edDispositionsChart;
  const messageEl = selectors.edDispositionsMessage || null;

  if (!canvas) {
    if (messageEl) {
      messageEl.textContent = '';
      messageEl.hidden = true;
    }
    return;
  }

  if (messageEl) {
    messageEl.textContent = '';
    messageEl.hidden = true;
  }

  const validEntries = Array.isArray(dispositions)
    ? dispositions
      .filter((entry) => Number.isFinite(entry?.count) && entry.count >= 0)
      .map((entry, index) => ({
        ...entry,
        categoryKey: entry?.categoryKey != null ? String(entry.categoryKey) : null,
        label: entry?.label || `Kategorija ${entry?.categoryKey ?? index + 1}`,
      }))
    : [];

  if (!validEntries.length) {
    canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true');
    if (messageEl) {
      messageEl.textContent = text?.empty || 'Nėra duomenų grafiko sudarymui.';
      messageEl.hidden = false;
    }
    return;
  }

  const Chart = await loadChartJs();
  if (!Chart) {
    throw new Error('Chart.js biblioteka nepasiekiama');
  }
  if (!dashboardState.chartLib) {
    dashboardState.chartLib = Chart;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Nepavyko gauti grafiko konteksto');
  }

  canvas.hidden = false;
  canvas.removeAttribute('aria-hidden');
  if (text?.caption) {
    canvas.setAttribute('aria-description', text.caption);
  } else {
    canvas.removeAttribute('aria-description');
  }

  const palette = getThemePalette();
  const styleTarget = getThemeStyleTarget();
  const computedStyles = getComputedStyle(styleTarget);
  const theme = styleTarget?.dataset?.theme || 'light';

  const CATEGORY_COLORS = {
    '1': '#2563eb',
    '2': '#ef4444',
    '3': '#f59e0b',
    '4': '#10b981',
    '5': '#6366f1',
  };

  const colors = validEntries.map((entry, index) => {
    const fallback = index % 2 === 0 ? palette.accent : palette.weekendAccent;
    return CATEGORY_COLORS[entry.categoryKey] || fallback;
  });

  const total = validEntries.reduce((sum, entry) => sum + entry.count, 0);
  const legendLabels = validEntries.map((entry) => ({
    label: entry.label,
    count: entry.count,
    share: total > 0 ? entry.count / total : null,
  }));

  const legendBuilder = text?.legendBuilder;
  const legendFormatter = typeof legendBuilder === 'function'
    ? legendBuilder
    : (item) => {
        if (Number.isFinite(item.share)) {
          return `${item.label} (${percentFormatter.format(item.share)})`;
        }
        return item.label;
      };

  Chart.defaults.color = palette.textColor;
  Chart.defaults.font.family = computedStyles.fontFamily;
  Chart.defaults.borderColor = palette.gridColor;

  const datasetLabel = text?.title || 'Pacientų kategorijos';
  const labelTextColor = (color, lightText, darkText) => {
    if (typeof color !== 'string') {
      return lightText;
    }
    const hexMatch = color.trim().match(/^#?([a-f\d]{6})$/i);
    let r;
    let g;
    let b;
    if (hexMatch) {
      const numeric = Number.parseInt(hexMatch[1], 16);
      r = (numeric >> 16) & 255;
      g = (numeric >> 8) & 255;
      b = numeric & 255;
    } else {
      const rgbMatch = color.trim().match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        r = Number(rgbMatch[1]);
        g = Number(rgbMatch[2]);
        b = Number(rgbMatch[3]);
      }
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return lightText;
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? darkText : lightText;
  };

  const categoryLabelPlugin = {
    id: 'edCategoryLabels',
    afterDatasetsDraw(chart) {
      const dataset = chart.data.datasets?.[0];
      if (!dataset) {
        return;
      }
      const labelState = chart.$edLabelState || {};
      const runtimeEntries = Array.isArray(labelState.validEntries) ? labelState.validEntries : [];
      const runtimeColors = Array.isArray(labelState.colors) ? labelState.colors : [];
      const runtimeTotal = Number.isFinite(labelState.total) ? labelState.total : 0;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data) {
        return;
      }
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 12px ${computedStyles.fontFamily}`;
      const shadowColor = theme === 'dark'
        ? 'rgba(15, 23, 42, 0.72)'
        : 'rgba(15, 23, 42, 0.58)';
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      meta.data.forEach((element, index) => {
        const value = Number.isFinite(dataset.data?.[index]) ? dataset.data[index] : 0;
        if (!value) {
          return;
        }
        const share = runtimeTotal > 0 ? value / runtimeTotal : null;
        const percent = Number.isFinite(share) ? percentFormatter.format(share) : '';
        const pos = element.tooltipPosition();
        const fill = labelTextColor(runtimeColors[index], '#ffffff', '#0f172a');
        const categoryLabel = runtimeEntries[index]?.categoryKey || String(index + 1);
        ctx.fillStyle = fill;
        ctx.font = `800 24px ${computedStyles.fontFamily}`;
        ctx.fillText(String(categoryLabel), pos.x, pos.y - (percent ? 12 : 0));
        if (percent) {
          ctx.font = `700 16px ${computedStyles.fontFamily}`;
          ctx.fillText(percent, pos.x, pos.y + 12);
        }
      });
      ctx.restore();
    },
  };

  const existingChart = dashboardState.charts.edDispositions;
  if (existingChart && existingChart.canvas !== canvas && typeof existingChart.destroy === 'function') {
    existingChart.destroy();
    dashboardState.charts.edDispositions = null;
  }
  const activeChart = dashboardState.charts.edDispositions;
  const targetData = {
    labels: legendLabels.map((item) => legendFormatter(item)),
    datasets: [{
      label: datasetLabel,
      data: validEntries.map((entry) => entry.count),
      backgroundColor: colors,
      borderColor: theme === 'dark' ? palette.surface : '#ffffff',
      borderWidth: 2,
      hoverOffset: 12,
    }],
  };
  if (activeChart && typeof activeChart.update === 'function') {
    activeChart.data.labels = targetData.labels;
    activeChart.data.datasets[0] = targetData.datasets[0];
    activeChart.$edLabelState = { validEntries, colors, total };
    activeChart.update('none');
    return;
  }

  dashboardState.charts.edDispositions = new Chart(ctx, {
    type: 'doughnut',
    data: targetData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed || 0;
              const share = total > 0 ? value / total : null;
              const formattedShare = Number.isFinite(share) ? percentFormatter.format(share) : '';
              const label = context.label || '';
              return formattedShare ? `${label}: ${value} (${formattedShare})` : `${label}: ${value}`;
            },
          },
        },
      },
    },
    plugins: [categoryLabelPlugin],
  });
  dashboardState.charts.edDispositions.$edLabelState = { validEntries, colors, total };
}
