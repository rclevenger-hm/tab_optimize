let suspendedTabs = {};
let memorySaved = 0;

function formatMemory(memoryInBytes) {
  if (memoryInBytes < 1024) {
    return memoryInBytes + " B";
  } else if (memoryInBytes < 1024 * 1024) {
    return (memoryInBytes / 1024).toFixed(2) + " KB";
  } else {
    return (memoryInBytes / (1024 * 1024)).toFixed(2) + " MB";
  }
}

function estimatePageContentMemory(tab) {
  // Implement logic to analyze page content and estimate memory consumption
  // Return estimated memory in bytes
  return 0;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && !tab.active) {
    const contentMemory = estimatePageContentMemory(tab);
    const savedMemory = suspendTab(tabId, contentMemory);
    memorySaved += savedMemory;
    updateMemorySavedDisplay();
  }
});

function suspendTab(tabId, contentMemory) {
  if (suspendedTabs[tabId]) {
    return 0;
  }

  let savedMemory = 0;

  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) {
      chrome.tabs.discard(tabId, () => {
        if (!chrome.runtime.lastError) {
          suspendedTabs[tabId] = true;
          savedMemory = tab.memory - (tab.discarded ? tab.discarded.memory : 0);
          savedMemory += contentMemory;
        }
      });
    }
  });

  return savedMemory;
}

function restoreTab(tabId) {
  if (!suspendedTabs[tabId]) {
    return;
  }

  chrome.tabs.get(tabId, (tab) => {
    if (tab.url) {
      chrome.tabs.update(tabId, { url: tab.url });
    }
    delete suspendedTabs[tabId];
    updateMemorySavedDisplay();
  });
}

function handleTabActivation(tab) {
  if (suspendedTabs[tab.id]) {
    restoreTab(tab.id);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, handleTabActivation);
});

function getDynamicMemoryLimit() {
  // Implement logic to calculate dynamic memory limit based on device's available RAM
  // Return limit in bytes
  return 0;
}

function clearSuspendedTabs() {
  for (const tabId in suspendedTabs) {
    restoreTab(tabId);
  }
  memorySaved = 0;
  updateMemorySavedDisplay();
}

function updateMemorySavedDisplay() {
  chrome.runtime.sendMessage({ action: 'updateMemorySaved', memorySaved });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'restoreTab') {
    restoreTab(request.tabId);
  } else if (request.action === 'getMemorySaved') {
    sendResponse({ memorySaved });
  } else if (request.action === 'clearSuspendedTabs') {
    clearSuspendedTabs();
  }
});

// Dynamic memory limit based on available RAM
function getDynamicMemoryLimit() {
  // Implement logic to calculate dynamic memory limit based on device's available RAM
  // Return limit in bytes
  return 0;
}

// Function to restore all tabs if memory usage is close to the limit
function restoreTabsIfNeeded() {
  const dynamicLimit = getDynamicMemoryLimit();
  if (dynamicLimit && memorySaved >= dynamicLimit) {
    clearSuspendedTabs();
  }
}

// Event listener for tab creation
chrome.tabs.onCreated.addListener((tab) => {
  restoreTabsIfNeeded();
});

// Event listener for tab removal
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  restoreTabsIfNeeded();
});

// Event listener for browser startup
chrome.runtime.onStartup.addListener(() => {
  restoreTabsIfNeeded();
});

// Listen for messages from the popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'restoreTab') {
    restoreTab(request.tabId);
  } else if (request.action === 'getMemorySaved') {
    sendResponse({ memorySaved });
  } else if (request.action === 'clearSuspendedTabs') {
    clearSuspendedTabs();
  }
});

// Initialize extension settings or perform other initialization tasks
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Perform initial setup on extension installation
  } else if (details.reason === 'update') {
    // Perform tasks on extension update
  }
});

// Update the memory saved display in the popup UI
function updateMemorySavedDisplay() {
  chrome.runtime.sendMessage({ action: 'updateMemorySaved', memorySaved });
}

