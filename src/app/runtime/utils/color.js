export function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

export function parseColorToRgb(color) {
  if (typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((channel) => Number.isFinite(channel))) {
        return { r, g, b };
      }
    }
    return null;
  }
  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value, index) => index < 3 && Number.isFinite(value));
    if (parts.length === 3) {
      const [r, g, b] = parts;
      return { r: clampColorChannel(r), g: clampColorChannel(g), b: clampColorChannel(b) };
    }
  }
  return null;
}

export function relativeLuminance({ r, g, b }) {
  const normalize = (channel) => {
    const ratio = channel / 255;
    if (ratio <= 0.03928) {
      return ratio / 12.92;
    }
    return ((ratio + 0.055) / 1.055) ** 2.4;
  };
  const linearR = normalize(clampColorChannel(r));
  const linearG = normalize(clampColorChannel(g));
  const linearB = normalize(clampColorChannel(b));
  return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
}

export function rgbToRgba(rgb, alpha) {
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const formattedAlpha = safeAlpha === 1 ? '1' : Number(safeAlpha.toFixed(3)).toString();
  return `rgba(${clampColorChannel(rgb.r)}, ${clampColorChannel(rgb.g)}, ${clampColorChannel(rgb.b)}, ${formattedAlpha})`;
}

export function ensureRgb(color, fallback) {
  const parsed = typeof color === 'string' ? parseColorToRgb(color) : null;
  if (parsed) {
    return parsed;
  }
  if (fallback && typeof fallback === 'object') {
    const { r, g, b } = fallback;
    if ([r, g, b].every((channel) => Number.isFinite(channel))) {
      return {
        r: clampColorChannel(r),
        g: clampColorChannel(g),
        b: clampColorChannel(b),
      };
    }
  }
  return { r: 37, g: 99, b: 235 };
}

export function mixRgbColors(rgbA, rgbB, weight) {
  const hasA = rgbA && [rgbA.r, rgbA.g, rgbA.b].every((channel) => Number.isFinite(channel));
  const hasB = rgbB && [rgbB.r, rgbB.g, rgbB.b].every((channel) => Number.isFinite(channel));
  if (!hasA && !hasB) {
    return { r: 37, g: 99, b: 235 };
  }
  if (!hasA) {
    return {
      r: clampColorChannel(rgbB.r),
      g: clampColorChannel(rgbB.g),
      b: clampColorChannel(rgbB.b),
    };
  }
  if (!hasB) {
    return {
      r: clampColorChannel(rgbA.r),
      g: clampColorChannel(rgbA.g),
      b: clampColorChannel(rgbA.b),
    };
  }
  const ratio = Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0;
  const inverse = 1 - ratio;
  return {
    r: clampColorChannel(rgbA.r * inverse + rgbB.r * ratio),
    g: clampColorChannel(rgbA.g * inverse + rgbB.g * ratio),
    b: clampColorChannel(rgbA.b * inverse + rgbB.b * ratio),
  };
}

export function createSequentialPalette(baseRgb, softRgb, surfaceRgb, count, theme) {
  const safeCount = Math.max(1, Math.floor(Number(count)) || 1);
  const palette = [];
  const softenTarget = mixRgbColors(softRgb, surfaceRgb, theme === 'dark' ? 0.18 : 0.32);
  for (let index = 0; index < safeCount; index += 1) {
    const progress = safeCount === 1 ? 0.5 : index / (safeCount - 1);
    const softened = mixRgbColors(baseRgb, softRgb, 0.2 + progress * 0.18);
    const tinted = mixRgbColors(softened, softenTarget, theme === 'dark' ? progress * 0.16 : progress * 0.28);
    palette.push(tinted);
  }
  return palette;
}
