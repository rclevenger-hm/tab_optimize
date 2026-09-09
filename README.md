# Tab Optimize

Tab Optimize is a small Manifest V3 Chrome extension that reduces browser memory pressure by using Chrome's native **tab discard** capability. It suspends eligible background tabs without closing them; Chrome restores a discarded tab when you return to it.

## What it does

- Automatically suspends inactive background tabs after a configurable idle period.
- Provides a one-click **Optimize now** action for immediate cleanup.
- Never suspends the currently active tab.
- Can protect pinned tabs and tabs playing audio.
- Supports a domain exclusion list for sites that should always stay awake.
- Shows how many open tabs are currently sleeping and keeps a lifetime suspension counter.
- Lets you wake the most recent manually/automatically suspended batch.
- Uses no content scripts, host permissions, analytics, remote code, or external runtime services.

Tab Optimize intentionally does **not** display a fake "memory saved" number. Chrome does not expose reliable per-tab memory usage through the extension tabs API, so the extension reports real tab state instead.

## Install locally

1. Download or clone the repository.
2. Open `chrome://extensions/` in Chrome, Chromium, Brave, Edge, or another compatible Chromium browser.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository directory (the directory containing `manifest.json`).

The extension icon opens the dashboard. The settings button opens configuration for automatic optimization, idle time, pinned/audio protection, and excluded domains.

## How suspension works

Tab Optimize calls Chrome's `chrome.tabs.discard()` API. Discarding removes the tab's renderer from memory while keeping the tab, title, URL, history entry, and place in the tab strip. Returning to a discarded tab causes Chrome to reload it.

The extension only considers ordinary `http://` and `https://` tabs. Browser pages such as `chrome://extensions`, extension pages, file URLs, the active tab, already discarded tabs, and configured protected tabs are skipped.

### Automatic mode

A Chrome alarm checks tabs every minute. A background tab becomes eligible once it has been inactive for the configured duration (30 minutes by default).

### Optimize now

The popup's **Suspend background tabs** button ignores the idle timer but still respects all safety protections and domain exclusions.

## Privacy

Tab Optimize runs entirely inside the browser. It does not transmit browsing data. The only persisted data is:

- extension settings in `chrome.storage.sync`;
- per-tab activity timestamps in `chrome.storage.local`;
- aggregate suspension counters and IDs for the most recent suspended batch.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the concise privacy statement.

## Development

Requires Node.js 20+ only for development checks; the extension itself has no npm runtime dependencies.

```bash
npm ci
npm run check
```

`npm run check` validates the Manifest V3 package, checks JavaScript syntax and local HTML references, and runs the Node test suite.

GitHub Actions executes the same checks on `dev`, `main`, and pull requests to `main`. CI also produces an installable `tab-optimize.zip` artifact.

## Project layout

```text
background/   Chrome service worker and discard orchestration
options/      Settings page
popup/        Toolbar dashboard
shared/       Pure settings/eligibility logic
icons/        Extension icons
scripts/      Package validation
tests/        Node test suite
```

## Permissions

Tab Optimize requests only:

- `tabs` — query and discard tabs;
- `storage` — save settings and local activity state;
- `alarms` — perform periodic idle-tab checks.

It requests no host permissions.

## License

MIT — see [LICENSE](LICENSE).
