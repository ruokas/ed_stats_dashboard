#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const templateRoot = path.resolve(root, 'templates/page-shell');
const manifestPath = path.join(templateRoot, 'manifest.json');

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function readTemplate(relativePath) {
  return readUtf8(path.join(templateRoot, relativePath)).trimEnd();
}

function toBodyAttributes(attributes = {}) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join(' ');
}

function renderPage(entry, shared) {
  const bodyAttributes = toBodyAttributes(entry.bodyAttributes);
  const extraHead = entry.extraHeadFile ? readTemplate(entry.extraHeadFile) : '';
  const main = readTemplate(entry.mainContentFile);
  const afterMain = readTemplate(entry.afterMainFile);

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="lt">',
    '<head>',
    shared.head,
    `  <link rel="stylesheet" href="${entry.stylesHref}">`,
  ];

  if (extraHead) {
    lines.push(extraHead);
  }

  lines.push(
    '</head>',
    `<body ${bodyAttributes}>`,
    shared.hero,
    main,
    '',
    afterMain,
    '',
    shared.footer,
    '',
    `  <script type="module" src="${entry.mainScriptSrc}"></script>`,
    '',
    '</body>',
    '</html>',
    ''
  );

  return lines.join('\n');
}

function ensureFile(pathLike, label) {
  if (!fs.existsSync(pathLike)) {
    throw new Error(`Missing ${label}: ${pathLike}`);
  }
}

const isCheckMode = process.argv.includes('--check');
ensureFile(manifestPath, 'manifest');

const manifest = JSON.parse(readUtf8(manifestPath));
if (!Array.isArray(manifest?.pages) || !manifest.pages.length) {
  throw new Error('Manifest must define a non-empty "pages" array.');
}

const shared = {
  head: readTemplate('partials/head-shared.html'),
  hero: readTemplate('partials/hero.html'),
  footer: readTemplate('partials/footer.html'),
};

const mismatches = [];

for (const pageEntry of manifest.pages) {
  if (!pageEntry?.file) {
    throw new Error('Each page entry must define "file".');
  }
  ensureFile(path.join(templateRoot, pageEntry.mainContentFile), `${pageEntry.file} main template`);
  ensureFile(path.join(templateRoot, pageEntry.afterMainFile), `${pageEntry.file} after-main template`);
  if (pageEntry.extraHeadFile) {
    ensureFile(path.join(templateRoot, pageEntry.extraHeadFile), `${pageEntry.file} extra-head template`);
  }

  const outputPath = path.join(root, pageEntry.file);
  const rendered = renderPage(pageEntry, shared);

  if (isCheckMode) {
    const current = fs.existsSync(outputPath) ? readUtf8(outputPath) : '';
    if (current !== rendered) {
      mismatches.push(pageEntry.file);
    }
    continue;
  }

  fs.writeFileSync(outputPath, rendered, 'utf8');
  console.log(`Generated ${pageEntry.file}`);
}

if (isCheckMode && mismatches.length) {
  console.error('Page generation drift detected in:');
  mismatches.forEach((file) => {
    console.error(`- ${file}`);
  });
  console.error('Run: node scripts/generate-pages.mjs');
  process.exitCode = 1;
}
