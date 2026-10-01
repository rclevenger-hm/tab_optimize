# Service-worker lifecycle contract

Tab Optimize runs on a Manifest V3 service worker, so background memory is disposable. Correctness must survive worker suspension, browser restart, and alarm recreation without relying on in-memory state.

## Persisted state

- Settings live in `chrome.storage.sync`.
- Activity timestamps, aggregate suspension counts, and the last suspended batch live in `chrome.storage.local`.
- Runtime listeners may be recreated at any time and must derive behavior from persisted state.

## Startup recovery

On browser startup the worker must:

1. query the current tab set;
2. preserve timestamps for tabs that still exist;
3. remove state for tabs that no longer exist;
4. assign timestamps to newly observed tabs;
5. clear the named scan alarm before deciding whether to recreate it;
6. recreate the periodic alarm only when optimization is enabled;
7. refresh the badge from the current discarded-tab count.

A disabled extension must remain disabled after restart and must not leave a stale periodic scan scheduled.

## Manual smoke test

1. Enable optimization and confirm the periodic scan alarm exists.
2. Open several tabs and record that activity state is populated.
3. Restart Chrome.
4. Confirm surviving tabs retain activity history and the scan alarm is recreated.
5. Disable optimization and restart Chrome again.
6. Confirm the scan alarm is cleared and not recreated.
7. Remove a tab, restart, and confirm its activity entry is no longer retained.

## Regression target

The automated startup test should continue to protect state reconciliation. The next lifecycle test should assert alarm clear/recreate behavior explicitly for both enabled and disabled settings, then cover service-worker suspension/restart without depending on module-level memory.
