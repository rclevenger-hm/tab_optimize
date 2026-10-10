import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function createPopup({ result = { restored: 1, failed: 0 }, canWake = false, wakeError, statusError } = {}) {
  const elements = new Map();
  globalThis.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        textContent: '', disabled: false, dataset: {}, listeners: {},
        addEventListener(name, listener) { this.listeners[name] = listener; },
      });
      return elements.get(selector);
    },
  };
  let statusCalls = 0;
  let finishWake;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage({ action }, callback) {
        if (action === 'WAKE_LAST_BATCH') {
          finishWake = () => {
            if (wakeError) chrome.runtime.lastError = { message: wakeError };
            callback(result);
            chrome.runtime.lastError = null;
          };
          return;
        }
        assert.equal(action, 'GET_STATUS');
        statusCalls += 1;
        callback(statusCalls > 1 && statusError ? { error: statusError } : {
          settings: { enabled: false },
          stats: { total: 2, sleeping: 1, protected: 0 },
          totalSuspensions: 4, lastOptimizationAt: 0,
          canWakeLastBatch: statusCalls === 1 || canWake,
        });
      },
    },
  };
  await import(`../popup/popup.js?wake-recovery=${++instance}`);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    button: elements.get('#wakeButton'), message: elements.get('#resultMessage'),
    wake() {
      const pending = elements.get('#wakeButton').listeners.click();
      assert.equal(elements.get('#wakeButton').disabled, true, 'disable button during wake request');
      finishWake();
      return pending;
    },
  };
}

test('successful wake leaves the button disabled when no recovery batch remains', async () => {
  const popup = await createPopup();
  await popup.wake();
  assert.equal(popup.button.disabled, true);
  assert.equal(popup.button.textContent, 'Wake last batch');
  assert.equal(popup.message.textContent, '1 tab restored.');
});

test('partial wake reports the failure and permits retry', async () => {
  const popup = await createPopup({ result: { restored: 1, failed: 1 }, canWake: true });
  await popup.wake();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.message.textContent, '1 tab restored. 1 tab could not be restored. Try Wake last batch again.');
});

test('all failures use plural feedback and preserve retry', async () => {
  const popup = await createPopup({ result: { restored: 0, failed: 2 }, canWake: true });
  await popup.wake();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.message.textContent, '0 tabs restored. 2 tabs could not be restored. Try Wake last batch again.');
});

test('transport failure restores the retry control and reports the error', async () => {
  const popup = await createPopup({ wakeError: 'Worker unavailable' });
  await popup.wake();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.button.textContent, 'Wake last batch');
  assert.equal(popup.message.textContent, 'Could not restore tabs: Worker unavailable');
});

test('worker failure restores the retry control and reports the error', async () => {
  const popup = await createPopup({ result: { error: 'Storage unavailable' } });
  await popup.wake();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.message.textContent, 'Could not restore tabs: Storage unavailable');
});

test('status refresh failure leaves a usable retry control', async () => {
  const popup = await createPopup({ statusError: 'Status unavailable' });
  await popup.wake();
  assert.equal(popup.button.disabled, false);
  assert.equal(popup.message.textContent, 'Could not restore tabs: Status unavailable');
});
