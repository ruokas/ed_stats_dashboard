import { numberFormatter, oneDecimalFormatter } from '../../../../utils/format.js';

export function setDoctorExportState(
  exportState,
  selectors,
  dashboardState,
  models,
  buildDoctorFilterSummaryFn
) {
  const filterSummary = buildDoctorFilterSummaryFn(dashboardState);
  const prefaceLines = [`# Filtrai: ${filterSummary}`];
  const leaderboardRows = Array.isArray(models?.leaderboard?.rows) ? models.leaderboard.rows : [];
  const mixRows = Array.isArray(models?.mix?.rows) ? models.mix.rows : [];
  const scatterRows = Array.isArray(models?.scatter?.rows) ? models.scatter.rows : [];

  exportState.volume = {
    title: 'Atvejų skaičius pagal gydytoją',
    exportTitle: `Atvejų skaičius pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Atvejai'],
    rows: leaderboardRows.map((row) => [row.alias, numberFormatter.format(row.count)]),
    target: selectors.gydytojaiVolumeChart,
  };
  exportState.los = {
    title: 'LOS intervalų pasiskirstymas pagal gydytoją',
    exportTitle: `LOS intervalų pasiskirstymas pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'LOS <4 (%)', 'LOS 4-8 (%)', 'LOS 8-16 (%)', 'LOS >16 (%)'],
    rows: leaderboardRows.map((row) => [
      row.alias,
      oneDecimalFormatter.format(row.losLt4Share * 100),
      oneDecimalFormatter.format(row.los4to8Share * 100),
      oneDecimalFormatter.format(row.los8to16Share * 100),
      oneDecimalFormatter.format(row.losGt16Share * 100),
    ]),
    target: selectors.gydytojaiLosChart,
  };
  exportState.hospital = {
    title: 'Hospitalizacijų dalis pagal gydytoją',
    exportTitle: `Hospitalizacijų dalis pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Hospitalizacija (%)'],
    rows: leaderboardRows.map((row) => [row.alias, oneDecimalFormatter.format(row.hospitalizedShare * 100)]),
    target: selectors.gydytojaiHospitalChart,
  };
  exportState.mix = {
    title: 'Diena/Naktis pagal gydytoją',
    exportTitle: `Diena/Naktis pagal gydytoją | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Diena (%)', 'Naktis (%)'],
    rows: mixRows.map((row) => [
      row.alias,
      oneDecimalFormatter.format(row.dayShare * 100),
      oneDecimalFormatter.format(row.nightShare * 100),
    ]),
    target: selectors.gydytojaiMixChart,
  };
  delete exportState.trend;
  exportState.scatter = {
    title: 'Apimtis vs LOS',
    exportTitle: `Apimtis vs LOS | ${filterSummary}`,
    prefaceLines,
    headers: ['Gydytojas', 'Atvejai', 'Vid. LOS (val.)'],
    rows: scatterRows.map((row) => [
      row.alias,
      numberFormatter.format(row.count),
      oneDecimalFormatter.format(row.avgLosHours),
    ]),
    target: selectors.gydytojaiScatterChart,
  };
}
