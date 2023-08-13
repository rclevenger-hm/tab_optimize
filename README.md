# tab_optimize

Tab Optimize is a Chrome extension that helps you manage memory usage by suspending inactive tabs to save memory and improve browser performance.

## Features

- Automatic suspension of inactive tabs
- Memory savings estimation
- Dynamic memory limits
- Clear suspended tabs
- Display of memory saved

## Installation

1. Clone or download this repository.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the extension directory.

## Usage

- Click the extension icon in the toolbar to open the popup UI.
- The popup UI displays the amount of memory saved and allows you to clear suspended tabs.
- Access the options/settings page to configure dynamic memory limits.

## Options/Settings

You can configure the extension's behavior through the options/settings page:

1. **Dynamic Memory Limit:** Set a dynamic memory limit based on your device's available RAM.

## Continuous Integration (CI)

We have set up a GitHub Actions workflow that runs tests and linting whenever changes are pushed to the repository. This workflow aims to identify any issues in the codebase without failing the workflow. If issues are found, the workflow will report them in the Actions tab.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Google Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/mv3/getstarted/)

## Author

Roger Clevenger

## Contact

For inquiries, please contact [your.email@example.com](mailto:roger@sinfulhands.com).
