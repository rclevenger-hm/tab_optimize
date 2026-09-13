import test from 'node:test';
import assert from 'node:assert/strict';

function eventSlot() {
  const slot = { listener: null };
  slot.event = { addListener(listener) { slot.listener = listener; } };
  return slot;
}

test('fire-and-forget tab events contain storage failures', async () => {
  const startup = eventSlot();
  const installed = eventSlot();
  const message = eventSlot();
  const alarm = eventSlot();
  const activated = eventSlot();
  const created = eventSlot();
  const removed = eventSlot();
  const replaced = eventSlot();
  const updated = eventSlot();

  globalThis.chrome = {
    storage: {
      sync: {
        get(_keys, callback) { callback({ settings: { enabled: false } }); },
        set(_value, callback) { callback?.(); },
      },
      local: {
        get(_keys, callback) { callback({ state: {} }); },
        set(_value, callback) { callback?.(); },
      },
    },
    tabs: {
      query(_query, callback) { callback([]); },
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

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    await import(`../background/background.js?failure-test=${Date.now()}`);
    assert.equal(typeof activated.listener, 'function');

    chrome.storage.local.get = () => {
      throw new Error('storage unavailable');
    };

    assert.doesNotThrow(() => activated.listener({ tabId: 42 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(
      warnings.some((line) => line.includes('Tab Optimize activity update failed: storage unavailable')),
      'background failure should be reduced to a bounded warning',
    );
  } finally {
    console.warn = originalWarn;
  }
});
