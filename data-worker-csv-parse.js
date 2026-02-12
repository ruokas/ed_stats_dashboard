/*
 * Shared CSV parsing helpers for worker transform modules.
 */

function detectDelimiter(text) {
  const sampleLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  candidates.forEach((delimiter) => {
    let inQuotes = false;
    let score = 0;
    for (let i = 0; i < sampleLine.length; i += 1) {
      const char = sampleLine[i];
      if (char === '"') {
        if (inQuotes && sampleLine[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && char === delimiter) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  });
  return bestScore > 0 ? best : ',';
}

function parseCsv(text) {
  const sanitized = text.replace(/\r\n?/g, '\n');
  const delimiter = detectDelimiter(sanitized);
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    if (char === '"') {
      if (inQuotes && sanitized[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      current.push(value);
      value = '';
      continue;
    }
    if (char === '\n' && !inQuotes) {
      current.push(value);
      rows.push(current);
      current = [];
      value = '';
      continue;
    }
    value += char;
  }
  if (value.length > 0 || current.length) {
    current.push(value);
    rows.push(current);
  }
  const filteredRows = rows.filter((row) => row.some((cell) => (cell ?? '').trim().length > 0));
  return { rows: filteredRows, delimiter };
}

self.parseCsv = parseCsv;
