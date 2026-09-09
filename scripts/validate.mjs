import { execFileSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('manifest.json must use Manifest V3');
if (manifest.browser_action) throw new Error('Manifest V3 must not use browser_action');
if (manifest.host_permissions?.length) throw new Error('Tab Optimize should not request host permissions');

const referencedFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean));

for (const relativePath of referencedFiles) {
  await access(path.join(root, relativePath));
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(full));
    else files.push(full);
  }
  return files;
}

const files = await collectFiles(root);
for (const file of files.filter((candidate) => /\.(?:js|mjs)$/.test(candidate))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

for (const htmlFile of files.filter((candidate) => candidate.endsWith('.html'))) {
  const html = await readFile(htmlFile, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    await access(path.resolve(path.dirname(htmlFile), target));
  }
}

console.log(`Validated Manifest V3 package: ${files.length} files checked.`);
