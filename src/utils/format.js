// Formatai datoms ir skaiciams (LT locale).
export const numberFormatter = new Intl.NumberFormat('lt-LT');
export const decimalFormatter = new Intl.NumberFormat('lt-LT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const oneDecimalFormatter = new Intl.NumberFormat('lt-LT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const percentFormatter = new Intl.NumberFormat('lt-LT', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const monthFormatter = new Intl.DateTimeFormat('lt-LT', { month: 'long', year: 'numeric' });
export const monthOnlyFormatter = new Intl.DateTimeFormat('lt-LT', { month: 'short' });
export const shortDateFormatter = new Intl.DateTimeFormat('lt-LT', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const monthDayFormatter = new Intl.DateTimeFormat('lt-LT', { month: '2-digit', day: '2-digit' });
export const statusTimeFormatter = new Intl.DateTimeFormat('lt-LT', {
  dateStyle: 'short',
  timeStyle: 'short',
});
export const tvTimeFormatter = new Intl.DateTimeFormat('lt-LT', { hour: '2-digit', minute: '2-digit' });
export const tvDateFormatter = new Intl.DateTimeFormat('lt-LT', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});
export const weekdayLongFormatter = new Intl.DateTimeFormat('lt-LT', { weekday: 'long' });
export const textCollator = new Intl.Collator('lt-LT', { sensitivity: 'base', usage: 'sort' });
export const dailyDateFormatter = new Intl.DateTimeFormat('lt-LT', {
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function capitalizeSentence(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}
