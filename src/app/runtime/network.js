export function formatUrlForDiagnostics(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '';
  }
  try {
    const parsed = new URL(rawUrl);
    const safeParams = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      if (/token|key|auth|secret|signature|pass/i.test(key)) {
        safeParams.append(key, '***');
        return;
      }
      safeParams.append(key, value);
    });
    const query = safeParams.toString();
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch (parseError) {
    console.warn('Nepavyko normalizuoti URL diagnostikai:', parseError);
    return rawUrl;
  }
}

export function describeError(error, { code = 'UNKNOWN', message, fallbackMessage } = {}) {
  const normalizedCode = typeof code === 'string' && code.trim()
    ? code.trim().toUpperCase()
    : 'UNKNOWN';
  const baseMessage = message
    || (typeof error === 'string'
      ? error
      : error?.message ?? fallbackMessage ?? 'Nepavyko įkelti duomenų.');
  const hints = [];
  const diagnostic = typeof error === 'object' && error ? error.diagnostic : null;

  if (diagnostic?.url) {
    hints.push(`URL: ${diagnostic.url}.`);
  }

  if (diagnostic?.type === 'http') {
    if (diagnostic.status === 404) {
      hints.push('Patikrinkite, ar „Google Sheet“ paskelbta per „File → Share → Publish to web → CSV“ ir kad naudojamas publikuotas CSV adresas.');
    } else if (diagnostic.status === 403) {
      hints.push('Patikrinkite bendrinimo teises – dokumentas turi būti pasiekiamas be prisijungimo.');
    } else if (diagnostic.status === 0) {
      hints.push('Gautas atsakas be statuso – tikėtina tinklo arba CORS klaida.');
    }
    if (diagnostic.statusText) {
      hints.push(`Serverio atsakymas: ${diagnostic.statusText}.`);
    }
  }

  if (/Failed to fetch/i.test(baseMessage) || /NetworkError/i.test(baseMessage)) {
    hints.push('Nepavyko pasiekti šaltinio – patikrinkite interneto ryšį ir ar serveris leidžia CORS užklausas iš šio puslapio.');
  }

  if (/HTML atsakas/i.test(baseMessage)) {
    hints.push('Gautas HTML vietoje CSV – nuorodoje turi būti „.../pub?output=csv“.');
  }

  if (diagnostic?.hint) {
    hints.push(diagnostic.hint);
  }

  const renderedHints = hints.length ? ` ${hints.join(' ')}` : '';
  let userMessage = `${baseMessage}${renderedHints}`.trim();
  if (/HTTP klaida:\s*404/.test(baseMessage)) {
    userMessage = `HTTP 404 – nuoroda nerasta arba dokumentas nepublikuotas.${renderedHints}`;
  } else if (/HTTP klaida:\s*403/.test(baseMessage)) {
    userMessage = `HTTP 403 – prieiga uždrausta.${renderedHints}`;
  } else if (/Failed to fetch/i.test(baseMessage) || /NetworkError/i.test(baseMessage)) {
    userMessage = `Nepavyko pasiekti šaltinio.${renderedHints}`;
  } else if (/HTML atsakas/i.test(baseMessage)) {
    userMessage = `Gautas HTML atsakas vietoje CSV.${renderedHints}`;
  }

  return {
    code: normalizedCode,
    message: baseMessage,
    detail: typeof error === 'string' ? '' : (error?.message ?? ''),
    diagnostic,
    userMessage,
    log: `[${normalizedCode}] ${userMessage}`,
  };
}

export function createTextSignature(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const length = text.length;
  const head = text.slice(0, 128);
  return `${length}:${head}`;
}

export async function downloadCsv(url, { cacheInfo = null, onChunk, signal } = {}) {
  if (signal?.aborted) {
    throw new DOMException('Užklausa nutraukta.', 'AbortError');
  }
  const headers = {};
  if (cacheInfo?.etag) {
    headers['If-None-Match'] = cacheInfo.etag;
  }
  if (cacheInfo?.lastModified) {
    headers['If-Modified-Since'] = cacheInfo.lastModified;
  }
  const response = await fetch(url, { cache: 'no-store', headers, signal });
  const statusText = response.statusText || '';
  const cacheStatusHeader = response.headers.get('x-cache-status') || '';
  if (response.status === 304) {
    return {
      status: 304,
      text: '',
      contentType: response.headers.get('content-type') ?? '',
      etag: cacheInfo?.etag || '',
      lastModified: cacheInfo?.lastModified || '',
      signature: cacheInfo?.signature || '',
      cacheStatus: cacheStatusHeader || 'not-modified',
    };
  }
  if (!response.ok) {
    const error = new Error(`HTTP klaida: ${response.status}`);
    error.diagnostic = {
      type: 'http',
      status: response.status,
      statusText,
      url: formatUrlForDiagnostics(url),
    };
    throw error;
  }
  let textContent = '';
  const totalBytesHeader = response.headers.get('content-length');
  const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : 0;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch (error) {
          // ignore cancellation errors
        }
        throw new DOMException('Užklausa nutraukta.', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      receivedBytes += value.byteLength;
      textContent += decoder.decode(value, { stream: true });
      if (typeof onChunk === 'function') {
        onChunk({ receivedBytes, totalBytes });
      }
    }
    textContent += decoder.decode();
  } else {
    textContent = await response.text();
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || /^<!doctype html/i.test(textContent.trim())) {
    const error = new Error('HTML atsakas vietoje CSV – patikrinkite, ar nuoroda publikuota kaip CSV.');
    error.diagnostic = {
      type: 'html',
      url: formatUrlForDiagnostics(url),
      hint: 'Google Sheets lange pasirinkite „File → Share → Publish to web → CSV“ ir naudokite gautą CSV nuorodą.',
    };
    throw error;
  }
  const etag = response.headers.get('etag') ?? '';
  const lastModified = response.headers.get('last-modified') ?? '';
  return {
    status: response.status,
    text: textContent,
    contentType,
    etag,
    lastModified,
    cacheStatus: cacheStatusHeader || 'tinklas',
    signature: etag || lastModified || createTextSignature(textContent),
  };
}

export function describeCacheMeta(meta) {
  if (!meta) {
    return 'tinklas';
  }
  if (meta.cacheStatus && /hit|revalidated/i.test(meta.cacheStatus)) {
    return meta.cacheStatus.toLowerCase();
  }
  if (meta.fromCache) {
    return 'talpykla';
  }
  return 'tinklas';
}
