document.addEventListener('DOMContentLoaded', function() {
    chrome.runtime.sendMessage({ action: 'getMemorySaved' }, function(response) {
      updateMemorySavedDisplay(response.memorySaved);
    });
  
    document.getElementById('clearButton').addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'clearSuspendedTabs' });
      updateMemorySavedDisplay(0);
    });
  });
  
  function updateMemorySavedDisplay(memorySaved) {
    const memorySavedElement = document.getElementById('memorySaved');
    memorySavedElement.textContent = formatMemory(memorySaved);
  }
  
  function formatMemory(memoryInBytes) {
    if (memoryInBytes < 1024) {
      return memoryInBytes + " B";
    } else if (memoryInBytes < 1024 * 1024) {
      return (memoryInBytes / 1024).toFixed(2) + " KB";
    } else {
      return (memoryInBytes / (1024 * 1024)).toFixed(2) + " MB";
    }
  }
  