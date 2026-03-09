/**
 * TradingView Strategy Settings Import/Export (Console-paste version)
 *
 * Usage:
 *   1. Open strategy settings dialog on TradingView (gear icon or Ctrl+P)
 *   2. Make sure the "Inputs" tab is selected
 *   3. Open browser console (F12 > Console)
 *   4. Paste this entire script and press Enter
 *   5. Two new buttons appear: "Import" and "Export"
 *
 * Export uses internal property IDs (in_0, in_1, etc.) as keys — stable
 * across TradingView updates. The meta section maps IDs to display names.
 *
 * For auto-injection on page load, use the Tampermonkey version instead:
 * tv-settings-io.user.js
 */
(function tvSettingsIO() {
  "use strict";

  const SEL = {
    dialogContainer: '[class*="container-"]',
    dialogTitle: '[class*="ellipsis-"]',
    dialogFallback: '[role="dialog"]',
    minInputCount: 3,
    footerButtonTexts: ["ok", "cancel"],
    checkboxType: "checkbox",
    ariaChecked: "aria-checked",
    numericInputmode: "numeric",
    checkboxWrapper: '[class*="wrapper-"]',
  };

  const BUTTON_ID_EXPORT = "tv-settings-export-btn";
  const BUTTON_ID_IMPORT = "tv-settings-import-btn";

  function findSettingsDialog() {
    const containers = document.querySelectorAll(SEL.dialogContainer);
    for (const c of containers) {
      const title = c.querySelector(SEL.dialogTitle);
      if (title && c.querySelectorAll("input").length > SEL.minInputCount) return c;
    }
    const byRole = document.querySelector(SEL.dialogFallback);
    if (byRole && byRole.querySelectorAll("input").length > SEL.minInputCount) return byRole;
    return null;
  }

  function getStrategyName() {
    const el = document.querySelector(`${SEL.dialogContainer} ${SEL.dialogTitle}`);
    if (el) { const t = el.textContent.trim(); if (t.length > 0 && t.length < 300) return t; }
    return "strategy";
  }

  function findFooterBar(dialog) {
    for (const btn of dialog.querySelectorAll("button")) {
      if (SEL.footerButtonTexts.includes(btn.textContent.trim().toLowerCase()))
        return btn.parentElement;
    }
    return null;
  }

  // --- React Fiber ---

  function getReactFiberKey(el) {
    return Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
  }

  function getInputProperty(inputEl) {
    const fk = getReactFiberKey(inputEl);
    if (!fk) return null;
    let fiber = inputEl[fk];
    for (let i = 0; i < 40 && fiber; i++) {
      const p = fiber.memoizedProps;
      if (p) {
        const obj = p.property || p.definition || p.input;
        if (obj && typeof obj === "object" && obj.id) return obj;
      }
      fiber = fiber.return;
    }
    return null;
  }

  // --- Export ---

  function extractValue(inputEl) {
    if (inputEl.type === SEL.checkboxType) {
      const ac = inputEl.getAttribute(SEL.ariaChecked);
      if (ac !== null) return ac === "true";
      return inputEl.checked;
    }
    const val = inputEl.value;
    if (inputEl.getAttribute("inputmode") === SEL.numericInputmode || inputEl.type === "number")
      return val === "" ? null : Number(val);
    if (val !== "" && !isNaN(Number(val)) && val.trim() === val) return Number(val);
    return val;
  }

  function exportInputs(dialog) {
    const inputs = {}, meta = {};
    for (const el of dialog.querySelectorAll("input")) {
      const prop = getInputProperty(el);
      if (!prop) continue;
      inputs[prop.id] = extractValue(el);
      meta[prop.id] = { name: prop.name, group: prop.group || null, type: prop.type, defval: prop.defval };
    }
    return { inputs, meta };
  }

  // --- Import ---

  function setNativeValue(inputEl, value) {
    if (inputEl.type === SEL.checkboxType) {
      if (inputEl.checked !== Boolean(value)) {
        const w = inputEl.closest(SEL.checkboxWrapper) || inputEl.parentElement;
        w ? w.click() : inputEl.click();
      }
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inputEl), "value")?.set;
    setter ? setter.call(inputEl, String(value)) : (inputEl.value = String(value));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function importInputs(dialog, data) {
    const inputValues = data.inputs || data;
    const idMap = {};
    for (const el of dialog.querySelectorAll("input")) {
      const prop = getInputProperty(el);
      if (prop) idMap[prop.id] = el;
    }
    let matched = 0, skipped = 0;
    const notFound = [];
    for (const [id, value] of Object.entries(inputValues)) {
      const el = idMap[id];
      if (!el) { notFound.push(id); skipped++; continue; }
      setNativeValue(el, value);
      matched++;
    }
    return { matched, skipped, notFound };
  }

  // --- File I/O ---

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function pickJsonFile() {
    return new Promise((resolve, reject) => {
      const fi = Object.assign(document.createElement("input"), { type: "file", accept: ".json", style: "display:none" });
      document.body.appendChild(fi);
      fi.addEventListener("change", () => {
        const file = fi.files[0];
        if (!file) { document.body.removeChild(fi); reject(new Error("No file selected")); return; }
        const r = new FileReader();
        r.onload = () => { document.body.removeChild(fi); try { resolve(JSON.parse(r.result)); } catch(e) { reject(e); } };
        r.onerror = () => { document.body.removeChild(fi); reject(new Error("Read failed")); };
        r.readAsText(file);
      });
      fi.click();
    });
  }

  // --- Buttons ---

  function createStyledButton(text, color) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `padding:6px 16px;margin-right:8px;border:1px solid ${color};border-radius:4px;background:transparent;color:${color};font-size:13px;font-weight:500;cursor:pointer;transition:background .15s,color .15s;font-family:inherit;line-height:1.5`;
    btn.addEventListener("mouseenter", () => { btn.style.background = color; btn.style.color = "#fff"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; btn.style.color = color; });
    return btn;
  }

  function injectButtons(dialog) {
    if (dialog.querySelector(`#${BUTTON_ID_EXPORT}`)) return;
    const footer = findFooterBar(dialog);
    if (!footer) { console.warn("[TV-IO] Footer not found"); return; }

    const wrapper = Object.assign(document.createElement("div"), { style: "display:inline-flex;gap:8px;margin-right:auto" });

    const exportBtn = createStyledButton("Export", "#2196F3");
    exportBtn.id = BUTTON_ID_EXPORT;
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const { inputs, meta } = exportInputs(dialog);
      const count = Object.keys(inputs).length;
      if (!count) { alert("No inputs found. Select the Inputs tab."); return; }
      const name = getStrategyName();
      const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 80);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
      downloadJson({ strategy: name, exportedAt: new Date().toISOString(), inputCount: count, inputs, meta }, `${safe}_${ts}.json`);
      console.log(`%c[TV-IO] Exported ${count} inputs`, "color:#2196F3;font-weight:bold");
      console.table(Object.entries(inputs).map(([id, value]) => ({ id, name: meta[id]?.name, group: meta[id]?.group, value })));
    });

    const importBtn = createStyledButton("Import", "#4CAF50");
    importBtn.id = BUTTON_ID_IMPORT;
    importBtn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        const data = await pickJsonFile();
        const { matched, skipped, notFound } = importInputs(dialog, data);
        let msg = `Imported: ${matched} inputs updated.`;
        if (skipped) { msg += `\n${skipped} not found: ${notFound.slice(0, 10).join(", ")}`; }
        console.log(`%c[TV-IO] ${msg}`, "color:#4CAF50;font-weight:bold");
        alert(msg);
      } catch(err) { alert("Import failed: " + err.message); }
    });

    wrapper.append(importBtn, exportBtn);
    footer.style.display = "flex"; footer.style.alignItems = "center";
    footer.insertBefore(wrapper, footer.firstChild);
    console.log("%c[TV-IO] Buttons injected", "color:#9C27B0;font-weight:bold");
  }

  // --- Auto-detect ---

  function tryInject() { const d = findSettingsDialog(); if (d) injectButtons(d); }
  tryInject();
  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });

  window.__tvSettingsIO_cleanup = () => {
    observer.disconnect();
    document.getElementById(BUTTON_ID_EXPORT)?.parentElement?.remove();
    console.log("[TV-IO] Cleaned up");
  };

  console.log("%c[TV-IO] Strategy Settings Import/Export loaded!", "color:#9C27B0;font-weight:bold;font-size:14px");
})();
