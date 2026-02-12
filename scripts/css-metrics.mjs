import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const maxBytesArg = args.find((arg) => arg.startsWith('--max-bytes='));
const maxBytes = maxBytesArg ? Number.parseInt(maxBytesArg.split('=')[1], 10) : null;

const workspaceRoot = process.cwd();
const baseCssFile = path.resolve(workspaceRoot, 'styles.css');
const cssDir = path.resolve(workspaceRoot, 'css');

/** @type {string[]} */
const cssFiles = [baseCssFile];
if (fs.existsSync(cssDir)) {
  const moduleCssFiles = fs
    .readdirSync(cssDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => path.join(cssDir, name));
  cssFiles.push(...moduleCssFiles);
}

const byFile = cssFiles.map((filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  const normalizedText = text.replace(/\r/g, '');
  const lines = normalizedText.split('\n').length;
  const mediaQueries = (text.match(/@media\b/g) || []).length;
  const ruleStarts = (text.match(/\{/g) || []).length;
  const supportsBlocks = (text.match(/@supports\b/g) || []).length;
  const keyframesBlocks = (text.match(/@keyframes\b/g) || []).length;
  const approxSelectors = Math.max(0, ruleStarts - mediaQueries - supportsBlocks - keyframesBlocks);

  return {
    file: path.relative(workspaceRoot, filePath).replace(/\\/g, '/'),
    bytes: stat.size,
    lines,
    mediaQueries,
    approxSelectors,
  };
});

const metrics = {
  files: byFile,
  total: {
    bytes: byFile.reduce((sum, item) => sum + item.bytes, 0),
    lines: byFile.reduce((sum, item) => sum + item.lines, 0),
    mediaQueries: byFile.reduce((sum, item) => sum + item.mediaQueries, 0),
    approxSelectors: byFile.reduce((sum, item) => sum + item.approxSelectors, 0),
  },
};

console.log(JSON.stringify(metrics, null, 2));

if (Number.isFinite(maxBytes) && maxBytes > 0 && metrics.total.bytes > maxBytes) {
  console.error(`CSS budget exceeded: ${metrics.total.bytes} bytes > ${maxBytes} bytes (total CSS bundle)`);
  process.exitCode = 1;
}
