import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  selectTabsForDiscard,
  summarizeTabs,
} from '../shared/core.js';

const ALARM_NAME = 'tab-optimize-scan';
const SCAN_INTERVAL_MINUTES = 1;
const SETTINGS_KEY = 'settings';
const STATE_KEY = 'state';

function storageGet(area, keys) {
  return new Promise((resolve) => chrome.storage[area].get(keys, resolve));
}

function storageSet(area, value) {
  return new Promise((resolve) => chrome.storage[area].set(value, resolve));
}

function queryTabs(query = {}) {
  return new Promise((resolve) => chrome.tabs.query(query, resolve));
}

function discardTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.discard(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ ok: Boolean(tab), tab });
    });
  });
}

function reloadTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, {}, () => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

function clearAlarm(name) {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function runSafely(label, operation) {
  Promise.resolve(operation).catch((error) => {
    const message = error?.message || String(error);
    console.warn(`Tab Optimize ${label} failed: ${message}`);
  });
}

async function getSettings() {
  const stored = await storageGet('sync', [SETTINGS_KEY]);
  return normalizeSettings(stored[SETTINGS_KEY] || DEFAULT_SETTINGS);
}

async function saveSettings(settingsInput) {
  const settings = normalizeSettings(settingsInput);
  await storageSet('sync', { [SETTINGS_KEY]: settings });
  await ensureAlarm(settings);
  return settings;
}

async function getState() {
  const stored = await storageGet('local', [STATE_KEY]);
  const state = stored[STATE_KEY] || {};
  return {
    activityByTabId: { ...(state.activityByTabId || {}) },
    totalSuspensions: Number(state.totalSuspensions) || 0,
    lastOptimizationAt: Number(state.lastOptimizationAt) || 0,
    lastBatch: Array.isArray(state.lastBatch) ? state.lastBatch.filter(Number.isInteger) : [],
  };
}

async function saveState(state) {
  await storageSet('local', { [STATE_KEY]: state });
}

async function ensureAlarm(settingsInput) {
  const settings = normalizeSettings(settingsInput || await getSettings());
  await clearAlarm(ALARM_NAME);
  if (settings.enabled) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: SCAN_INTERVAL_MINUTES });
  }
}

async function initializeActivity(reset = false) {
  const tabs = await queryTabs({});
  const state = await getState();
  const now = Date.now();
  const currentIds = new Set(tabs.map((tab) => String(tab.id)));

  for (const key of Object.keys(state.activityByTabId)) {
    if (!currentIds.has(key)) delete state.activityByTabId[key];
  }

  for (const tab of tabs) {
    const key = String(tab.id);
    if (reset || !Number.isFinite(state.activityByTabId[key])) {
      state.activityByTabId[key] = now;
    }
  }

  await saveState(state);
  return state;
}

async function markTabActive(tabId, timestamp = Date.now()) {
  if (!Number.isInteger(tabId)) return;
  const state = await getState();
  state.activityByTabId[String(tabId)] = timestamp;
  await saveState(state);
}

async function removeTabState(tabId) {
  const state = await getState();
  delete state.activityByTabId[String(tabId)];
  state.lastBatch = state.lastBatch.filter((id) => id !== tabId);
  await saveState(state);
}

async function updateBadge() {
  const tabs = await queryTabs({});
  const sleeping = tabs.filter((tab) => tab.discarded).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setBadgeText({ text: sleeping > 0 ? String(sleeping) : '' });
  await chrome.action.setTitle({ title: sleeping > 0 ? `Tab Optimize — ${sleeping} sleeping` : 'Tab Optimize' });
}

async function optimizeTabs({ force = false } = {}) {
  const settings = await getSettings();
  if (!force && !settings.enabled) {
    return { suspended: 0, skipped: true, reason: 'disabled' };
  }

  const tabs = await queryTabs({});
  const state = await initializeActivity(false);
  const now = Date.now();
  const candidates = selectTabsForDiscard(tabs, settings, state.activityByTabId, now, force);
  const suspendedIds = [];

  for (const tab of candidates) {
    const result = await discardTab(tab.id);
    if (result.ok) suspendedIds.push(tab.id);
  }

  state.totalSuspensions += suspendedIds.length;
  state.lastOptimizationAt = now;
  state.lastBatch = suspendedIds;
  await saveState(state);
  await updateBadge();

  return {
    suspended: suspendedIds.length,
    considered: candidates.length,
    skipped: false,
  };
}

async function wakeLastBatch() {
  const state = await getState();
  const tabs = await queryTabs({});
  const discardedIds = new Set(tabs.filter((tab) => tab.discarded).map((tab) => tab.id));
  let restored = 0;

  for (const tabId of state.lastBatch) {
    if (!discardedIds.has(tabId)) continue;
    if (await reloadTab(tabId)) restored += 1;
  }

  state.lastBatch = [];
  await saveState(state);
  await updateBadge();
  return { restored };
}

async function getStatus() {
  const [settings, state, tabs] = await Promise.all([
    getSettings(),
    getState(),
    queryTabs({}),
  ]);

  return {
    settings,
    stats: summarizeTabs(tabs, settings, state.activityByTabId),
    totalSuspensions: state.totalSuspensions,
    lastOptimizationAt: state.lastOptimizationAt,
    canWakeLastBatch: state.lastBatch.length > 0,
  };
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const existing = await storageGet('sync', [SETTINGS_KEY]);
  if (!existing[SETTINGS_KEY]) {
    await storageSet('sync', { [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  await initializeActivity(true);
  await ensureAlarm();
  await updateBadge();

  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeActivity(false);
  await ensureAlarm();
  await updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runSafely('scheduled scan', optimizeTabs({ force: false }));
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  runSafely('activity update', markTabActive(tabId));
  runSafely('badge update', updateBadge());
});

chrome.tabs.onCreated.addListener((tab) => {
  runSafely('new-tab activity update', markTabActive(tab.id));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  runSafely('tab removal state update', removeTabState(tabId));
  runSafely('badge update', updateBadge());
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  runSafely('tab replacement state update', (async () => {
    await removeTabState(removedTabId);
    await markTabActive(addedTabId);
  })());
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active || changeInfo.status === 'complete') {
    runSafely('updated-tab activity update', markTabActive(tabId));
  }
  if (Object.prototype.hasOwnProperty.call(changeInfo, 'discarded')) {
    runSafely('badge update', updateBadge());
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const action = request?.action;

  (async () => {
    switch (action) {
      case 'GET_STATUS':
        return getStatus();
      case 'OPTIMIZE_NOW':
        return optimizeTabs({ force: true });
      case 'WAKE_LAST_BATCH':
        return wakeLastBatch();
      case 'GET_SETTINGS':
        return { settings: await getSettings() };
      case 'SAVE_SETTINGS':
        return { settings: await saveSettings(request.settings) };
      case 'RESET_SETTINGS':
        return { settings: await saveSettings(DEFAULT_SETTINGS) };
      default:
        return { error: `Unknown action: ${String(action)}` };
    }
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error?.message || String(error) }));

  return true;
});

runSafely('alarm initialization', ensureAlarm());
runSafely('badge initialization', updateBadge());
