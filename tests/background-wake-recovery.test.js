import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function createWorker({ batch = [1, 2], tabs, failures = [], discardFailures = [] } = {}) {
  const events = {};
  const event = (name) => ({ addListener(listener) { events[name] = listener; } });
  const data = {
    state: {
      activityByTabId: { 1: 100, 2: 200 },
      totalSuspensions: 7,
      lastOptimizationAt: 300,
      lastBatch: batch,
    },
  };
  const openTabs = tabs ?? batch.map((id) => ({ id, discarded: true }));
  const failIds = new Set(failures);
  const discardFailIds = new Set(discardFailures);
  const reloads = [];
  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'),
    },
    storage: {
      sync: { get(_keys, callback) { callback({ settings: { enabled: false } }); } },
      local: {
        get(_keys, callback) { callback(structuredClone(data)); },
        set(value, callback) { Object.assign(data, structuredClone(value)); callback(); },
      },
    },
    tabs: {
      query(_query, callback) { callback(structuredClone(openTabs)); },
      discard(id, callback) {
        if (discardFailIds.has(id)) {
          chrome.runtime.lastError = { message: 'Temporary discard failure' };
          callback();
          chrome.runtime.lastError = null;
          return;
        }
        const tab = openTabs.find((candidate) => candidate.id === id);
        tab.discarded = true;
        callback({ ...tab });
      },
      reload(id, _options, callback) {
        reloads.push(id);
        if (failIds.has(id)) chrome.runtime.lastError = { message: 'Temporary reload failure' };
        else openTabs.find((tab) => tab.id === id).discarded = false;
        callback();
        chrome.runtime.lastError = null;
      },
      onActivated: event('activated'), onCreated: event('created'), onRemoved: event('removed'),
      onReplaced: event('replaced'), onUpdated: event('updated'),
    },
    alarms: { clear(_name, callback) { callback(true); }, onAlarm: event('alarm') },
    action: { setBadgeBackgroundColor() {}, setBadgeText() {}, setTitle() {} },
  };
  async function start() {
    globalThis.chrome = chrome;
    await import(`../background/background.js?wake-recovery=${++instance}`);
  }
  await start();
  return {
    data, openTabs, failIds, reloads, chrome, start,
    send(action) { return new Promise((resolve) => events.message({ action }, {}, resolve)); },
  };
}

test('partial wake retains only failures and retries them after worker restart', async () => {
  const worker = await createWorker({ failures: [2] });
  const before = structuredClone(worker.data.state);
  const result = await worker.send('WAKE_LAST_BATCH');
  assert.deepEqual(worker.data.state, { ...before, lastBatch: [2] });
  assert.deepEqual(result, { restored: 1, failed: 1 });
  assert.equal((await worker.send('GET_STATUS')).canWakeLastBatch, true);

  worker.failIds.clear();
  await worker.start();
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 1, failed: 0 });
  assert.deepEqual(worker.reloads, [1, 2, 2], 'successful tab must not be reloaded again');
  assert.deepEqual(worker.data.state.lastBatch, []);
  assert.equal((await worker.send('GET_STATUS')).canWakeLastBatch, false);
});

test('all reload failures remain retryable without changing counters or activity', async () => {
  const worker = await createWorker({ failures: [1, 2] });
  const before = structuredClone(worker.data.state);
  const result = await worker.send('WAKE_LAST_BATCH');
  assert.deepEqual(worker.data.state, before);
  assert.deepEqual(result, { restored: 0, failed: 2 });
});

test('wake drops closed and already awake tabs but never reloads them', async () => {
  const worker = await createWorker({
    batch: [1, 2, 3],
    tabs: [{ id: 1, discarded: false }, { id: 2, discarded: true }],
    failures: [2],
  });
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 0, failed: 1 });
  assert.deepEqual(worker.reloads, [2]);
  assert.deepEqual(worker.data.state.lastBatch, [2]);
});

test('successful and repeated wake requests leave an empty batch', async () => {
  const worker = await createWorker();
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 2, failed: 0 });
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 0, failed: 0 });
  assert.deepEqual(worker.reloads, [1, 2]);
});

test('a failed persistence step leaves prior recovery state available for retry', async () => {
  const worker = await createWorker({ failures: [2] });
  const save = worker.chrome.storage.local.set;
  worker.chrome.storage.local.set = (_value, callback) => {
    worker.chrome.runtime.lastError = { message: 'Storage unavailable' };
    callback();
    worker.chrome.runtime.lastError = null;
  };
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { error: 'Storage unavailable' });
  assert.deepEqual(worker.data.state.lastBatch, [1, 2]);
  worker.chrome.storage.local.set = save;
  worker.failIds.clear();
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 1, failed: 0 });
  assert.deepEqual(worker.reloads, [1, 2, 2]);
});

test('optimization with no eligible tabs preserves a pending wake retry', async () => {
  const worker = await createWorker({ failures: [1, 2] });
  await worker.send('WAKE_LAST_BATCH');
  assert.deepEqual(await worker.send('OPTIMIZE_NOW'), { suspended: 0, considered: 0, skipped: false });
  assert.deepEqual(worker.data.state.lastBatch, [1, 2]);
  worker.failIds.clear();
  assert.deepEqual(await worker.send('WAKE_LAST_BATCH'), { restored: 2, failed: 0 });
});

test('failed discards preserve the previous batch but successful discards replace it', async () => {
  const worker = await createWorker({
    batch: [1],
    tabs: [{ id: 1, discarded: true }, { id: 2, url: 'https://example.com', discarded: false }],
    discardFailures: [2],
  });
  assert.deepEqual(await worker.send('OPTIMIZE_NOW'), { suspended: 0, considered: 1, skipped: false });
  assert.deepEqual(worker.data.state.lastBatch, [1]);
  worker.chrome.tabs.discard = (id, callback) => callback({ id, discarded: true });
  assert.deepEqual(await worker.send('OPTIMIZE_NOW'), { suspended: 1, considered: 1, skipped: false });
  assert.deepEqual(worker.data.state.lastBatch, [2]);
});
