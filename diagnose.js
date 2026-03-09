/**
 * TradingView Settings Dialog Diagnostics
 *
 * Run this in the browser console with the strategy settings dialog OPEN.
 * It inspects the current DOM structure and outputs a report showing:
 *   - How the dialog is structured
 *   - What CSS classes are used for key elements
 *   - How labels pair with inputs
 *   - What selectors need updating in the main script
 *
 * Usage:
 *   1. Open strategy settings dialog on TradingView
 *   2. Select the "Inputs" tab
 *   3. Paste this script in F12 > Console
 *   4. Copy the output and provide it when updating the main script
 */
(function diagnoseSettingsDialog() {
  "use strict";

  const report = {
    timestamp: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    dialog: null,
    footer: null,
    inputElements: null,
    labelStrategy: null,
    sampleRows: [],
    selectors: {},
  };

  // =========================================================================
  //  Step 1: Find the dialog
  // =========================================================================

  function findDialog() {
    const candidates = [];

    // Method A: role="dialog"
    const byRole = document.querySelector('[role="dialog"]');
    if (byRole) {
      candidates.push({
        method: 'role="dialog"',
        element: byRole,
        inputCount: byRole.querySelectorAll("input").length,
        classes: byRole.className,
      });
    }

    // Method B: container with ellipsis title
    const containers = document.querySelectorAll('[class*="container-"]');
    for (const c of containers) {
      const title = c.querySelector('[class*="ellipsis-"]');
      const inputCount = c.querySelectorAll("input").length;
      if (title && inputCount > 3) {
        candidates.push({
          method: 'container with ellipsis title',
          element: c,
          inputCount,
          classes: c.className,
          title: title.textContent.trim(),
        });
      }
    }

    // Method C: any large div with many inputs
    const allDivs = document.querySelectorAll("div");
    let bestDiv = null;
    let bestCount = 0;
    for (const div of allDivs) {
      const rect = div.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200 && rect.width < 900) {
        const count = div.querySelectorAll("input").length;
        if (count > bestCount) {
          bestCount = count;
          bestDiv = div;
        }
      }
    }
    if (bestDiv) {
      candidates.push({
        method: "largest bounded div with inputs",
        element: bestDiv,
        inputCount: bestCount,
        classes: bestDiv.className,
      });
    }

    return candidates;
  }

  const dialogCandidates = findDialog();
  report.dialog = dialogCandidates.map(({ method, inputCount, classes, title }) => ({
    method,
    inputCount,
    classes: classes?.substring(0, 120),
    title,
  }));

  // Pick the best candidate
  const dialog =
    dialogCandidates.find((c) => c.method.includes("container"))?.element ||
    dialogCandidates.find((c) => c.method.includes("role"))?.element ||
    dialogCandidates[0]?.element;

  if (!dialog) {
    console.error("%c[Diagnose] No dialog found! Is the settings dialog open?", "color: red; font-weight: bold");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // =========================================================================
  //  Step 2: Find the footer (Cancel / OK buttons)
  // =========================================================================

  const buttons = dialog.querySelectorAll("button");
  const footerButtons = [];
  let footerBar = null;

  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    if (["ok", "cancel", "reset", "defaults"].includes(text)) {
      footerButtons.push({
        text: btn.textContent.trim(),
        classes: btn.className.substring(0, 80),
        parentClasses: btn.parentElement?.className?.substring(0, 80),
      });
      if (!footerBar) footerBar = btn.parentElement;
    }
  }

  report.footer = {
    found: !!footerBar,
    footerClasses: footerBar?.className?.substring(0, 120),
    buttons: footerButtons,
  };

  // =========================================================================
  //  Step 3: Analyze input elements
  // =========================================================================

  const allInputs = dialog.querySelectorAll("input");
  const inputTypes = {};
  for (const inp of allInputs) {
    const key = `${inp.type || "text"}${inp.getAttribute("inputmode") ? ` (inputmode=${inp.getAttribute("inputmode")})` : ""}`;
    inputTypes[key] = (inputTypes[key] || 0) + 1;
  }

  report.inputElements = {
    totalCount: allInputs.length,
    byType: inputTypes,
    sampleClasses: Array.from(allInputs)
      .slice(0, 5)
      .map((i) => ({
        type: i.type,
        inputmode: i.getAttribute("inputmode"),
        classes: i.className.substring(0, 80),
        value: i.type === "checkbox" ? i.getAttribute("aria-checked") : i.value?.substring(0, 30),
        dataQaId: i.getAttribute("data-qa-id"),
      })),
  };

  // =========================================================================
  //  Step 4: Analyze label-input pairing
  // =========================================================================

  function analyzeRow(inputEl) {
    const row = { inputType: inputEl.type, inputValue: inputEl.value?.substring(0, 30) };

    // Walk up and collect ancestor info
    const ancestors = [];
    let node = inputEl.parentElement;
    for (let i = 0; i < 8 && node && node !== dialog; i++) {
      ancestors.push({
        tag: node.tagName,
        classes: node.className?.substring(0, 60),
        childCount: node.children.length,
        hasText: Array.from(node.children).some(
          (c) => !c.querySelector("input") && c.textContent.trim().length > 0 && c.textContent.trim().length < 150
        ),
      });
      node = node.parentElement;
    }
    row.ancestors = ancestors;

    // Find nearby text that could be a label
    const labelCandidates = [];
    node = inputEl.parentElement;
    for (let depth = 0; depth < 8 && node && node !== dialog; depth++) {
      // Check title_ / label_ elements
      for (const selector of ['[class*="title_"]', '[class*="label_"]', "label"]) {
        const el = node.querySelector(selector);
        if (el && !el.contains(inputEl)) {
          labelCandidates.push({
            depth,
            selector,
            text: el.textContent.trim().substring(0, 80),
            classes: el.className?.substring(0, 60),
          });
        }
      }

      // Check sibling text
      for (const child of node.children) {
        if (child.contains(inputEl)) continue;
        if (child.querySelector("input")) continue;
        const text = child.textContent.trim();
        if (text.length > 0 && text.length < 150) {
          labelCandidates.push({
            depth,
            selector: "sibling-text",
            text: text.substring(0, 80),
            classes: child.className?.substring(0, 60),
          });
        }
      }

      node = node.parentElement;
    }
    row.labelCandidates = labelCandidates;

    return row;
  }

  // Sample first 5 inputs of each type
  const checkboxes = Array.from(allInputs).filter((i) => i.type === "checkbox");
  const textInputs = Array.from(allInputs).filter((i) => i.type !== "checkbox");

  report.sampleRows = [
    ...checkboxes.slice(0, 3).map((i) => ({ ...analyzeRow(i), category: "checkbox" })),
    ...textInputs.slice(0, 5).map((i) => ({ ...analyzeRow(i), category: "text/number" })),
  ];

  // =========================================================================
  //  Step 5: Detect working selectors
  // =========================================================================

  const selectorTests = {
    'dialog: [role="dialog"]': !!document.querySelector('[role="dialog"]'),
    'dialog: [class*="container-"] with [class*="ellipsis-"]':
      !!document.querySelector('[class*="container-"] [class*="ellipsis-"]'),
    'inputs: [data-qa-id="ui-lib-Input-input"]':
      dialog.querySelectorAll('[data-qa-id="ui-lib-Input-input"]').length,
    'inputs: input[type="checkbox"]':
      dialog.querySelectorAll('input[type="checkbox"]').length,
    'inputs: input[inputmode="numeric"]':
      dialog.querySelectorAll('input[inputmode="numeric"]').length,
    'labels: [class*="title_"]':
      dialog.querySelectorAll('[class*="title_"]').length,
    'labels: [class*="label_"]':
      dialog.querySelectorAll('[class*="label_"]').length,
    'labels: [class*="label-"]':
      dialog.querySelectorAll('[class*="label-"]').length,
    'footer: button text OK/Cancel': footerButtons.length,
    'structure: [class*="cell_"]':
      dialog.querySelectorAll('[class*="cell_"]').length,
    'structure: [class*="row_"]':
      dialog.querySelectorAll('[class*="row_"]').length,
    'structure: [class*="wrapper-"]':
      dialog.querySelectorAll('[class*="wrapper-"]').length,
    'dropdowns: [class*="select_"]':
      dialog.querySelectorAll('[class*="select_"]').length,
    'tabs: [class*="tab_"]':
      dialog.querySelectorAll('[class*="tab_"]').length,
  };

  report.selectors = selectorTests;

  // =========================================================================
  //  Output
  // =========================================================================

  console.log("%c[Diagnose] TradingView Settings Dialog Report", "color: #9C27B0; font-weight: bold; font-size: 16px");
  console.log(JSON.stringify(report, null, 2));

  // Summary table
  console.log("%c--- Selector Results ---", "color: #FF9800; font-weight: bold");
  console.table(
    Object.entries(selectorTests).map(([selector, result]) => ({
      selector,
      result,
      status: result ? "OK" : "BROKEN",
    }))
  );

  // Copy to clipboard
  const reportJson = JSON.stringify(report, null, 2);
  navigator.clipboard.writeText(reportJson).then(
    () => console.log("%c[Diagnose] Report copied to clipboard!", "color: #4CAF50; font-weight: bold"),
    () => console.log("%c[Diagnose] Could not copy to clipboard. Select the JSON above manually.", "color: #FF9800")
  );
})();
