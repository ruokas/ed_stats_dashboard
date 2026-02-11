export function createFunnelCanvasFeature(deps) {
  const {
    TEXT,
    getThemeStyleTarget,
    parseColorToRgb,
    relativeLuminance,
    rgbToRgba,
    numberFormatter,
    percentFormatter,
  } = deps;

  function buildFunnelTextPalette(baseColor) {
    const fallbackRgb = { r: 15, g: 23, b: 42 };
    const rgb = parseColorToRgb(baseColor) || fallbackRgb;
    const luminance = relativeLuminance(rgb);
    const isLightText = luminance > 0.55;
    return {
      value: rgbToRgba(rgb, isLightText ? 0.94 : 0.98),
      label: rgbToRgba(rgb, isLightText ? 0.82 : 0.74),
      percent: rgbToRgba(rgb, isLightText ? 0.72 : 0.66),
      guide: rgbToRgba(rgb, isLightText ? 0.52 : 0.22),
      outline: rgbToRgba(rgb, isLightText ? 0.36 : 0.2),
      fallback: rgbToRgba(rgb, isLightText ? 0.9 : 0.92),
      shadow: isLightText ? 'rgba(8, 12, 32, 0.45)' : 'rgba(255, 255, 255, 0.3)',
      shadowBlur: isLightText ? 8 : 5,
    };
  }

  function drawFunnelShape(canvas, steps, accentColor, textColor) {
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const rawValues = steps.map((step) => step.value || 0);
    const baselineValue = rawValues.length ? rawValues[0] : 0;
    const maxValue = Math.max(baselineValue, ...rawValues);
    const fontFamily = getComputedStyle(getThemeStyleTarget()).fontFamily;
    const textPalette = buildFunnelTextPalette(textColor);

    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      ctx.fillStyle = textPalette.fallback;
      ctx.font = `500 14px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TEXT.charts.funnelEmpty || 'Piltuvėlio duomenų nėra.', width / 2, height / 2);
      ctx.restore();
      return;
    }

    const paddingX = Math.max(24, Math.min(56, width * 0.1));
    const paddingTop = Math.max(24, height * 0.08);
    const labelAreaHeight = Math.max(72, height * 0.22);
    const paddingBottom = Math.max(32, height * 0.12);
    const funnelHeight = Math.max(48, height - paddingTop - labelAreaHeight - paddingBottom);
    const centerY = paddingTop + labelAreaHeight + funnelHeight / 2;
    const stepsCount = steps.length;
    const xSpacing = stepsCount > 1 ? (width - paddingX * 2) / (stepsCount - 1) : 0;
    const xPositions = steps.map((_, index) => (stepsCount > 1 ? paddingX + index * xSpacing : width / 2));
    const referenceValue = baselineValue > 0 ? baselineValue : maxValue;
    const maxThickness = funnelHeight;
    const minThickness = Math.max(18, maxThickness * 0.18);
    const thicknesses = steps.map((step) => {
      const value = Math.max(0, step.value || 0);
      if (!Number.isFinite(value) || referenceValue <= 0) {
        return minThickness;
      }
      const rawRatio = value / referenceValue;
      const safeRatio = Math.min(1, Math.max(0, rawRatio));
      return Math.max(minThickness, safeRatio * maxThickness);
    });

    const topPoints = xPositions.map((x, index) => ({ x, y: centerY - thicknesses[index] / 2 }));
    const bottomPoints = xPositions.map((x, index) => ({ x, y: centerY + thicknesses[index] / 2 })).reverse();

    const accentGradientColor =
      typeof accentColor === 'string' && accentColor.trim() ? accentColor : '#8b5cf6';
    const gradient = ctx.createLinearGradient(
      paddingX,
      topPoints[0]?.y ?? centerY,
      width - paddingX,
      bottomPoints[0]?.y ?? centerY
    );
    gradient.addColorStop(0, '#ffb56b');
    gradient.addColorStop(0.45, '#ff6f91');
    gradient.addColorStop(0.78, '#f472b6');
    gradient.addColorStop(1, accentGradientColor);

    ctx.beginPath();
    if (topPoints.length) {
      ctx.moveTo(topPoints[0].x, topPoints[0].y);
      for (let i = 1; i < topPoints.length; i += 1) {
        const prev = topPoints[i - 1];
        const current = topPoints[i];
        const midX = (prev.x + current.x) / 2;
        ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
      }
    }
    if (bottomPoints.length) {
      ctx.lineTo(bottomPoints[0].x, bottomPoints[0].y);
      for (let i = 1; i < bottomPoints.length; i += 1) {
        const prev = bottomPoints[i - 1];
        const current = bottomPoints[i];
        const midX = (prev.x + current.x) / 2;
        ctx.bezierCurveTo(midX, prev.y, midX, current.y, current.x, current.y);
      }
    }
    ctx.closePath();

    ctx.shadowColor = 'rgba(15, 23, 42, 0.5)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = textPalette.outline;
    ctx.stroke();

    const funnelTop = topPoints.length
      ? Math.min(...topPoints.map((point) => point.y))
      : paddingTop + labelAreaHeight;
    const funnelBottom = bottomPoints.length
      ? Math.max(...bottomPoints.map((point) => point.y))
      : centerY + maxThickness / 2;

    const valueFontSize = Math.max(22, Math.min(34, width * 0.05));
    const labelFontSize = Math.max(12, Math.min(16, valueFontSize * 0.45));
    const percentFontSize = Math.max(11, Math.min(14, valueFontSize * 0.38));
    const valueBaselineY = paddingTop + valueFontSize;
    const labelBaselineY = valueBaselineY + labelFontSize + 6;
    const percentBaselineY = labelBaselineY + percentFontSize + 6;
    const labelAreaBottom = percentBaselineY + 6;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = textPalette.shadow;
    ctx.shadowBlur = textPalette.shadowBlur;
    ctx.shadowOffsetY = 1;

    steps.forEach((step, index) => {
      const x = xPositions[index];
      const rawValue = Math.max(0, step.value || 0);
      const ratio = referenceValue > 0 ? Math.max(0, rawValue / referenceValue) : 0;
      ctx.fillStyle = textPalette.value;
      ctx.font = `700 ${valueFontSize}px ${fontFamily}`;
      ctx.fillText(numberFormatter.format(Math.round(rawValue)), x, valueBaselineY);
      ctx.fillStyle = textPalette.label;
      ctx.font = `500 ${labelFontSize}px ${fontFamily}`;
      ctx.fillText(step.label, x, labelBaselineY);
      ctx.fillStyle = textPalette.percent;
      ctx.font = `600 ${percentFontSize}px ${fontFamily}`;
      ctx.fillText(percentFormatter.format(ratio), x, percentBaselineY);
    });

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (stepsCount > 0) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = textPalette.guide;
      steps.forEach((_, index) => {
        const x = xPositions[index];
        const lineStartY = Math.min(funnelTop - 6, labelAreaBottom + 12);
        ctx.beginPath();
        ctx.moveTo(x, lineStartY);
        ctx.lineTo(x, funnelBottom + 18);
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  function renderFunnelShape(canvas, funnelData, accentColor, textColor) {
    if (!canvas) {
      return;
    }

    const stepsConfig =
      Array.isArray(TEXT.charts.funnelSteps) && TEXT.charts.funnelSteps.length
        ? TEXT.charts.funnelSteps
        : [
            { key: 'arrived', label: 'Atvykę' },
            { key: 'discharged', label: 'Išleisti' },
            { key: 'hospitalized', label: 'Hospitalizuoti' },
          ];

    const steps = stepsConfig.map((step) => ({
      label: step.label,
      value: Number.isFinite(Number(funnelData?.[step.key])) ? Number(funnelData[step.key]) : 0,
    }));

    canvas.__funnelState = { steps, accentColor, textColor };

    if (!canvas.__funnelObserver && typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (canvas.__funnelState) {
          const {
            steps: currentSteps,
            accentColor: currentAccent,
            textColor: currentText,
          } = canvas.__funnelState;
          drawFunnelShape(canvas, currentSteps, currentAccent, currentText);
        }
      });
      observer.observe(canvas);
      canvas.__funnelObserver = observer;
    }

    drawFunnelShape(canvas, steps, accentColor, textColor);
  }

  return {
    renderFunnelShape,
  };
}
