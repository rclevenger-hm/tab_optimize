import { formatRelativeTime } from '../shared/core.js';

const elements = {
  autoStatus: document.querySelector('#autoStatus'),
  totalTabs: document.querySelector('#totalTabs'),
  sleepingTabs: document.querySelector('#sleepingTabs'),
  protectedTabs: document.querySelector('#protectedTabs'),
  totalSuspensions: document.querySelector('#totalSuspensions'),
  lastRun: document.querySelector('#lastRun'),
  optimizeButton: document.querySelector('#optimizeButton'),
  wakeButton: document.querySelector('#wakeButton'),
  settingsButton: document.querySelector('#settingsButton'),
  resultMessage: document.querySelector('#resultMessage'),
};

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

async function refreshStatus() {
  const status = await sendMessage({ action: 'GET_STATUS' });
  if (status.error) throw new Error(status.error);

  elements.autoStatus.textContent = status.settings.enabled ? 'Auto on' : 'Auto off';
  elements.autoStatus.dataset.enabled = String(status.settings.enabled);
  elements.totalTabs.textContent = status.stats.total;
  elements.sleepingTabs.textContent = status.stats.sleeping;
  elements.protectedTabs.textContent = status.stats.protected;
  elements.totalSuspensions.textContent = status.totalSuspensions;
  elements.lastRun.textContent = formatRelativeTime(status.lastOptimizationAt);
  elements.wakeButton.disabled = !status.canWakeLastBatch;
}

async function runOptimization() {
  elements.resultMessage.textContent = '';
  setBusy(elements.optimizeButton, true, 'Optimizing…', 'Suspend background tabs');
  try {
    const result = await sendMessage({ action: 'OPTIMIZE_NOW' });
    if (result.error) throw new Error(result.error);
    elements.resultMessage.textContent = result.suspended === 1
      ? '1 background tab suspended.'
      : `${result.suspended} background tabs suspended.`;
    await refreshStatus();
  } catch (error) {
    elements.resultMessage.textContent = `Could not optimize: ${error.message}`;
  } finally {
    setBusy(elements.optimizeButton, false, 'Optimizing…', 'Suspend background tabs');
  }
}

async function wakeLastBatch() {
  elements.resultMessage.textContent = '';
  setBusy(elements.wakeButton, true, 'Waking…', 'Wake last batch');
  try {
    const result = await sendMessage({ action: 'WAKE_LAST_BATCH' });
    if (result.error) throw new Error(result.error);
    elements.resultMessage.textContent = result.restored === 1
      ? '1 tab restored.'
      : `${result.restored} tabs restored.`;
    await refreshStatus();
  } catch (error) {
    elements.resultMessage.textContent = `Could not restore tabs: ${error.message}`;
  } finally {
    setBusy(elements.wakeButton, false, 'Waking…', 'Wake last batch');
  }
}

elements.optimizeButton.addEventListener('click', runOptimization);
elements.wakeButton.addEventListener('click', wakeLastBatch);
elements.settingsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

refreshStatus().catch((error) => {
  elements.resultMessage.textContent = `Extension status unavailable: ${error.message}`;
});
