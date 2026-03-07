#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strictMode = process.argv.includes('--enforce');
const MAX_RUNTIME_IMPL_LINES = Number.parseInt(process.env.MAX_RUNTIME_IMPL_LINES || '600', 10);
const MAX_ORCHESTRATOR_LINES = Number.parseInt(process.env.MAX_ORCHESTRATOR_LINES || '700', 10);
const MAX_CSS_LINES = Number.parseInt(process.env.MAX_CSS_LINES || '5500', 10);

const runtimeImplFiles = [
  'src/app/runtime/runtimes/charts-runtime-impl.js',
  'src/app/runtime/runtimes/ed-runtime.js',
  'src/app/runtime/runtimes/feedback-runtime.js',
  'src/app/runtime/runtimes/gydytojai-runtime-main.js',
  'src/app/runtime/runtimes/kpi-runtime.js',
  'src/app/runtime/runtimes/recent-runtime.js',
  'src/app/runtime/runtimes/summaries-runtime-main.js',
];

const orchestratorFiles = ['src/app/runtime/data-flow.js', 'src/app/runtime/kpi-flow.js'];
const stylesheetFiles = ['styles.css'];
const shellFiles = fs
  .readdirSync(root)
  .filter((entry) => entry.endsWith('.html'))
  .sort();
const templateManifestFile = 'templates/page-shell/manifest.json';

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function countLines(relativePath) {
  return readUtf8(relativePath).replace(/\r\n/g, '\n').split('\n').length;
}

function reportLineBudget(groupName, files, budget) {
  const failures = [];
  console.log(`\n[architecture] ${groupName} (max ${budget} lines)`);
  files.forEach((file) => {
    const lines = countLines(file);
    const marker = lines > budget ? 'FAIL' : 'OK';
    console.log(`- ${marker} ${file}: ${lines}`);
    if (lines > budget) {
      failures.push({ file, lines, budget, type: groupName });
    }
  });
  return failures;
}

function reportNoVersionSuffixes() {
  const regex = /\b(?:styles\.css|main\.js|src\/main\.js|data-worker\.js)\?v=/;
  const failures = [];
  console.log('\n[architecture] no manual ?v suffixes in shell/templates');
  for (const file of [...shellFiles, templateManifestFile]) {
    const content = readUtf8(file);
    if (regex.test(content)) {
      console.log(`- FAIL ${file}: contains manual ?v suffix`);
      failures.push({ file, type: 'versionSuffix' });
    } else {
      console.log(`- OK ${file}`);
    }
  }
  return failures;
}

const failures = [
  ...reportLineBudget('runtime impl files', runtimeImplFiles, MAX_RUNTIME_IMPL_LINES),
  ...reportLineBudget('orchestrator files', orchestratorFiles, MAX_ORCHESTRATOR_LINES),
  ...reportLineBudget('stylesheets', stylesheetFiles, MAX_CSS_LINES),
  ...reportNoVersionSuffixes(),
];

if (failures.length) {
  const title = strictMode
    ? '\nArchitecture budget violations detected (strict mode).'
    : '\nArchitecture budget violations detected (report mode).';
  console.warn(title);
  if (strictMode) {
    process.exitCode = 1;
  }
} else {
  console.log('\nAll architecture checks passed.');
}
