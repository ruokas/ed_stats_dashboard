import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('shell versioning', () => {
  it('does not use manual ?v suffixes in generated html pages', () => {
    const htmlFiles = fs.readdirSync(process.cwd()).filter((entry) => entry.endsWith('.html'));
    const versionedAssetPattern = /\b(?:styles\.css|main\.js|src\/main\.js|data-worker\.js)\?v=/;
    htmlFiles.forEach((file) => {
      expect(read(file)).not.toMatch(versionedAssetPattern);
    });
  });

  it('does not use manual ?v suffixes in template manifest', () => {
    const manifest = read('templates/page-shell/manifest.json');
    expect(manifest).not.toMatch(/\?v=/);
  });
});
