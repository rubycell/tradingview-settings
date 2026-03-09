// ==UserScript==
// @name         TradingView Settings IO
// @namespace    https://github.com/tradingview-settings
// @version      2.2.0
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
  //  React Fiber — extract internal property metadata from input elements
  //
  //  TradingView stores each input's metadata (id, name, group, type, defval)
  //  in the React fiber tree at memoizedProps.property.
  //  We walk up from each <input> DOM element to find this property object.
  // =========================================================================

  function getReactFiberKey(element) {
    return Object.keys(element).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
  }

  function getInputProperty(inputEl) {
    const fiberKey = getReactFiberKey(inputEl);
    if (!fiberKey) return null;

    let fiber = inputEl[fiberKey];
    for (let i = 0; i < 40 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p) {
        const propObj = p.property || p.definition || p.input;
        if (propObj && typeof propObj === "object" && propObj.id) {
          return propObj;
        }
      }
      fiber = fiber.return;
    }
    return null;
  }

  // =========================================================================
  //  Dropdown (custom <button> selects) — extract id, value, onChange
  //
  //  TradingView renders input.string(..., options=[...]) as custom button
  //  dropdowns, NOT as <input> or <select> elements. The React fiber stores:
  //    - memoizedProps.id  (e.g. "in_2")     at shallow depth
  //    - memoizedProps.value / .onChange       at deeper depth
  // =========================================================================

  function getDropdownInfo(buttonEl) {
    const fiberKey = getReactFiberKey(buttonEl);
    if (!fiberKey) return null;

    let id = null;
    let value = null;

    let fiber = buttonEl[fiberKey];
    for (let i = 0; i < 15 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p) {
        if (!id && typeof p.id === "string" && /^in_\d+$/.test(p.id)) {
          id = p.id;
        }
        if (value === null && p.value !== undefined && typeof p.onChange === "function") {
          value = p.value;
        }
      }
      fiber = fiber.return;
    }

    return id && value !== null ? { id, value } : null;
  }

  function setDropdownValue(buttonEl, newValue) {
    const fiberKey = getReactFiberKey(buttonEl);
    if (!fiberKey) return false;

    let fiber = buttonEl[fiberKey];
    for (let i = 0; i < 15 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p && typeof p.onChange === "function" && p.value !== undefined) {
        p.onChange(newValue);
        return true;
      }
      fiber = fiber.return;
    }
    return false;
  }

  // =========================================================================
  //  DateTime (custom date+time picker) — metadata in memoizedProps.input
  //
  //  TradingView renders input.time() as a containerDateTimeInput <div>,
  //  NOT as a native <input>. The React fiber stores:
  //    - memoizedProps.input  (with .id, .name, .type, .group)
  //    - memoizedProps.value  (numeric timestamp)
  //    - memoizedProps.onChange
  // =========================================================================

  function getDateTimeInfo(containerEl) {
    const fiberKey = getReactFiberKey(containerEl);
    if (!fiberKey) return null;

    let inputMeta = null;
    let value = null;

    let fiber = containerEl[fiberKey];
    for (let i = 0; i < 10 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p) {
        if (!inputMeta && p.input && p.input.id && p.input.type === "time") {
          inputMeta = p.input;
        }
        if (value === null && p.value !== undefined && typeof p.onChange === "function") {
          value = p.value;
        }
      }
      fiber = fiber.return;
    }

    return inputMeta && value !== null
      ? { id: inputMeta.id, value, name: inputMeta.name, group: inputMeta.group, defval: inputMeta.defval }
      : null;
  }

  function setDateTimeValue(containerEl, newValue) {
    const fiberKey = getReactFiberKey(containerEl);
    if (!fiberKey) return false;

    let fiber = containerEl[fiberKey];
    for (let i = 0; i < 10 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p && typeof p.onChange === "function" && p.value !== undefined) {
        p.onChange(newValue);
        return true;
      }
      fiber = fiber.return;
    }
    return false;
  }

  // =========================================================================
  //  EXPORT — uses property.id as key
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
    const inputs = {};
    const meta = {};

    // Pass 1: <input> elements (text fields, checkboxes)
    for (const inputEl of dialog.querySelectorAll("input")) {
      const property = getInputProperty(inputEl);
      if (!property) continue;

      const key = property.id;
      inputs[key] = extractValue(inputEl);
      meta[key] = {
        name: property.name,
        group: property.group || null,
        type: property.type,
        defval: property.defval,
      };
    }

    // Pass 2: dropdown <button> elements (input.string with options)
    const seenIds = new Set(Object.keys(inputs));
    for (const btn of dialog.querySelectorAll("button")) {
      const dropdown = getDropdownInfo(btn);
      if (!dropdown || seenIds.has(dropdown.id)) continue;
      seenIds.add(dropdown.id);

      inputs[dropdown.id] = dropdown.value;
      meta[dropdown.id] = {
        name: null,
        group: null,
        type: "string_options",
        defval: null,
      };
    }

    // Pass 3: datetime picker elements (input.time)
    for (const el of dialog.querySelectorAll('[class*="containerDateTimeInput"]')) {
      const dt = getDateTimeInfo(el);
      if (!dt || seenIds.has(dt.id)) continue;
      seenIds.add(dt.id);

      inputs[dt.id] = dt.value;
      meta[dt.id] = {
        name: dt.name,
        group: dt.group || null,
        type: "time",
        defval: dt.defval,
      };
    }

    return { inputs, meta };
  }

  // =========================================================================
  //  IMPORT — matches by property.id
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

  function buildIdToElementMap(dialog) {
    const idMap = {};

    // Pass 1: <input> elements
    for (const inputEl of dialog.querySelectorAll("input")) {
      const property = getInputProperty(inputEl);
      if (!property) continue;
      idMap[property.id] = { el: inputEl, kind: "input" };
    }

    // Pass 2: dropdown <button> elements
    for (const btn of dialog.querySelectorAll("button")) {
      const dropdown = getDropdownInfo(btn);
      if (!dropdown || idMap[dropdown.id]) continue;
      idMap[dropdown.id] = { el: btn, kind: "dropdown" };
    }

    // Pass 3: datetime picker elements
    for (const el of dialog.querySelectorAll('[class*="containerDateTimeInput"]')) {
      const dt = getDateTimeInfo(el);
      if (!dt || idMap[dt.id]) continue;
      idMap[dt.id] = { el, kind: "datetime" };
    }

    return idMap;
  }

  function importInputs(dialog, data) {
    const inputValues = data.inputs || data;
    const idMap = buildIdToElementMap(dialog);

    let matched = 0;
    let skipped = 0;
    const notFound = [];

    for (const [id, value] of Object.entries(inputValues)) {
      const entry = idMap[id];
      if (!entry) {
        notFound.push(id);
        skipped++;
        continue;
      }

      if (entry.kind === "dropdown") {
        setDropdownValue(entry.el, value);
      } else if (entry.kind === "datetime") {
        setDateTimeValue(entry.el, value);
      } else {
        setNativeValue(entry.el, value);
      }
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

      const { inputs, meta } = exportInputs(dialog);
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
          meta: meta,
        },
        `${safeName}_${timestamp}.json`
      );

      console.log(
        `%c[TV-IO] Exported ${count} inputs`,
        "color: #2196F3; font-weight: bold"
      );
      console.table(
        Object.entries(inputs).map(([id, value]) => ({
          id,
          name: meta[id]?.name,
          group: meta[id]?.group,
          value,
        }))
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
