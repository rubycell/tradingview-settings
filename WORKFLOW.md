# TradingView Settings IO — Maintenance Workflow

## Overview

TradingView updates their web app frequently, changing obfuscated CSS class names
and DOM structure. When the Import/Export buttons stop working, follow this workflow
to update the script.

## Files

| File | Purpose |
|------|---------|
| `tv-settings-io.user.js` | **Tampermonkey userscript** (recommended) — auto-runs on TradingView |
| `export-strategy-inputs.js` | Standalone script — paste in console as alternative |
| `diagnose.js` | Diagnostic script — inspects DOM and reports structure |
| `install-bookmarklet.html` | Bookmarklet installer (legacy, selectors get stale) |
| `selectors.json` | Last known working selectors (created by diagnose) |

## Installation (Tampermonkey — Recommended)

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click the Tampermonkey icon → **Create a new script**
3. Delete the template, paste contents of `tv-settings-io.user.js`
4. Press `Ctrl+S` to save
5. Done — buttons auto-appear in every strategy settings dialog

### Why Tampermonkey over Bookmarklet

| | Bookmarklet | Tampermonkey |
|---|---|---|
| Auto-runs on page load | No (click each time) | Yes |
| Easy to edit selectors | No (regenerate URL) | Yes (edit in dashboard) |
| Survives TV updates | Must rebuild bookmarklet | Edit `SEL` object, save |
| Install effort | Drag to bookmark bar | Install extension once |

## When to Update

Signs the script needs updating:
- Buttons don't appear in the dialog footer
- Export produces empty JSON or missing labels
- Import doesn't change any values
- Console shows `[TV-IO] Could not find footer button bar`

## Update Workflow

### Step 1: Run Diagnostics

1. Open TradingView chart with a strategy
2. Open strategy settings dialog (gear icon)
3. Select the **Inputs** tab
4. Open browser console (`F12` > Console)
5. Paste contents of `diagnose.js` and press Enter
6. The report is auto-copied to clipboard

### Step 2: Provide Report to Claude

Start a new Claude Code session and say:

```
TradingView updated their web app and the settings IO script broke.
Here is the diagnostic report from diagnose.js:

<paste the JSON report here>

Update export-strategy-inputs.js to work with the new DOM structure.
Focus on fixing the selectors listed as BROKEN in the report.
```

### Step 3: What Claude Needs to Fix

The diagnostic report contains everything needed:

| Report Section | What It Shows | What Might Break |
|----------------|---------------|------------------|
| `dialog` | How to find the settings dialog | Dialog detection |
| `footer` | Cancel/OK button location | Button injection |
| `inputElements` | Input types and CSS classes | Value extraction |
| `sampleRows` | How labels pair with inputs | Label-to-value mapping |
| `selectors` | Which selectors work/broken | All of the above |

### Step 4: Update the SEL Object

Claude will update the `SEL` object at the top of `tv-settings-io.user.js`.
All selectors are centralized there — no need to hunt through the code:

```js
const SEL = {
  dialogContainer: '[class*="container-"]',  // ← update these
  dialogTitle: '[class*="ellipsis-"]',
  checkboxLabel: '[class*="label-"]',
  inputTitle: '[class*="title_"]',
  // ... etc
};
```

After Claude updates the file:
1. Open Tampermonkey dashboard
2. Click the TV Settings IO script
3. Replace contents with updated `tv-settings-io.user.js`
4. Press `Ctrl+S` to save

Also sync `export-strategy-inputs.js` if you use the console-paste method.

### Step 5: Verify

1. Open TradingView with strategy settings dialog
2. Run the updated script (console paste or bookmarklet)
3. Check that buttons appear
4. Test Export — verify JSON has all inputs with correct labels
5. Test Import — load the exported JSON and verify values change

### Step 6: Save Working Selectors

After verifying, save the diagnostic report for future reference:

```bash
# In browser console after running diagnose.js:
# The report is in clipboard — paste to file
```

Save as `selectors.json` so the next update can diff against it.

## Architecture Notes

### Key Selectors (as of March 2026)

```
Dialog:       [class*="container-"] with child [class*="ellipsis-"]
Footer:       Parent of button with text "ok" or "cancel"
Checkboxes:   input[type="checkbox"] with aria-checked attribute
Text inputs:  input with data-qa-id="ui-lib-Input-input", inputmode="numeric"
Labels:       [class*="label-"] siblings for checkboxes
              [class*="title_"] ancestors for text inputs
              Sibling text elements as fallback
```

### Resilience Strategies

The script uses these approaches to survive class name changes:

1. **Substring class matching** — `[class*="container-"]` instead of exact class names
2. **Structural detection** — "div with >3 inputs and a title" instead of specific classes
3. **Multiple fallback strategies** — 3 ways to find dialog, 4 ways to find labels
4. **Behavior-based detection** — "button with text OK" instead of button class

### What Usually Changes

| Element | Stability | Notes |
|---------|-----------|-------|
| `role="dialog"` | HIGH | Standard ARIA, rarely changes |
| Button text "OK"/"Cancel" | HIGH | User-visible text |
| `data-qa-id` attributes | MEDIUM | QA markers, less likely to change |
| `[class*="container-"]` | MEDIUM | Pattern stable, hash suffix changes |
| `aria-checked` on checkboxes | HIGH | Accessibility standard |
| `inputmode="numeric"` | HIGH | HTML standard attribute |
| Exact class names (e.g., `input-RUSovanF`) | LOW | Changes every build |
