export function createEdCardsFeature(deps) {
  const {
    ED_TOTAL_BEDS,
    numberFormatter,
    oneDecimalFormatter,
    percentFormatter,
    setDatasetValue,
  } = deps;

  function formatEdCardValue(rawValue, format) {
    switch (format) {
      case 'text':
        if (typeof rawValue === 'string') {
          const trimmed = rawValue.trim();
          return trimmed.length ? trimmed : null;
        }
        return null;
      case 'hours':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return oneDecimalFormatter.format(rawValue / 60);
      case 'minutes':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return numberFormatter.format(Math.round(rawValue));
      case 'percent':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return percentFormatter.format(rawValue);
      case 'oneDecimal':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return oneDecimalFormatter.format(rawValue);
      case 'ratio':
        if (!Number.isFinite(rawValue) || rawValue <= 0) {
          return null;
        }
        return `1:${oneDecimalFormatter.format(rawValue)}`;
      case 'multiplier':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return `${oneDecimalFormatter.format(rawValue)}×`;
      case 'beds':
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        {
          const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? ED_TOTAL_BEDS : 0;
          const occupied = Math.max(0, Math.round(rawValue));
          if (totalBeds > 0) {
            const share = occupied / totalBeds;
            const percentText = percentFormatter.format(share);
            return `${numberFormatter.format(occupied)}/${numberFormatter.format(totalBeds)} (${percentText})`;
          }
          return numberFormatter.format(occupied);
        }
      default:
        if (!Number.isFinite(rawValue)) {
          return null;
        }
        return numberFormatter.format(rawValue);
    }
  }

  function normalizePercentValue(rawValue) {
    if (!Number.isFinite(rawValue)) {
      return null;
    }
    if (rawValue < 0) {
      return 0;
    }
    if (rawValue <= 1) {
      return rawValue;
    }
    if (rawValue <= 100) {
      return rawValue / 100;
    }
    return 1;
  }

  function getEdCardDeltaInfo(primaryRaw, secondaryRaw, format) {
    if (!Number.isFinite(primaryRaw) || !Number.isFinite(secondaryRaw)) {
      return null;
    }
    const diff = primaryRaw - secondaryRaw;
    if (!Number.isFinite(diff)) {
      return null;
    }

    let trend = 'neutral';
    if (diff > 0) {
      trend = 'up';
    } else if (diff < 0) {
      trend = 'down';
    }

    const reference = formatEdCardValue(secondaryRaw, format);
    let valueText = '';
    let ariaValue = '';

    switch (format) {
      case 'hours': {
        const hours = Math.abs(diff) / 60;
        const rounded = Math.round(hours * 10) / 10;
        if (!rounded) {
          trend = 'neutral';
        }
        valueText = `${oneDecimalFormatter.format(rounded)} val.`;
        ariaValue = `${oneDecimalFormatter.format(rounded)} valandos`;
        break;
      }
      case 'minutes': {
        const minutes = Math.round(Math.abs(diff));
        if (!minutes) {
          trend = 'neutral';
        }
        valueText = `${numberFormatter.format(minutes)} min.`;
        ariaValue = `${numberFormatter.format(minutes)} minutės`;
        break;
      }
      case 'percent': {
        const normalized = Math.abs(diff) <= 1 ? Math.abs(diff) * 100 : Math.abs(diff);
        const rounded = Math.round(normalized * 10) / 10;
        if (!rounded) {
          trend = 'neutral';
        }
        valueText = `${oneDecimalFormatter.format(rounded)} p.p.`;
        ariaValue = `${oneDecimalFormatter.format(rounded)} procentinio punkto`;
        break;
      }
      case 'oneDecimal': {
        const absolute = Math.abs(diff);
        const rounded = Math.round(absolute * 10) / 10;
        if (!rounded) {
          trend = 'neutral';
        }
        valueText = oneDecimalFormatter.format(rounded);
        ariaValue = `${oneDecimalFormatter.format(rounded)} vienetai`;
        break;
      }
      case 'ratio':
        return null;
      default: {
        const absolute = Math.abs(diff);
        const rounded = Math.round(absolute);
        if (!rounded) {
          trend = 'neutral';
        }
        valueText = numberFormatter.format(rounded);
        ariaValue = `${numberFormatter.format(rounded)} vienetai`;
      }
    }

    if (trend === 'neutral') {
      return {
        trend: 'neutral',
        arrow: '→',
        text: 'Be pokyčio',
        reference,
        ariaLabel: reference
          ? `Pokytis lyginant su ${reference}: be pokyčio`
          : 'Pokytis: be pokyčio',
      };
    }

    const arrow = trend === 'up' ? '↑' : '↓';
    const sign = trend === 'up' ? '+' : '−';
    return {
      trend,
      arrow,
      text: `${sign}${valueText}`,
      reference,
      ariaLabel: reference
        ? `Pokytis lyginant su ${reference}: ${sign}${ariaValue}`
        : `Pokytis: ${sign}${ariaValue}`,
    };
  }

  function buildFeedbackTrendInfo(currentValue, previousValue, { currentLabel = '', previousLabel = '' } = {}) {
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
      return null;
    }

    const diff = currentValue - previousValue;
    const absDiff = Math.round(Math.abs(diff) * 10) / 10;

    let trend = 'neutral';
    if (diff > 0) {
      trend = 'up';
    } else if (diff < 0) {
      trend = 'down';
    }

    if (!absDiff) {
      trend = 'neutral';
    }

    const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    const sign = trend === 'down' ? '−' : '+';
    const previous = oneDecimalFormatter.format(previousValue);
    const current = oneDecimalFormatter.format(currentValue);
    const referenceLabel = previousLabel || 'praėjusiu mėnesiu';
    const changeSummary = trend === 'neutral'
      ? 'Pokyčio nėra'
      : `${sign}${oneDecimalFormatter.format(absDiff)}`;
    const rangeText = previous && current ? `(${previous} → ${current})` : '';
    const text = [changeSummary, rangeText].filter(Boolean).join(' ');
    const ariaLabel = trend === 'neutral'
      ? `Pokyčio nėra lyginant su ${referenceLabel}. Dabartinis: ${current}.`
      : `Pokytis lyginant su ${referenceLabel}: ${sign}${oneDecimalFormatter.format(absDiff)} (nuo ${previous} iki ${current}).`;

    return {
      trend,
      arrow,
      text,
      ariaLabel,
      previousValue,
      previousLabel,
      currentValue,
      currentLabel,
    };
  }

  function buildEdCardVisuals(config, primaryRaw, secondaryRaw, summary) {
    const visuals = [];

    if (config.format === 'percent' && Number.isFinite(primaryRaw)) {
      const normalized = normalizePercentValue(primaryRaw);
      if (normalized != null) {
        const progress = document.createElement('div');
        progress.className = 'ed-dashboard__card-progress';
        progress.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('div');
        fill.className = 'ed-dashboard__card-progress-fill';
        fill.setAttribute('aria-hidden', 'true');
        const width = `${Math.max(0, Math.min(100, normalized * 100))}%`;
        fill.style.setProperty('--progress-width', width);
        progress.appendChild(fill);

        if (Number.isFinite(secondaryRaw)) {
          const normalizedSecondary = normalizePercentValue(secondaryRaw);
          if (normalizedSecondary != null) {
            const marker = document.createElement('span');
            marker.className = 'ed-dashboard__card-progress-marker';
            marker.setAttribute('aria-hidden', 'true');
            marker.style.left = `${Math.max(0, Math.min(100, normalizedSecondary * 100))}%`;
            const secondaryText = formatEdCardValue(secondaryRaw, config.format);
            if (secondaryText) {
              marker.title = `Lyginamasis rodiklis: ${secondaryText}`;
            }
            progress.appendChild(marker);
          }
        }

        visuals.push(progress);
      }
    } else if (config.format === 'beds' && Number.isFinite(primaryRaw)) {
      const totalBeds = Number.isFinite(ED_TOTAL_BEDS) ? Math.max(ED_TOTAL_BEDS, 0) : 0;
      if (totalBeds > 0) {
        const occupancyShare = Math.max(0, Math.min(1, primaryRaw / totalBeds));
        const occupancyLevel = occupancyShare > 0.7
          ? 'critical'
          : occupancyShare > 0.5
            ? 'elevated'
            : 'normal';
        const progress = document.createElement('div');
        progress.className = 'ed-dashboard__card-progress';
        progress.setAttribute('aria-hidden', 'true');
        setDatasetValue(progress, 'occupancyLevel', occupancyLevel);
        const fill = document.createElement('div');
        fill.className = 'ed-dashboard__card-progress-fill';
        fill.setAttribute('aria-hidden', 'true');
        setDatasetValue(fill, 'occupancyLevel', occupancyLevel);
        const width = `${Math.round(occupancyShare * 1000) / 10}%`;
        fill.style.setProperty('--progress-width', width);
        const occupancyText = percentFormatter.format(occupancyShare);
        progress.title = `Užimtumas: ${numberFormatter.format(Math.round(primaryRaw))}/${numberFormatter.format(totalBeds)} (${occupancyText})`;
        progress.appendChild(fill);
        visuals.push(progress);
      }
    }

    if (config.secondaryKey) {
      const deltaInfo = getEdCardDeltaInfo(primaryRaw, secondaryRaw, config.format);
      if (deltaInfo) {
        const delta = document.createElement('p');
        delta.className = 'ed-dashboard__card-delta';
        setDatasetValue(delta, 'trend', deltaInfo.trend);
        delta.setAttribute('aria-label', deltaInfo.ariaLabel);
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'ed-dashboard__card-delta-arrow';
        arrowSpan.textContent = deltaInfo.arrow;
        const textSpan = document.createElement('span');
        textSpan.className = 'ed-dashboard__card-delta-text';
        textSpan.textContent = deltaInfo.text;
        delta.append(arrowSpan, textSpan);
        if (deltaInfo.reference) {
          const referenceSpan = document.createElement('span');
          referenceSpan.className = 'ed-dashboard__card-delta-reference';
          referenceSpan.textContent = `vs ${deltaInfo.reference}`;
          delta.appendChild(referenceSpan);
        }
        visuals.push(delta);
      }
    } else if (config.trendKey && summary?.[config.trendKey]) {
      const trendInfo = summary[config.trendKey];
      const delta = document.createElement('p');
      delta.className = 'ed-dashboard__card-delta';
      setDatasetValue(delta, 'trend', trendInfo.trend || 'neutral');
      if (trendInfo.ariaLabel) {
        delta.setAttribute('aria-label', trendInfo.ariaLabel);
      }

      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'ed-dashboard__card-delta-arrow';
      arrowSpan.textContent = trendInfo.arrow || '→';

      const textSpan = document.createElement('span');
      textSpan.className = 'ed-dashboard__card-delta-text';
      textSpan.textContent = trendInfo.text || '';

      delta.append(arrowSpan, textSpan);

      if (trendInfo.previousLabel) {
        const referenceSpan = document.createElement('span');
        referenceSpan.className = 'ed-dashboard__card-delta-reference';
        referenceSpan.textContent = `vs ${trendInfo.previousLabel}`;
        delta.appendChild(referenceSpan);
      }

      visuals.push(delta);
    }

    return visuals;
  }

  return {
    formatEdCardValue,
    buildFeedbackTrendInfo,
    buildEdCardVisuals,
  };
}
