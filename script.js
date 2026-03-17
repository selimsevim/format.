const rawInput = document.querySelector("#raw-input");
const inputPanel = document.querySelector(".panel-input");
const formatterNote = document.querySelector("#formatter-note");
const formatterNoteText = document.querySelector("#formatter-note-text");
const outputPanel = document.querySelector("#output-panel");
const copyButton = document.querySelector("#copy-button");
const toast = document.querySelector("#toast");
const formatButtons = [...document.querySelectorAll("[data-format-trigger]")];

const previewMarkup = outputPanel.innerHTML;
let latestOutput = "";
let lastFormattedSource = "";
let toastTimer = 0;
let copyPulseTimer = 0;

const sceneHeadingPattern =
  /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|INT -|EXT -|INTERIOR|EXTERIOR)/i;
const transitionPattern = /^(FADE OUT|FADE IN|CUT TO:|DISSOLVE TO:|SMASH CUT TO:)/i;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
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
  const cleaned = line.trim().replace(/^\(+/, "").replace(/\)+$/, "");
  return `(${cleaned})`;
}

function isCharacterName(line) {
  const trimmed = line.trim();

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

function classifyLine(line, inDialogueBlock) {
  const trimmed = line.trim();

  if (!trimmed) {
    return { type: "spacer", text: "" };
  }

  if (sceneHeadingPattern.test(trimmed)) {
    return { type: "scene", text: trimmed.toUpperCase() };
  }

  if (transitionPattern.test(trimmed)) {
    return { type: "scene", text: trimmed.toUpperCase() };
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

function renderScreenplayHtml(text) {
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

    if (block.type === "scene" || block.type === "action") {
      inDialogueBlock = false;
    }
  });

  const html = blocks
    .map((block) => {
      if (block.type === "spacer") {
        return '<p class="screenplay-line screenplay-line--spacer" aria-hidden="true"></p>';
      }

      return `<p class="screenplay-line screenplay-line--${block.type}">${escapeHtml(block.text)}</p>`;
    })
    .join("");

  return `<div class="screenplay">${html}</div>`;
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

function pulseCopyButton() {
  copyButton.classList.remove("is-attention");
  window.clearTimeout(copyPulseTimer);
  void copyButton.offsetWidth;
  copyButton.classList.add("is-attention");
  copyPulseTimer = window.setTimeout(() => {
    copyButton.classList.remove("is-attention");
  }, 1900);
}

function renderPreview() {
  latestOutput = "";
  lastFormattedSource = "";
  renderFormatterNote("");
  outputPanel.className = "output-panel is-empty";
  outputPanel.innerHTML = previewMarkup;
  copyButton.disabled = true;
  copyButton.classList.remove("is-attention");
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

    latestOutput = String(data.formattedScript || "");
    lastFormattedSource = source;
    renderFormatterNote(String(data.formatterNote || ""));
    outputPanel.className = "output-panel";
    outputPanel.innerHTML = renderScreenplayHtml(latestOutput);
    copyButton.disabled = !latestOutput;
    pulseCopyButton();
  } catch (error) {
    console.error(error);
    latestOutput = "";
    lastFormattedSource = "";
    renderFormatterNote("The formatter lost its composure. Try again.");
    outputPanel.className = "output-panel";
    outputPanel.innerHTML =
      '<div class="screenplay"><p class="screenplay-line screenplay-line--action">Formatting failed.</p></div>';
    copyButton.disabled = true;
    copyButton.classList.remove("is-attention");
  } finally {
    setLoadingState(false);
  }
}

async function copyFormattedOutput() {
  if (!latestOutput) {
    return;
  }

  try {
    await navigator.clipboard.writeText(latestOutput);
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1800);
  } catch (error) {
    console.error("Clipboard write failed:", error);
  }
}

formatButtons.forEach((button) => {
  button.addEventListener("click", renderFormattedOutput);
});

copyButton.addEventListener("click", copyFormattedOutput);

rawInput.addEventListener("input", () => {
  const source = rawInput.value.trim();

  if (!source) {
    renderPreview();
  } else {
    copyButton.disabled = source !== lastFormattedSource || !latestOutput;
    copyButton.classList.remove("is-attention");

    if (lastFormattedSource && source !== lastFormattedSource) {
      outputPanel.classList.add("is-stale");
    } else {
      outputPanel.classList.remove("is-stale");
    }
  }

  refreshButtonState();
  syncInputState();
});

refreshButtonState();
syncInputState();
