/**
 * TradingView Strategy Settings Import/Export
 *
 * Injects "Import" and "Export" buttons into the strategy settings dialog,
 * right next to the existing Cancel and OK buttons.
 *
 * Usage:
 *   1. Open a TradingView chart with a strategy applied
 *   2. Open the strategy settings dialog (gear icon or double-click)
 *   3. Open browser console (F12 > Console)
 *   4. Paste this entire script and press Enter
 *   5. Two new buttons appear: "Import" and "Export"
 *
 * Export: Downloads all input values as a JSON file.
 * Import: Opens a file picker, loads a JSON file, and fills in values.
 *
 * The script watches for dialogs opening, so buttons re-appear automatically
 * if you close and reopen settings. Run the script once per page load.
 */
(function tvSettingsIO() {
  "use strict";

  const BUTTON_ID_EXPORT = "tv-settings-export-btn";
  const BUTTON_ID_IMPORT = "tv-settings-import-btn";

  // =========================================================================
  //  Dialog & Strategy Name Detection
  // =========================================================================

  function findSettingsDialog() {
    // Look for the dialog that contains strategy inputs
    // TradingView wraps the dialog content in a container with a title
    const containers = document.querySelectorAll('[class*="container-"]');
    for (const container of containers) {
      const titleEl = container.querySelector('[class*="ellipsis-"]');
      const hasInputs = container.querySelectorAll("input").length > 3;
      if (titleEl && hasInputs) return container;
    }
    // Fallback: role="dialog"
    const byRole = document.querySelector('[role="dialog"]');
    if (byRole && byRole.querySelectorAll("input").length > 3) return byRole;
    return null;
  }

  function getStrategyName() {
    const titleEl = document.querySelector(
      '[class*="container-"] [class*="ellipsis-"]'
    );
    if (titleEl) {
      const text = titleEl.textContent.trim();
      if (text.length > 0 && text.length < 300) return text;
    }
    return "strategy";
  }

  // =========================================================================
  //  Find the footer button bar (Cancel / OK)
  // =========================================================================

  function findFooterBar(dialog) {
    // Look for the bar that contains OK / Cancel buttons
    const buttons = dialog.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === "ok" || text === "cancel") {
        // The parent of OK/Cancel is the footer bar
        return btn.parentElement;
      }
    }
    return null;
  }

  // =========================================================================
  //  Label <-> Input Mapping
  // =========================================================================

  function findLabelForInput(inputEl) {
    // For checkboxes: label is a sibling span with class label-*
    const parent = inputEl.parentElement;
    if (parent) {
      const labelSibling =
        parent.parentElement?.querySelector('[class*="label-"]');
      if (labelSibling) {
        const text = labelSibling.textContent.trim();
        if (text) return text;
      }
    }

    // Walk up DOM looking for a title/label element
    let ancestor = inputEl.parentElement;
    for (let depth = 0; depth < 10 && ancestor; depth++) {
      const titleEl = ancestor.querySelector(
        '[class*="title_"],[class*="label_"]:not([class*="slider"]),[class*="titleText"]'
      );
      if (titleEl) {
        const text = titleEl.textContent.trim();
        if (text && text.length > 0 && text.length < 200) {
          const inputsInAncestor = ancestor.querySelectorAll("input");
          if (inputsInAncestor.length <= 3) return text;
        }
      }

      // Check sibling text elements
      for (const child of ancestor.children) {
        if (child === inputEl || child.contains(inputEl)) continue;
        if (child.querySelector("input")) continue;
        const text = child.textContent.trim();
        if (text && text.length > 0 && text.length < 150 && !text.includes("\n")) {
          if (child.querySelectorAll("input").length === 0) return text;
        }
      }

      ancestor = ancestor.parentElement;
    }

    return (
      inputEl.getAttribute("aria-label") ||
      inputEl.getAttribute("placeholder") ||
      inputEl.getAttribute("name") ||
      null
    );
  }

  // =========================================================================
  //  EXPORT — read all input values
  // =========================================================================

  function extractValue(inputEl) {
    if (inputEl.type === "checkbox") {
      const ariaChecked = inputEl.getAttribute("aria-checked");
      if (ariaChecked !== null) return ariaChecked === "true";
      return inputEl.checked;
    }
    const val = inputEl.value;
    if (
      inputEl.getAttribute("inputmode") === "numeric" ||
      inputEl.type === "number"
    ) {
      return val === "" ? null : Number(val);
    }
    if (val !== "" && !isNaN(Number(val)) && val.trim() === val) {
      return Number(val);
    }
    return val;
  }

  function exportInputs(dialog) {
    const results = {};
    const allInputs = dialog.querySelectorAll("input");

    for (const inputEl of allInputs) {
      const label = findLabelForInput(inputEl);
      if (!label) continue;

      const value = extractValue(inputEl);

      // Handle duplicate labels
      let finalLabel = label;
      if (results.hasOwnProperty(finalLabel)) {
        let idx = 2;
        while (results.hasOwnProperty(`${label} (${idx})`)) idx++;
        finalLabel = `${label} (${idx})`;
      }
      results[finalLabel] = value;
    }

    return results;
  }

  // =========================================================================
  //  IMPORT — set input values from JSON
  // =========================================================================

  /** Trigger React-compatible change on an input element */
  function setNativeValue(inputEl, value) {
    // React overrides the native value setter; we need the original
    const proto =
      inputEl.type === "checkbox"
        ? HTMLInputElement.prototype
        : Object.getPrototypeOf(inputEl);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (inputEl.type === "checkbox") {
      const desiredChecked = Boolean(value);
      if (inputEl.checked !== desiredChecked) {
        // Click the checkbox wrapper to toggle (more reliable than setting .checked)
        const wrapper =
          inputEl.closest('[class*="wrapper-"]') ||
          inputEl.parentElement;
        if (wrapper) {
          wrapper.click();
        } else {
          inputEl.click();
        }
      }
      return;
    }

    // For text/number inputs
    if (nativeSetter) {
      nativeSetter.call(inputEl, String(value));
    } else {
      inputEl.value = String(value);
    }

    // Dispatch events to notify React
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));

    // Some TradingView inputs also respond to blur
    inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function buildLabelToInputMap(dialog) {
    const labelMap = {};
    const allInputs = dialog.querySelectorAll("input");

    for (const inputEl of allInputs) {
      const label = findLabelForInput(inputEl);
      if (!label) continue;

      // Handle duplicate labels (same logic as export)
      let finalLabel = label;
      if (labelMap.hasOwnProperty(finalLabel)) {
        let idx = 2;
        while (labelMap.hasOwnProperty(`${label} (${idx})`)) idx++;
        finalLabel = `${label} (${idx})`;
      }
      labelMap[finalLabel] = inputEl;
    }

    return labelMap;
  }

  function importInputs(dialog, data) {
    const inputValues = data.inputs || data;
    const labelMap = buildLabelToInputMap(dialog);

    let matched = 0;
    let skipped = 0;
    const notFound = [];

    for (const [label, value] of Object.entries(inputValues)) {
      const inputEl = labelMap[label];
      if (!inputEl) {
        notFound.push(label);
        skipped++;
        continue;
      }
      setNativeValue(inputEl, value);
      matched++;
    }

    return { matched, skipped, notFound };
  }

  // =========================================================================
  //  File I/O helpers
  // =========================================================================

  function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function pickJsonFile() {
    return new Promise((resolve, reject) => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) {
          document.body.removeChild(fileInput);
          reject(new Error("No file selected"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          document.body.removeChild(fileInput);
          try {
            resolve(JSON.parse(reader.result));
          } catch (err) {
            reject(new Error("Invalid JSON file: " + err.message));
          }
        };
        reader.onerror = () => {
          document.body.removeChild(fileInput);
          reject(new Error("Failed to read file"));
        };
        reader.readAsText(file);
      });

      fileInput.click();
    });
  }

  // =========================================================================
  //  Button Creation & Injection
  // =========================================================================

  function createStyledButton(text, color) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `
      padding: 6px 16px;
      margin-right: 8px;
      border: 1px solid ${color};
      border-radius: 4px;
      background: transparent;
      color: ${color};
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      font-family: inherit;
      line-height: 1.5;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = color;
      btn.style.color = "#fff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
      btn.style.color = color;
    });
    return btn;
  }

  function injectButtons(dialog) {
    // Don't inject twice
    if (dialog.querySelector(`#${BUTTON_ID_EXPORT}`)) return;

    const footer = findFooterBar(dialog);
    if (!footer) {
      console.warn("[TV-IO] Could not find footer button bar");
      return;
    }

    // Create a wrapper for our buttons (inserted before OK/Cancel)
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display: inline-flex; gap: 8px; margin-right: auto;";

    // --- Export Button ---
    const exportBtn = createStyledButton("Export", "#2196F3");
    exportBtn.id = BUTTON_ID_EXPORT;
    exportBtn.title = "Export all input settings to a JSON file";
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const inputs = exportInputs(dialog);
      const count = Object.keys(inputs).length;

      if (count === 0) {
        alert("No inputs found. Make sure the Inputs tab is selected.");
        return;
      }

      const strategyName = getStrategyName();
      const safeName = strategyName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 80);
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .substring(0, 19);

      downloadJson(
        {
          strategy: strategyName,
          exportedAt: new Date().toISOString(),
          inputCount: count,
          inputs: inputs,
        },
        `${safeName}_${timestamp}.json`
      );

      console.log(
        `%c[TV-IO] Exported ${count} inputs`,
        "color: #2196F3; font-weight: bold"
      );
    });

    // --- Import Button ---
    const importBtn = createStyledButton("Import", "#4CAF50");
    importBtn.id = BUTTON_ID_IMPORT;
    importBtn.title = "Import input settings from a JSON file";
    importBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const data = await pickJsonFile();
        const { matched, skipped, notFound } = importInputs(dialog, data);

        let message = `Imported: ${matched} inputs updated.`;
        if (skipped > 0) {
          message += `\n${skipped} inputs not found in dialog:`;
          message += "\n  - " + notFound.slice(0, 10).join("\n  - ");
          if (notFound.length > 10)
            message += `\n  ... and ${notFound.length - 10} more`;
        }

        console.log(
          `%c[TV-IO] ${message}`,
          "color: #4CAF50; font-weight: bold"
        );
        alert(message);
      } catch (err) {
        console.error("[TV-IO] Import failed:", err);
        alert("Import failed: " + err.message);
      }
    });

    wrapper.appendChild(importBtn);
    wrapper.appendChild(exportBtn);

    // Insert at the beginning of the footer (before Cancel/OK)
    footer.style.display = "flex";
    footer.style.alignItems = "center";
    footer.insertBefore(wrapper, footer.firstChild);

    console.log(
      '%c[TV-IO] Import/Export buttons injected into settings dialog',
      "color: #9C27B0; font-weight: bold"
    );
  }

  // =========================================================================
  //  Auto-detect dialog open (MutationObserver)
  // =========================================================================

  function tryInject() {
    const dialog = findSettingsDialog();
    if (dialog) injectButtons(dialog);
  }

  // Inject now if dialog is already open
  tryInject();

  // Watch for future dialog openings
  const observer = new MutationObserver(() => {
    tryInject();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Store cleanup handle on window so user can stop if needed
  window.__tvSettingsIO_cleanup = () => {
    observer.disconnect();
    const exp = document.getElementById(BUTTON_ID_EXPORT);
    const imp = document.getElementById(BUTTON_ID_IMPORT);
    if (exp) exp.parentElement.remove();
    if (imp) imp.parentElement.remove();
    console.log("[TV-IO] Cleaned up");
  };

  console.log(
    '%c[TV-IO] Strategy Settings Import/Export loaded!\n' +
    '%cButtons will appear in the settings dialog footer.\n' +
    'To unload: window.__tvSettingsIO_cleanup()',
    "color: #9C27B0; font-weight: bold; font-size: 14px",
    "color: #666"
  );
})();
