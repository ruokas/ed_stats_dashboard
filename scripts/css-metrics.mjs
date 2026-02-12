import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const maxBytesArg = args.find((arg) => arg.startsWith('--max-bytes='));
const maxBytes = maxBytesArg ? Number.parseInt(maxBytesArg.split('=')[1], 10) : null;

const filePath = path.resolve(process.cwd(), 'styles.css');
const text = fs.readFileSync(filePath, 'utf8');
const stat = fs.statSync(filePath);

const normalizedText = text.replace(/\r/g, '');
const lines = normalizedText.split('\n').length;
const mediaQueries = (text.match(/@media\b/g) || []).length;
const ruleStarts = (text.match(/\{/g) || []).length;
const supportsBlocks = (text.match(/@supports\b/g) || []).length;
const keyframesBlocks = (text.match(/@keyframes\b/g) || []).length;
const approxSelectors = Math.max(0, ruleStarts - mediaQueries - supportsBlocks - keyframesBlocks);

const metrics = {
  file: 'styles.css',
  bytes: stat.size,
  lines,
  mediaQueries,
  approxSelectors,
};

console.log(JSON.stringify(metrics, null, 2));

if (Number.isFinite(maxBytes) && maxBytes > 0 && stat.size > maxBytes) {
  console.error(`CSS budget exceeded: ${stat.size} bytes > ${maxBytes} bytes for ${path.basename(filePath)}`);
  process.exitCode = 1;
}
