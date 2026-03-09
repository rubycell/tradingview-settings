# TradingView Settings IO

Import/Export TradingView strategy input settings as JSON.

Adds **Import** and **Export** buttons directly into the strategy settings dialog, next to Cancel and OK.

## Install (Tampermonkey — Recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click Tampermonkey icon → **Create a new script**
3. Delete the template, paste contents of [`tv-settings-io.user.js`](tv-settings-io.user.js)
4. Press `Ctrl+S` to save
5. Open any TradingView chart → open strategy settings → buttons appear automatically

## Alternative: Console Paste

1. Open strategy settings dialog on TradingView
2. Open browser console (`F12` → Console)
3. Paste contents of [`export-strategy-inputs.js`](export-strategy-inputs.js)
4. Press Enter — buttons appear in the dialog footer

## Usage

- **Export**: Click the blue Export button → downloads a JSON file with all input values
- **Import**: Click the green Import button → pick a JSON file → values are loaded into the dialog

## Maintenance

TradingView updates their web app frequently, which can break CSS selectors.
See [WORKFLOW.md](WORKFLOW.md) for the update process.

Quick fix:
1. Run [`diagnose.js`](diagnose.js) in the console to get a DOM report
2. Update the `SEL` object in `tv-settings-io.user.js` with new selectors
3. Save in Tampermonkey

## Files

| File | Purpose |
|------|---------|
| `tv-settings-io.user.js` | Tampermonkey userscript (recommended) |
| `export-strategy-inputs.js` | Console-paste alternative |
| `diagnose.js` | DOM diagnostic tool for maintenance |
| `install-bookmarklet.html` | Bookmarklet installer (legacy) |
| `selectors.json` | Baseline CSS selectors reference |
| `WORKFLOW.md` | Full maintenance workflow |
