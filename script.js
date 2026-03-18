const rawInput = document.querySelector("#raw-input");
const inputPanel = document.querySelector(".panel-input");
const formatterNote = document.querySelector("#formatter-note");
const formatterNoteText = document.querySelector("#formatter-note-text");
const outputPanel = document.querySelector("#output-panel");
const copyButton = document.querySelector("#copy-button");
const downloadCeltxButton = document.querySelector("#download-celtx-button");
const toast = document.querySelector("#toast");
const formatButtons = [...document.querySelectorAll("[data-format-trigger]")];

const previewMarkup = outputPanel.innerHTML;
const emptyExportState = {
  blocks: [],
  plainTextScreenplay: "",
};

let exportState = { ...emptyExportState };
let lastFormattedSource = "";
let toastTimer = 0;
let copyPulseTimer = 0;

const sceneHeadingPattern =
  /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|INT -|EXT -|INTERIOR|EXTERIOR)/i;
const transitionPattern = /^(FADE OUT|FADE IN|CUT TO:|DISSOLVE TO:|SMASH CUT TO:)/i;
const validBlockTypes = new Set([
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

function normalizeParenthetical(line) {
  const cleaned = String(line).trim().replace(/^\(+/, "").replace(/\)+$/, "");
  return `(${cleaned})`;
}

function isCharacterName(line) {
  const trimmed = String(line).trim();

  if (!trimmed || trimmed.length > 32) {
    return false;
  }

  if (sceneHeadingPattern.test(trimmed) || transitionPattern.test(trimmed)) {
    return false;
  }

  if (/[a-z]/.test(trimmed)) {
    return false;
  }

  return /[A-Z]/.test(trimmed);
}

function normalizeBlockType(type) {
  const value = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases = {
    scene: "scene_heading",
    slugline: "scene_heading",
    sceneheader: "scene_heading",
    scene_heading: "scene_heading",
    character_name: "character",
    dialogue_line: "dialogue",
    dialog: "dialogue",
  };

  const normalized = aliases[value] || value;
  return validBlockTypes.has(normalized) ? normalized : "action";
}

function getVisualType(type) {
  const normalized = normalizeBlockType(type);
  return normalized === "scene_heading" ? "scene" : normalized;
}

function classifyLine(line, inDialogueBlock) {
  const trimmed = String(line).trim();

  if (!trimmed) {
    return { type: "spacer", text: "" };
  }

  if (sceneHeadingPattern.test(trimmed)) {
    return { type: "scene_heading", text: trimmed.toUpperCase() };
  }

  if (transitionPattern.test(trimmed)) {
    return { type: "transition", text: trimmed.toUpperCase() };
  }

  if (/^\(.*\)$/.test(trimmed)) {
    return { type: "parenthetical", text: normalizeParenthetical(trimmed) };
  }

  if (isCharacterName(trimmed)) {
    return { type: "character", text: trimmed.toUpperCase() };
  }

  if (inDialogueBlock) {
    return { type: "dialogue", text: trimmed };
  }

  return { type: "action", text: trimmed };
}

function fallbackBlocksFromText(text) {
  const sourceLines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let inDialogueBlock = false;

  sourceLines.forEach((line) => {
    const block = classifyLine(line, inDialogueBlock);

    if (block.type === "spacer") {
      blocks.push(block);
      inDialogueBlock = false;
      return;
    }

    blocks.push(block);
    inDialogueBlock =
      block.type === "character" ||
      block.type === "parenthetical" ||
      block.type === "dialogue";

    if (
      block.type === "scene_heading" ||
      block.type === "action" ||
      block.type === "transition"
    ) {
      inDialogueBlock = false;
    }
  });

  return blocks;
}

function normalizeBlocks(blocks, fallbackText = "") {
  if (Array.isArray(blocks) && blocks.length) {
    return blocks
      .map((block) => {
        if (!block || typeof block !== "object") {
          return null;
        }

        const type = normalizeBlockType(block.type);
        const text = String(block.text || "").trim();

        if (!text) {
          return null;
        }

        return { type, text };
      })
      .filter(Boolean);
  }

  return fallbackBlocksFromText(fallbackText)
    .filter((block) => block.type !== "spacer")
    .map((block) => ({
      type: normalizeBlockType(block.type),
      text: block.text,
    }));
}

function renderScreenplayBlocksHtml(blocks) {
  const items = Array.isArray(blocks) ? blocks : [];
  const html = items
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }

      const visualType = getVisualType(block.type);
      return `<p class="screenplay-line screenplay-line--${visualType}">${escapeHtml(block.text)}</p>`;
    })
    .join("");

  return `<div class="screenplay">${html}</div>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function setLoadingState(isLoading) {
  formatButtons.forEach((button) => {
    button.disabled = isLoading || !rawInput.value.trim();
    button.classList.toggle("is-loading", isLoading);
  });

  rawInput.disabled = isLoading;
  outputPanel.classList.toggle("is-loading", isLoading);
}

function refreshButtonState() {
  const hasInput = Boolean(rawInput.value.trim());
  formatButtons.forEach((button) => {
    button.disabled = !hasInput;
  });
}

function syncInputState() {
  inputPanel.classList.toggle("has-content", Boolean(rawInput.value.trim()));
}

function renderFormatterNote(note) {
  const hasNote = Boolean(note && note.trim());
  formatterNote.hidden = !hasNote;
  formatterNoteText.textContent = hasNote ? note : "";
}

function syncExportControls() {
  const hasPlainText = Boolean(exportState.plainTextScreenplay);
  const hasBlocks = Array.isArray(exportState.blocks) && exportState.blocks.length > 0;
  copyButton.disabled = !(hasBlocks && hasPlainText);
  downloadCeltxButton.disabled = !hasBlocks;
}

function pulseCopyButton() {
  copyButton.classList.remove("is-attention");
  window.clearTimeout(copyPulseTimer);
  void copyButton.offsetWidth;
  copyButton.classList.add("is-attention");
  copyPulseTimer = window.setTimeout(() => {
    copyButton.classList.remove("is-attention");
  }, 1900);
}

function resetExportState() {
  exportState = { ...emptyExportState };
  syncExportControls();
}

function renderPreview() {
  lastFormattedSource = "";
  renderFormatterNote("");
  resetExportState();
  outputPanel.className = "output-panel is-empty";
  outputPanel.innerHTML = previewMarkup;
  copyButton.classList.remove("is-attention");
}

function buildWordHtml(blocks) {
  const paragraphStyles = {
    scene_heading:
      "margin:0 0 12pt 0;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;",
    action: "margin:0 0 12pt 0;",
    character:
      "margin:24pt 0 6pt 2.2in;width:2.1in;text-transform:uppercase;letter-spacing:0.12em;",
    parenthetical: "margin:0 0 6pt 1.9in;width:2.5in;font-style:italic;",
    dialogue: "margin:0 0 12pt 1.45in;width:3.5in;",
    transition:
      "margin:0 0 12pt auto;width:2.1in;text-align:right;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;",
  };

  const paragraphs = (Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }

      const type = normalizeBlockType(block.type);
      const style = paragraphStyles[type] || paragraphStyles.action;
      return `<p style="${style}">${escapeHtml(block.text)}</p>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Screenplay Export</title>
  </head>
  <body>
    <div style="font-family:'Courier New', Courier, monospace;font-size:12pt;line-height:1.5;color:#111;width:6.5in;margin:0 auto;">
      ${paragraphs}
    </div>
  </body>
</html>`;
}

async function renderFormattedOutput() {
  const source = rawInput.value.trim();

  if (!source) {
    renderPreview();
    refreshButtonState();
    return;
  }

  setLoadingState(true);
  renderFormatterNote("");
  resetExportState();
  copyButton.classList.remove("is-attention");
  outputPanel.classList.remove("is-stale");

  try {
    const response = await fetch("/api/format", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rawText: source }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Formatting failed.");
    }

    const plainTextScreenplay = String(data.plainTextScreenplay || "");
    const blocks = normalizeBlocks(data.blocks, plainTextScreenplay);
    exportState = {
      blocks,
      plainTextScreenplay,
    };
    lastFormattedSource = source;
    renderFormatterNote(String(data.formatterNote || ""));
    outputPanel.className = "output-panel";
    outputPanel.innerHTML = renderScreenplayBlocksHtml(blocks);
    syncExportControls();
    pulseCopyButton();
  } catch (error) {
    console.error(error);
    lastFormattedSource = "";
    renderFormatterNote("The formatter lost its composure. Try again.");
    resetExportState();
    outputPanel.className = "output-panel";
    outputPanel.innerHTML =
      '<div class="screenplay"><p class="screenplay-line screenplay-line--action">Formatting failed.</p></div>';
    copyButton.classList.remove("is-attention");
  } finally {
    setLoadingState(false);
  }
}

async function copyForWord() {
  if (!exportState.blocks.length || !exportState.plainTextScreenplay) {
    return;
  }

  const html = buildWordHtml(exportState.blocks);

  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([exportState.plainTextScreenplay], {
          type: "text/plain",
        }),
      });

      await navigator.clipboard.write([item]);
      showToast("Copied for Word");
      return;
    }

    await navigator.clipboard.writeText(exportState.plainTextScreenplay);
    showToast("HTML clipboard unavailable, copied plain text");
  } catch (error) {
    console.error("Word copy failed:", error);
    showToast("Word copy failed");
  }
}

async function downloadCeltxPdf() {
  if (!exportState.blocks.length) {
    return;
  }

  try {
    const response = await fetch("/api/export/celtx-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blocks: exportState.blocks,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "PDF export failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "formatted-screenplay-celtx.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded PDF for Celtx");
  } catch (error) {
    console.error("Celtx PDF download failed:", error);
    showToast("Celtx PDF export failed");
  }
}

formatButtons.forEach((button) => {
  button.addEventListener("click", renderFormattedOutput);
});

copyButton.addEventListener("click", copyForWord);
downloadCeltxButton.addEventListener("click", downloadCeltxPdf);

rawInput.addEventListener("input", () => {
  const source = rawInput.value.trim();

  if (!source) {
    renderPreview();
  } else {
    const matchesCurrent = source === lastFormattedSource;
    copyButton.classList.remove("is-attention");

    if (matchesCurrent) {
      syncExportControls();
      outputPanel.classList.remove("is-stale");
    } else {
      resetExportState();
      outputPanel.classList.add("is-stale");
    }
  }

  refreshButtonState();
  syncInputState();
});

resetExportState();
refreshButtonState();
syncInputState();
