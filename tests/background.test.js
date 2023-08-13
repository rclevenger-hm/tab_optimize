// Import the functions to be tested
import { suspendTab, restoreTab, estimatePageContentMemory } from '../background/background';

describe('Background Functions Tests', () => {
  describe('suspendTab', () => {
    it('should suspend a tab and return saved memory', () => {
      // Test your suspendTab function here
    });

    it('should not suspend an already suspended tab', () => {
      // Test your suspendTab function with an already suspended tab
    });

  });

  describe('restoreTab', () => {
    it('should restore a tab and remove from suspendedTabs', () => {
      // Test your restoreTab function here
    });

    it('should do nothing if tab is not suspended', () => {
      // Test your restoreTab function with a non-suspended tab
    });

  });

  describe('estimatePageContentMemory', () => {
    it('should estimate memory for a given tab', () => {
      // Test your estimatePageContentMemory function here
    });

  });
});
