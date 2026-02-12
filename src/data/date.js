export function parseDate(value) {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, ' ').trim();
  let isoCandidate = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  isoCandidate = isoCandidate.replace(' T', 'T').replace(' +', '+').replace(' -', '-');
  let parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed?.getTime?.())) {
    return parsed;
  }
  // Papildoma atrama formoms, kurios vietoje brūkšnių naudoja pasviruosius arba taškus.
  const slashIso = normalized.match(
    /^(\d{4})[/](\d{1,2})[/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (slashIso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = slashIso;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dotIso = normalized.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dotIso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = dotIso;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const onlyDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDate) {
    parsed = new Date(Number(onlyDate[1]), Number(onlyDate[2]) - 1, Number(onlyDate[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const european = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (european) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = european;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // Google Forms CSV dažnai išveda datą „dd/mm/yyyy“ formatu.
  const slashEuropean = normalized.match(
    /^(\d{1,2})[/](\d{1,2})[/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (slashEuropean) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = slashEuropean;
    parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
