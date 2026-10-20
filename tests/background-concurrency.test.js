import test from 'node:test';
import assert from 'node:assert/strict';

const flushEvents = () => new Promise((resolve) => setImmediate(resolve));
let instance = 0;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function createWorker({ tabs = [], batch = [], enabled = false } = {}) {
  const events = {};
  const event = (name) => ({ addListener(listener) { events[name] = listener; } });
  const data = { state: {
    activityByTabId: Object.fromEntries(tabs.map((tab) => [tab.id, 100])),
    totalSuspensions: 7,
    lastOptimizationAt: 300,
    lastBatch: batch,
  } };
  const openTabs = structuredClone(tabs);
  const discards = [];
  const reloads = [];
  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'),
    },
    storage: {
      sync: { get(_keys, callback) { callback({ settings: { enabled } }); } },
      local: {
        get(_keys, callback) { callback(structuredClone(data)); },
        set(value, callback) { Object.assign(data, structuredClone(value)); callback(); },
      },
    },
    tabs: {
      query(_query, callback) { callback(structuredClone(openTabs)); },
      discard(id, callback) {
        discards.push(id);
        const tab = openTabs.find((candidate) => candidate.id === id);
        tab.discarded = true;
        callback({ ...tab });
      },
      reload(id, _options, callback) {
        reloads.push(id);
        openTabs.find((tab) => tab.id === id).discarded = false;
        callback();
      },
      onActivated: event('activated'), onCreated: event('created'), onRemoved: event('removed'),
      onReplaced: event('replaced'), onUpdated: event('updated'),
    },
    alarms: { clear(_name, callback) { callback(true); }, create() {}, onAlarm: event('alarm') },
    action: { setBadgeBackgroundColor() {}, setBadgeText() {}, setTitle() {} },
  };
  globalThis.chrome = chrome;
  await import(`../background/background.js?concurrency=${++instance}`);
  await flushEvents();
  return {
    data, openTabs, events, chrome, discards, reloads,
    send(action) { return new Promise((resolve) => events.message({ action }, {}, resolve)); },
  };
}

const awake = (id) => ({ id, url: 'https://example.com', active: false, discarded: false });

test('simultaneous tab activity events preserve both timestamps', async () => {
  const worker = await createWorker();
  worker.events.created({ id: 1 });
  worker.events.created({ id: 2 });
  await flushEvents();
  assert.equal(Number.isFinite(worker.data.state.activityByTabId['1']), true);
  assert.equal(Number.isFinite(worker.data.state.activityByTabId['2']), true);
});

test('concurrent activation cannot resurrect a removed tab or its wake batch', async () => {
  const worker = await createWorker({ tabs: [awake(1), awake(2)], batch: [1, 2] });
  worker.events.removed(1);
  worker.events.activated({ tabId: 2 });
  await flushEvents();
  assert.equal('1' in worker.data.state.activityByTabId, false);
  assert.deepEqual(worker.data.state.lastBatch, [2]);
  assert.ok(worker.data.state.activityByTabId['2'] > 100);
});

test('optimization preserves activity received while a discard is pending', async () => {
  const worker = await createWorker({ tabs: [awake(1)] });
  const entered = deferred();
  let finish;
  const discard = worker.chrome.tabs.discard;
  worker.chrome.tabs.discard = (id, callback) => {
    finish = () => discard(id, callback);
    entered.resolve();
  };
  const optimization = worker.send('OPTIMIZE_NOW');
  await entered.promise;
  worker.events.created({ id: 2 });
  await flushEvents();
  assert.ok(worker.data.state.activityByTabId['2']);
  finish();
  assert.equal((await optimization).suspended, 1);
  assert.ok(worker.data.state.activityByTabId['2'], 'final optimization save must keep new activity');
  assert.equal(worker.data.state.totalSuspensions, 8);
});

test('wake completion preserves concurrent activity updates', async () => {
  const worker = await createWorker({ tabs: [{ ...awake(1), discarded: true }, awake(2)], batch: [1] });
  const entered = deferred();
  let finish;
  const reload = worker.chrome.tabs.reload;
  worker.chrome.tabs.reload = (id, options, callback) => {
    finish = () => reload(id, options, callback);
    entered.resolve();
  };
  const wake = worker.send('WAKE_LAST_BATCH');
  await entered.promise;
  worker.events.activated({ tabId: 2 });
  await flushEvents();
  const activeAt = worker.data.state.activityByTabId['2'];
  assert.ok(activeAt > 100);
  finish();
  assert.deepEqual(await wake, { restored: 1, failed: 0 });
  assert.equal(worker.data.state.activityByTabId['2'], activeAt);
});

test('a failed wake cannot restore a batch entry removed while reload was pending', async () => {
  const worker = await createWorker({ tabs: [{ ...awake(1), discarded: true }], batch: [1] });
  const entered = deferred();
  let finish;
  worker.chrome.tabs.reload = (_id, _options, callback) => {
    finish = () => {
      worker.chrome.runtime.lastError = { message: 'Tab closed' };
      callback();
      worker.chrome.runtime.lastError = null;
    };
    entered.resolve();
  };
  const wake = worker.send('WAKE_LAST_BATCH');
  await entered.promise;
  worker.openTabs.length = 0;
  worker.events.removed(1);
  await flushEvents();
  finish();
  await wake;
  assert.deepEqual(worker.data.state.lastBatch, []);
  assert.equal('1' in worker.data.state.activityByTabId, false);
});

test('overlapping optimization requests do not discard or count the same tab twice', async () => {
  const worker = await createWorker({ tabs: [awake(1)] });
  const results = await Promise.all([worker.send('OPTIMIZE_NOW'), worker.send('OPTIMIZE_NOW')]);
  assert.deepEqual(results.map((result) => result.suspended), [1, 0]);
  assert.deepEqual(worker.discards, [1]);
  assert.equal(worker.data.state.totalSuspensions, 8);
  assert.deepEqual(worker.data.state.lastBatch, [1]);
});

test('wake requested during optimization waits for the newly suspended batch', async () => {
  const worker = await createWorker({ tabs: [awake(1)] });
  const [optimization, wake] = await Promise.all([worker.send('OPTIMIZE_NOW'), worker.send('WAKE_LAST_BATCH')]);
  assert.equal(optimization.suspended, 1);
  assert.deepEqual(wake, { restored: 1, failed: 0 });
  assert.deepEqual(worker.reloads, [1]);
  assert.deepEqual(worker.data.state.lastBatch, []);
});

test('a failed state write does not block later events or tab operations', async () => {
  const worker = await createWorker({ tabs: [awake(1)] });
  const save = worker.chrome.storage.local.set;
  let fail = true;
  worker.chrome.storage.local.set = (value, callback) => {
    if (!fail) return save(value, callback);
    fail = false;
    worker.chrome.runtime.lastError = { message: 'Storage unavailable' };
    callback();
    worker.chrome.runtime.lastError = null;
  };
  assert.deepEqual(await worker.send('OPTIMIZE_NOW'), { error: 'Storage unavailable' });
  worker.events.created({ id: 2 });
  await flushEvents();
  assert.ok(worker.data.state.activityByTabId['2']);
  assert.equal((await worker.send('OPTIMIZE_NOW')).suspended, 1);
  assert.equal(worker.data.state.totalSuspensions, 8);
});


test('initialization cannot erase a tab created while its query is pending', async () => {
  const worker = await createWorker({ tabs: [awake(1)] });
  const entered = deferred();
  let finish;
  worker.chrome.tabs.query = (_query, callback) => {
    const snapshot = structuredClone(worker.openTabs);
    finish = () => callback(snapshot);
    entered.resolve();
  };
  const startup = worker.events.startup();
  await entered.promise;
  worker.openTabs.push(awake(2));
  worker.events.created({ id: 2 });
  await flushEvents();
  // Restore the ordinary query implementation for startup's badge refresh.
  worker.chrome.tabs.query = (_query, callback) => callback(structuredClone(worker.openTabs));
  finish();
  await startup;
  await flushEvents();
  assert.ok(worker.data.state.activityByTabId['2']);
});

test('a tab removed during a later discard is not restored to the wake batch', async () => {
  const worker = await createWorker({ tabs: [awake(1), awake(2)] });
  const entered = deferred();
  let finish;
  const discard = worker.chrome.tabs.discard;
  worker.chrome.tabs.discard = (id, callback) => {
    if (id === 1) return discard(id, callback);
    finish = () => discard(id, callback);
    entered.resolve();
  };
  const optimization = worker.send('OPTIMIZE_NOW');
  await entered.promise;
  worker.openTabs.splice(0, 1);
  worker.events.removed(1);
  await flushEvents();
  finish();
  assert.equal((await optimization).suspended, 2);
  assert.deepEqual(worker.data.state.lastBatch, [2]);
  assert.equal('1' in worker.data.state.activityByTabId, false);
  assert.equal(worker.data.state.totalSuspensions, 9, 'both completed discards still count');
});

test('a scheduled scan and manual optimization share the same operation queue', async () => {
  const worker = await createWorker({ tabs: [awake(1)], enabled: true });
  worker.events.alarm({ name: 'tab-optimize-scan' });
  const result = await worker.send('OPTIMIZE_NOW');
  assert.equal(result.suspended, 0, 'scheduled scan has already suspended the idle tab');
  assert.deepEqual(worker.discards, [1]);
  assert.equal(worker.data.state.totalSuspensions, 8);
});

test('overlapping wake requests reload each suspended tab only once', async () => {
  const worker = await createWorker({ tabs: [{ ...awake(1), discarded: true }], batch: [1] });
  const results = await Promise.all([worker.send('WAKE_LAST_BATCH'), worker.send('WAKE_LAST_BATCH')]);
  assert.deepEqual(results, [{ restored: 1, failed: 0 }, { restored: 0, failed: 0 }]);
  assert.deepEqual(worker.reloads, [1]);
  assert.deepEqual(worker.data.state.lastBatch, []);
});


test('tab replacement is atomic with a subsequent removal of the new tab', async () => {
  const worker = await createWorker({ tabs: [awake(1)], batch: [1] });
  worker.events.replaced(2, 1);
  worker.events.removed(2);
  await flushEvents();
  assert.deepEqual(worker.data.state.activityByTabId, {});
  assert.deepEqual(worker.data.state.lastBatch, []);
  assert.equal(worker.data.state.totalSuspensions, 7);
});
