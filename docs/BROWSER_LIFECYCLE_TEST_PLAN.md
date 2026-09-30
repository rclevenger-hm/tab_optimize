# Browser lifecycle test plan

Manifest V3 service workers are intentionally short-lived. Tab Optimize must therefore remain correct when the background worker is suspended, restarted, or awakened by an alarm rather than relying on in-memory state.

## Required lifecycle scenarios

- browser startup with persisted settings and surviving tabs;
- service-worker restart after state has already been written;
- alarm firing after the worker has been recreated;
- a tab created while the worker was inactive;
- a tab removed before the next optimization pass;
- a tab ID replaced by Chrome;
- storage API failure during startup or optimization;
- extension update/install without resetting user settings.

## Invariants

Persisted activity for surviving tabs is preserved. Closed-tab state is removed. Newly observed tabs receive an activity timestamp. Aggregate suspension counters do not reset on worker restart. Disabled mode does not schedule or perform discards. A Chrome API `lastError` must be handled rather than silently treated as success.

## Harness direction

Keep the current Node tests as the fast contract layer. The next integration layer should load the unpacked extension in Chrome/Chromium using a temporary profile, allow the worker to become idle, then trigger an alarm or browser event and verify persisted state. The harness should never depend on a personal browser profile or live browsing history.

## Release gate

A release is ready when both the pure unit tests and the real-browser lifecycle smoke test pass with the same manifest permissions that ship to users.
