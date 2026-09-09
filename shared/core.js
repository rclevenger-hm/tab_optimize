export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  inactivityMinutes: 30,
  protectPinned: true,
  protectAudible: true,
  excludedDomains: [],
});

const MIN_INACTIVITY_MINUTES = 5;
const MAX_INACTIVITY_MINUTES = 24 * 60;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDomainRule(value) {
  if (typeof value !== 'string') return '';
  let rule = value.trim().toLowerCase();
  if (!rule) return '';

  rule = rule.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  rule = rule.replace(/^\*\./, '').replace(/^\.+|\.+$/g, '');
  return rule;
}

export function normalizeSettings(raw = {}) {
  const parsedMinutes = Number.parseInt(raw.inactivityMinutes, 10);
  const inactivityMinutes = Number.isFinite(parsedMinutes)
    ? clamp(parsedMinutes, MIN_INACTIVITY_MINUTES, MAX_INACTIVITY_MINUTES)
    : DEFAULT_SETTINGS.inactivityMinutes;

  const rawDomains = Array.isArray(raw.excludedDomains)
    ? raw.excludedDomains
    : String(raw.excludedDomains || '').split(/[\n,]/);

  const excludedDomains = [...new Set(rawDomains.map(normalizeDomainRule).filter(Boolean))];

  return {
    enabled: raw.enabled ?? DEFAULT_SETTINGS.enabled,
    inactivityMinutes,
    protectPinned: raw.protectPinned ?? DEFAULT_SETTINGS.protectPinned,
    protectAudible: raw.protectAudible ?? DEFAULT_SETTINGS.protectAudible,
    excludedDomains,
  };
}

export function isSupportedUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function hostnameMatchesRule(hostname, rule) {
  const normalizedHostname = String(hostname || '').toLowerCase().replace(/\.$/, '');
  const normalizedRule = normalizeDomainRule(rule);
  if (!normalizedHostname || !normalizedRule) return false;
  return normalizedHostname === normalizedRule || normalizedHostname.endsWith(`.${normalizedRule}`);
}

export function matchesExcludedDomain(url, rules = []) {
  if (!isSupportedUrl(url)) return false;
  const hostname = new URL(url).hostname;
  return rules.some((rule) => hostnameMatchesRule(hostname, rule));
}

export function getProtectionReason(tab, settingsInput = DEFAULT_SETTINGS) {
  const settings = normalizeSettings(settingsInput);

  if (!tab || typeof tab.id !== 'number') return 'invalid';
  if (tab.active) return 'active';
  if (tab.discarded) return 'discarded';
  if (!isSupportedUrl(tab.url)) return 'unsupported';
  if (settings.protectPinned && tab.pinned) return 'pinned';
  if (settings.protectAudible && tab.audible) return 'audible';
  if (matchesExcludedDomain(tab.url, settings.excludedDomains)) return 'excluded';

  return null;
}

export function isTabEligibleForDiscard(tab, settingsInput, lastActiveAt, now = Date.now(), force = false) {
  const settings = normalizeSettings(settingsInput);
  if (getProtectionReason(tab, settings)) return false;
  if (force) return true;

  const lastActive = Number.isFinite(lastActiveAt) ? lastActiveAt : now;
  const inactiveFor = Math.max(0, now - lastActive);
  return inactiveFor >= settings.inactivityMinutes * 60 * 1000;
}

export function selectTabsForDiscard(tabs, settingsInput, activityByTabId = {}, now = Date.now(), force = false) {
  return (tabs || []).filter((tab) =>
    isTabEligibleForDiscard(tab, settingsInput, activityByTabId[String(tab.id)], now, force),
  );
}

export function summarizeTabs(tabs, settingsInput, activityByTabId = {}, now = Date.now()) {
  const settings = normalizeSettings(settingsInput);
  const summary = {
    total: 0,
    sleeping: 0,
    active: 0,
    protected: 0,
    eligible: 0,
  };

  for (const tab of tabs || []) {
    summary.total += 1;
    const reason = getProtectionReason(tab, settings);
    if (reason === 'discarded') summary.sleeping += 1;
    else if (reason === 'active') summary.active += 1;
    else if (reason) summary.protected += 1;
    else if (isTabEligibleForDiscard(tab, settings, activityByTabId[String(tab.id)], now, false)) summary.eligible += 1;
  }

  return summary;
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Not yet';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
