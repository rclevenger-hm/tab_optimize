import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  formatRelativeTime,
  getProtectionReason,
  hostnameMatchesRule,
  isSupportedUrl,
  isTabEligibleForDiscard,
  matchesExcludedDomain,
  normalizeSettings,
  selectTabsForDiscard,
  summarizeTabs,
} from '../shared/core.js';

const backgroundTab = (overrides = {}) => ({
  id: 1,
  active: false,
  discarded: false,
  pinned: false,
  audible: false,
  url: 'https://example.com/page',
  ...overrides,
});

test('normalizes settings and domain entries', () => {
  assert.deepEqual(normalizeSettings({
    inactivityMinutes: '2',
    excludedDomains: 'https://Mail.Google.com/inbox\n*.example.com\nexample.com',
  }), {
    enabled: true,
    inactivityMinutes: 5,
    protectPinned: true,
    protectAudible: true,
    excludedDomains: ['mail.google.com', 'example.com'],
  });
});

test('accepts only ordinary web URLs for discarding', () => {
  assert.equal(isSupportedUrl('https://example.com'), true);
  assert.equal(isSupportedUrl('http://example.com'), true);
  assert.equal(isSupportedUrl('chrome://settings'), false);
  assert.equal(isSupportedUrl('file:///tmp/a.html'), false);
  assert.equal(isSupportedUrl('not a url'), false);
});

test('domain rules protect exact domains and subdomains', () => {
  assert.equal(hostnameMatchesRule('mail.example.com', 'example.com'), true);
  assert.equal(hostnameMatchesRule('example.com', '*.example.com'), true);
  assert.equal(hostnameMatchesRule('notexample.com', 'example.com'), false);
  assert.equal(matchesExcludedDomain('https://a.example.com/x', ['example.com']), true);
});

test('active tabs are never eligible', () => {
  const tab = backgroundTab({ active: true });
  assert.equal(getProtectionReason(tab, DEFAULT_SETTINGS), 'active');
  assert.equal(isTabEligibleForDiscard(tab, DEFAULT_SETTINGS, 0, Date.now(), true), false);
});

test('pinned tabs are protected by default', () => {
  assert.equal(getProtectionReason(backgroundTab({ pinned: true }), DEFAULT_SETTINGS), 'pinned');
});

test('audible tabs are protected by default', () => {
  assert.equal(getProtectionReason(backgroundTab({ audible: true }), DEFAULT_SETTINGS), 'audible');
});

test('discarded tabs are not selected again', () => {
  assert.equal(getProtectionReason(backgroundTab({ discarded: true }), DEFAULT_SETTINGS), 'discarded');
});

test('manual optimization ignores idle age but not protections', () => {
  const now = Date.now();
  assert.equal(isTabEligibleForDiscard(backgroundTab(), DEFAULT_SETTINGS, now, now, true), true);
  assert.equal(isTabEligibleForDiscard(backgroundTab({ pinned: true }), DEFAULT_SETTINGS, now, now, true), false);
});

test('automatic optimization respects the configured idle threshold', () => {
  const now = 1_000_000;
  const settings = { ...DEFAULT_SETTINGS, inactivityMinutes: 30 };
  assert.equal(isTabEligibleForDiscard(backgroundTab(), settings, now - 29 * 60_000, now), false);
  assert.equal(isTabEligibleForDiscard(backgroundTab(), settings, now - 30 * 60_000, now), true);
});

test('selection returns only eligible tabs', () => {
  const now = 10_000_000;
  const tabs = [
    backgroundTab({ id: 1 }),
    backgroundTab({ id: 2, pinned: true }),
    backgroundTab({ id: 3, active: true }),
    backgroundTab({ id: 4, url: 'chrome://extensions' }),
  ];
  const activity = { '1': 0, '2': 0, '3': 0, '4': 0 };
  assert.deepEqual(selectTabsForDiscard(tabs, DEFAULT_SETTINGS, activity, now, true).map((tab) => tab.id), [1]);
});

test('summary separates sleeping, active, protected, and eligible tabs', () => {
  const now = 10_000_000;
  const tabs = [
    backgroundTab({ id: 1 }),
    backgroundTab({ id: 2, discarded: true }),
    backgroundTab({ id: 3, active: true }),
    backgroundTab({ id: 4, pinned: true }),
  ];
  const activity = { '1': 0 };
  assert.deepEqual(summarizeTabs(tabs, DEFAULT_SETTINGS, activity, now), {
    total: 4,
    sleeping: 1,
    active: 1,
    protected: 1,
    eligible: 1,
  });
});

test('relative time formatting is concise', () => {
  assert.equal(formatRelativeTime(0, 1000), 'Not yet');
  assert.equal(formatRelativeTime(95_000, 100_000), 'Just now');
  assert.equal(formatRelativeTime(40_000, 100_000), '1m ago');
});
