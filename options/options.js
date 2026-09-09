import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/core.js';

const form = document.querySelector('#settingsForm');
const enabled = document.querySelector('#enabled');
const inactivityMinutes = document.querySelector('#inactivityMinutes');
const protectPinned = document.querySelector('#protectPinned');
const protectAudible = document.querySelector('#protectAudible');
const excludedDomains = document.querySelector('#excludedDomains');
const resetButton = document.querySelector('#resetButton');
const saveStatus = document.querySelector('#saveStatus');

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

function populate(settingsInput) {
  const settings = normalizeSettings(settingsInput);
  enabled.checked = settings.enabled;
  inactivityMinutes.value = settings.inactivityMinutes;
  protectPinned.checked = settings.protectPinned;
  protectAudible.checked = settings.protectAudible;
  excludedDomains.value = settings.excludedDomains.join('\n');
}

function readForm() {
  return normalizeSettings({
    enabled: enabled.checked,
    inactivityMinutes: inactivityMinutes.value,
    protectPinned: protectPinned.checked,
    protectAudible: protectAudible.checked,
    excludedDomains: excludedDomains.value,
  });
}

async function loadSettings() {
  const response = await sendMessage({ action: 'GET_SETTINGS' });
  if (response.error) throw new Error(response.error);
  populate(response.settings);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveStatus.textContent = 'Saving…';
  try {
    const response = await sendMessage({ action: 'SAVE_SETTINGS', settings: readForm() });
    if (response.error) throw new Error(response.error);
    populate(response.settings);
    saveStatus.textContent = 'Saved';
  } catch (error) {
    saveStatus.textContent = `Could not save: ${error.message}`;
  }
});

resetButton.addEventListener('click', async () => {
  saveStatus.textContent = 'Resetting…';
  try {
    const response = await sendMessage({ action: 'RESET_SETTINGS' });
    if (response.error) throw new Error(response.error);
    populate(response.settings || DEFAULT_SETTINGS);
    saveStatus.textContent = 'Defaults restored';
  } catch (error) {
    saveStatus.textContent = `Could not reset: ${error.message}`;
  }
});

loadSettings().catch((error) => {
  populate(DEFAULT_SETTINGS);
  saveStatus.textContent = `Could not load settings: ${error.message}`;
});
