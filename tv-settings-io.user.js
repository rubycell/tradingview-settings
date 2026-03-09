// ==UserScript==
// @name         TradingView Settings IO
// @namespace    https://github.com/tradingview-settings
// @version      1.0.0
// @description  Adds Import/Export buttons to TradingView strategy settings dialog
// @match        https://www.tradingview.com/chart/*
// @match        https://www.tradingview.com/*/chart/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function tvSettingsIO() {
  "use strict";

  // =========================================================================
  //  SELECTORS — Update these when TradingView changes their DOM
  //
  //  Run diagnose.js to find new values.
  //  Last updated: 2026-03-09
  // =========================================================================

  const SEL = {
    // Dialog detection: container that has a title and many inputs
    dialogContainer: '[class*="container-"]',
    dialogTitle: '[class*="ellipsis-"]',
    dialogFallback: '[role="dialog"]',
    minInputCount: 3,

    // Footer: we find buttons by their visible text, not class
    footerButtonTexts: ["ok", "cancel"],

    // Label detection (tried in order)
    checkboxLabel: '[class*="label-"]',
    inputTitle: '[class*="title_"]',
    inputLabel: '[class*="label_"]:not([class*="slider"])',
    inputTitleText: '[class*="titleText"]',
    maxLabelLength: 200,
    maxLabelDepth: 10,
    maxInputsPerRow: 3,

    // Input detection
    checkboxType: "checkbox",
    ariaChecked: "aria-checked",
    numericInputmode: "numeric",
    checkboxWrapper: '[class*="wrapper-"]',
  };

  // =========================================================================
  //  Dialog & Strategy Name Detection
  // =========================================================================

  function findSettingsDialog() {
    const containers = document.querySelectorAll(SEL.dialogContainer);
    for (const container of containers) {
      const titleEl = container.querySelector(SEL.dialogTitle);
      const hasInputs =
        container.querySelectorAll("input").length > SEL.minInputCount;
      if (titleEl && hasInputs) return container;
    }
    const byRole = document.querySelector(SEL.dialogFallback);
    if (byRole && byRole.querySelectorAll("input").length > SEL.minInputCount)
      return byRole;
    return null;
  }

  function getStrategyName() {
    const titleEl = document.querySelector(
      `${SEL.dialogContainer} ${SEL.dialogTitle}`
    );
    if (titleEl) {
      const text = titleEl.textContent.trim();
      if (text.length > 0 && text.length < 300) return text;
    }
    return "strategy";
  }

  // =========================================================================
  //  Find the footer button bar
  // =========================================================================

  function findFooterBar(dialog) {
    const buttons = dialog.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (SEL.footerButtonTexts.includes(text)) {
        return btn.parentElement;
      }
    }
    return null;
  }

  // =========================================================================
  //  Label <-> Input Mapping
  // =========================================================================

  function findLabelForInput(inputEl) {
    // For checkboxes: label is a sibling
    const parent = inputEl.parentElement;
    if (parent) {
      const labelSibling =
        parent.parentElement?.querySelector(SEL.checkboxLabel);
      if (labelSibling) {
        const text = labelSibling.textContent.trim();
        if (text) return text;
      }
    }

    // Walk up DOM looking for title/label element
    let ancestor = inputEl.parentElement;
    for (let depth = 0; depth < SEL.maxLabelDepth && ancestor; depth++) {
      const titleEl = ancestor.querySelector(
        `${SEL.inputTitle},${SEL.inputLabel},${SEL.inputTitleText}`
      );
      if (titleEl) {
        const text = titleEl.textContent.trim();
        if (text && text.length > 0 && text.length < SEL.maxLabelLength) {
          const inputsInAncestor = ancestor.querySelectorAll("input");
          if (inputsInAncestor.length <= SEL.maxInputsPerRow) return text;
        }
      }

      for (const child of ancestor.children) {
        if (child === inputEl || child.contains(inputEl)) continue;
        if (child.querySelector("input")) continue;
        const text = child.textContent.trim();
        if (
          text &&
          text.length > 0 &&
          text.length < 150 &&
          !text.includes("\n")
        ) {
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
  //  EXPORT
  // =========================================================================

  function extractValue(inputEl) {
    if (inputEl.type === SEL.checkboxType) {
      const ariaChecked = inputEl.getAttribute(SEL.ariaChecked);
      if (ariaChecked !== null) return ariaChecked === "true";
      return inputEl.checked;
    }
    const val = inputEl.value;
    if (
      inputEl.getAttribute("inputmode") === SEL.numericInputmode ||
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
  //  IMPORT
  // =========================================================================

  function setNativeValue(inputEl, value) {
    const proto =
      inputEl.type === SEL.checkboxType
        ? HTMLInputElement.prototype
        : Object.getPrototypeOf(inputEl);
    const nativeSetter =
      Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (inputEl.type === SEL.checkboxType) {
      const desiredChecked = Boolean(value);
      if (inputEl.checked !== desiredChecked) {
        const wrapper =
          inputEl.closest(SEL.checkboxWrapper) || inputEl.parentElement;
        wrapper ? wrapper.click() : inputEl.click();
      }
      return;
    }

    if (nativeSetter) {
      nativeSetter.call(inputEl, String(value));
    } else {
      inputEl.value = String(value);
    }

    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function buildLabelToInputMap(dialog) {
    const labelMap = {};
    const allInputs = dialog.querySelectorAll("input");

    for (const inputEl of allInputs) {
      const label = findLabelForInput(inputEl);
      if (!label) continue;

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
  //  File I/O
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

  const BUTTON_ID_EXPORT = "tv-settings-export-btn";
  const BUTTON_ID_IMPORT = "tv-settings-import-btn";

  function createStyledButton(text, color) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = [
      "padding: 6px 16px",
      "margin-right: 8px",
      `border: 1px solid ${color}`,
      "border-radius: 4px",
      "background: transparent",
      `color: ${color}`,
      "font-size: 13px",
      "font-weight: 500",
      "cursor: pointer",
      "transition: background 0.15s, color 0.15s",
      "font-family: inherit",
      "line-height: 1.5",
    ].join(";");
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
    if (dialog.querySelector(`#${BUTTON_ID_EXPORT}`)) return;

    const footer = findFooterBar(dialog);
    if (!footer) {
      console.warn("[TV-IO] Could not find footer button bar");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display: inline-flex; gap: 8px; margin-right: auto;";

    // --- Export ---
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

    // --- Import ---
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

    footer.style.display = "flex";
    footer.style.alignItems = "center";
    footer.insertBefore(wrapper, footer.firstChild);

    console.log(
      "%c[TV-IO] Import/Export buttons injected",
      "color: #9C27B0; font-weight: bold"
    );
  }

  // =========================================================================
  //  Auto-detect dialog (MutationObserver)
  // =========================================================================

  function tryInject() {
    const dialog = findSettingsDialog();
    if (dialog) injectButtons(dialog);
  }

  tryInject();

  const observer = new MutationObserver(() => {
    tryInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.__tvSettingsIO_cleanup = () => {
    observer.disconnect();
    const exp = document.getElementById(BUTTON_ID_EXPORT);
    const imp = document.getElementById(BUTTON_ID_IMPORT);
    if (exp) exp.parentElement.remove();
    if (imp) imp.parentElement.remove();
    console.log("[TV-IO] Cleaned up");
  };

  console.log(
    "%c[TV-IO] Strategy Settings Import/Export loaded!",
    "color: #9C27B0; font-weight: bold; font-size: 14px"
  );
})();
