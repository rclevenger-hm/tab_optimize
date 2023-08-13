document.addEventListener('DOMContentLoaded', function() {
    const dynamicLimitInput = document.getElementById('dynamicLimit');
    const saveButton = document.getElementById('saveButton');
  
    chrome.storage.sync.get(['dynamicLimit'], function(result) {
      if (result.dynamicLimit) {
        dynamicLimitInput.value = result.dynamicLimit;
      }
    });
  
    saveButton.addEventListener('click', function() {
      const newDynamicLimit = parseInt(dynamicLimitInput.value, 10);
      if (!isNaN(newDynamicLimit)) {
        chrome.storage.sync.set({ dynamicLimit: newDynamicLimit }, function() {
          alert('Dynamic memory limit saved successfully.');
        });
      } else {
        alert('Please enter a valid number for the dynamic memory limit.');
      }
    });
  });
  