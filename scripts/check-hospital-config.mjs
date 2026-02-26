#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_CSV_KEYS = ['arrival', 'discharge', 'gmp', 'department', 'number', 'closingDoctor'];
const RECOMMENDED_CSV_KEYS = ['dayNight'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPlaceholderString(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return /<[^>]+>/.test(trimmed) || /\bPASTE\b/i.test(trimmed) || /\bTODO\b/i.test(trimmed);
}

function isValidUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

function clampRangeCheck(value, min, max) {
  if (!Number.isFinite(value)) {
    return false;
  }
  return value >= min && value <= max;
}

function collectPlaceholders(value, pathPrefix = '', output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectPlaceholders(item, `${pathPrefix}[${index}]`, output);
    });
    return output;
  }
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      collectPlaceholders(child, nextPath, output);
    });
    return output;
  }
  if (isPlaceholderString(value)) {
    output.push({ path: pathPrefix || '(root)', value: String(value) });
  }
  return output;
}

function addError(errors, pathKey, message) {
  errors.push(`${pathKey}: ${message}`);
}

function addWarning(warnings, pathKey, message) {
  warnings.push(`${pathKey}: ${message}`);
}

export function validateHospitalConfig(config, { sourcePath = 'config.json' } = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(config)) {
    return {
      ok: false,
      errors: ['(root): config turi būti JSON objektas.'],
      warnings,
      sourcePath,
    };
  }

  const placeholders = collectPlaceholders(config);
  placeholders.forEach((item) => {
    const pathLower = item.path.toLowerCase();
    const isOptionalHistoricalPath =
      pathLower === 'datasource.historical.url' &&
      config?.dataSource?.historical?.enabled === false &&
      !String(config?.dataSource?.historical?.url || '').trim();
    if (!isOptionalHistoricalPath) {
      addError(errors, item.path, `rasta laikina reikšmė (${item.value}).`);
    }
  });

  if (!isPlainObject(config.dataSource)) {
    addError(errors, 'dataSource', 'privalo būti objektas.');
  } else {
    if (!isValidUrl(config.dataSource.url)) {
      addError(errors, 'dataSource.url', 'privalomas galiojantis http(s) CSV URL.');
    }

    if (!isPlainObject(config.dataSource.feedback)) {
      addError(errors, 'dataSource.feedback', 'privalo būti objektas.');
    } else if (!isValidUrl(config.dataSource.feedback.url)) {
      addError(errors, 'dataSource.feedback.url', 'privalomas galiojantis http(s) CSV URL.');
    }

    if (!isPlainObject(config.dataSource.ed)) {
      addError(errors, 'dataSource.ed', 'privalo būti objektas.');
    } else if (!isValidUrl(config.dataSource.ed.url)) {
      addError(errors, 'dataSource.ed.url', 'privalomas galiojantis http(s) CSV URL.');
    }

    if (config.dataSource.historical != null && !isPlainObject(config.dataSource.historical)) {
      addError(errors, 'dataSource.historical', 'turi būti objektas, jei nurodytas.');
    } else if (isPlainObject(config.dataSource.historical)) {
      const historicalEnabled = config.dataSource.historical.enabled !== false;
      if (historicalEnabled && !isValidUrl(config.dataSource.historical.url)) {
        addError(
          errors,
          'dataSource.historical.url',
          'kai historical.enabled=true, būtinas galiojantis http(s) CSV URL.'
        );
      }
      if (
        config.dataSource.historical.label != null &&
        typeof config.dataSource.historical.label !== 'string'
      ) {
        addError(errors, 'dataSource.historical.label', 'turi būti tekstas.');
      }
    }
  }

  if (!isPlainObject(config.csv)) {
    addError(errors, 'csv', 'privalo būti objektas.');
  } else {
    REQUIRED_CSV_KEYS.forEach((key) => {
      if (typeof config.csv[key] !== 'string' || !config.csv[key].trim()) {
        addError(errors, `csv.${key}`, 'privalomas netuščias stulpelio pavadinimas.');
      }
    });
    RECOMMENDED_CSV_KEYS.forEach((key) => {
      if (typeof config.csv[key] !== 'string' || !config.csv[key].trim()) {
        addWarning(
          warnings,
          `csv.${key}`,
          'rekomenduojama nurodyti; jei lauko nėra CSV, paros metas gali būti išvestas iš laiko.'
        );
      }
    });
  }

  if (config.output != null && !isPlainObject(config.output)) {
    addError(errors, 'output', 'turi būti objektas, jei nurodytas.');
  }
  if (isPlainObject(config.output)) {
    ['pageTitle', 'title', 'subtitle'].forEach((key) => {
      if (config.output[key] != null && typeof config.output[key] !== 'string') {
        addError(errors, `output.${key}`, 'turi būti tekstas.');
      }
    });
  }

  if (config.calculations != null && !isPlainObject(config.calculations)) {
    addError(errors, 'calculations', 'turi būti objektas, jei nurodytas.');
  }
  if (isPlainObject(config.calculations)) {
    const windowDays = Number(config.calculations.windowDays);
    const recentDays = Number(config.calculations.recentDays);
    if (!clampRangeCheck(windowDays, 7, 365)) {
      addError(errors, 'calculations.windowDays', 'turi būti skaičius intervale 7..365.');
    }
    if (!clampRangeCheck(recentDays, 1, 60)) {
      addError(errors, 'calculations.recentDays', 'turi būti skaičius intervale 1..60.');
    }
  }

  if (config.metrics != null && !isPlainObject(config.metrics)) {
    addError(errors, 'metrics', 'turi būti objektas, jei nurodytas.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sourcePath,
  };
}

export function readJsonConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function resolveConfigPath(argPath = 'config.json') {
  return path.resolve(process.cwd(), argPath);
}

export function runCli(argv = process.argv.slice(2)) {
  const targetArg = argv[0] || 'config.json';
  const targetPath = resolveConfigPath(targetArg);

  let config;
  try {
    config = readJsonConfig(targetPath);
  } catch (error) {
    console.error(`Config check failed: nepavyko perskaityti ${targetPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const result = validateHospitalConfig(config, { sourcePath: targetPath });
  if (result.ok) {
    console.log(`Config OK: ${targetPath}`);
    if (result.warnings.length) {
      console.log('Warnings:');
      result.warnings.forEach((item) => {
        console.log(`- ${item}`);
      });
    }
    return 0;
  }

  console.error(`Config check failed: ${targetPath}`);
  result.errors.forEach((item) => {
    console.error(`- ${item}`);
  });
  if (result.warnings.length) {
    console.error('Warnings:');
    result.warnings.forEach((item) => {
      console.error(`- ${item}`);
    });
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runCli();
}
