import { METRICS_CATALOG } from '../src/metrics/catalog.js';
import { validateCatalog } from '../src/metrics/catalog-validate.js';

try {
  validateCatalog(METRICS_CATALOG);
  process.stdout.write(
    `Metrics catalog OK: version=${METRICS_CATALOG.version}, metrics=${METRICS_CATALOG.metrics.length}\n`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Metrics catalog invalid: ${message}\n`);
  process.exitCode = 1;
}
