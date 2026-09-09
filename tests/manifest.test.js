import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

test('manifest is a valid minimal Manifest V3 extension', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.options_ui.page, 'options/options.html');
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'storage', 'tabs']);
  assert.equal('host_permissions' in manifest, false);
  assert.equal('content_scripts' in manifest, false);
  assert.equal('browser_action' in manifest, false);
});

test('all manifest file references exist', async () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  await Promise.all([...new Set(referenced)].map((file) => access(path.join(root, file))));
});
