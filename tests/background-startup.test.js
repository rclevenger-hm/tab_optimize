import test from 'node:test';
import assert from 'node:assert/strict';

function eventSlot() {
  const slot = { listener: null };
  slot.event = { addListener(listener) { slot.listener = listener; } };
  return slot;
}

test('browser startup preserves activity for surviving tabs', async () => {
  const startup = eventSlot();
  const installed = eventSlot();
  const message = eventSlot();
  const alarm = eventSlot();
  const activated = eventSlot();
  const created = eventSlot();
  const removed = eventSlot();
  const replaced = eventSlot();
  const updated = eventSlot();

  const syncData = { settings: { enabled: false } };
  const localData = {
    state: {
      activityByTabId: { '1': 1234, '999': 5678 },
      totalSuspensions: 4,
      lastOptimizationAt: 900,
      lastBatch: [999],
    },
  };
  const tabs = [
    { id: 1, active: false, discarded: false },
    { id: 2, active: false, discarded: false },
  ];

  globalThis.chrome = {
    storage: {
      sync: {
        get(_keys, callback) { callback({ ...syncData }); },
        set(value, callback) { Object.assign(syncData, value); callback?.(); },
      },
      local: {
        get(_keys, callback) { callback({ ...localData }); },
        set(value, callback) { Object.assign(localData, value); callback?.(); },
      },
    },
    tabs: {
      query(_query, callback) { callback(tabs.map((tab) => ({ ...tab }))); },
      discard(_id, callback) { callback(null); },
      reload(_id, _options, callback) { callback(); },
      onActivated: activated.event,
      onCreated: created.event,
      onRemoved: removed.event,
      onReplaced: replaced.event,
      onUpdated: updated.event,
    },
    alarms: {
      clear(_name, callback) { callback(true); },
      create() {},
      onAlarm: alarm.event,
    },
    action: {
      setBadgeBackgroundColor() {},
      setBadgeText() {},
      setTitle() {},
    },
    runtime: {
      lastError: null,
      onInstalled: installed.event,
      onStartup: startup.event,
      onMessage: message.event,
      openOptionsPage() {},
    },
  };

  await import(`../background/background.js?startup-test=${Date.now()}`);
  assert.equal(typeof startup.listener, 'function');

  await startup.listener();

  const activity = localData.state.activityByTabId;
  assert.equal(activity['1'], 1234, 'existing tab should keep its persisted last-active time');
  assert.equal('999' in activity, false, 'closed tab activity should be removed');
  assert.equal(Number.isFinite(activity['2']), true, 'new tab should receive an activity timestamp');
  assert.equal(localData.state.totalSuspensions, 4, 'startup should preserve aggregate statistics');
});
