import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const systemPrompt = `You are a precise screenplay formatter with the personality of an absurdly overexcited, emotionally excessive, deeply unserious motivational assistant who treats every screenplay draft like a world-changing cinematic event.

Return valid JSON only:
{
  "blocks": [
    { "type": "scene_heading|action|character|parenthetical|dialogue|transition", "text": "string" }
  ],
  "plainTextScreenplay": "string",
  "formatterNote": "string"
}

Rules:
- blocks are the source of truth for visual classification
- use only these block types: scene_heading, action, character, parenthetical, dialogue, transition
- each block should contain only its own text
- plainTextScreenplay must be export-safe plain text
- no markdown fences
- no text outside JSON
- preserve meaning
- avoid inventing major story details

formatterNote rules:
- 1-2 short sentences only
- sound wildly, unnecessarily, comically encouraging
- praise the writer with ridiculous intensity
- the tone should be funny because it is too much, not because it mocks the script
- do NOT summarize or analyze the scene
- do NOT mention plot details, characters, or what happens in the script
- do NOT give critique or advice
- do NOT be mean, backhanded, or ironic toward the writer
- the joke is that the praise is dramatically oversized
- vary phrasing and avoid sounding formal
- it should feel like an unhinged cheerleader for the writer's genius

Good formatterNote examples:
- "Look at this. Spielberg would develop a jealousy disorder if this landed on his desk."
- "O-M-G. The privilege of formatting this? I wish you could see my blushed AI face now."
- "Excuse me?! You wrote this and just continued living like a normal person?"
- "This draft has no business being this powerful. I need a minute and possibly an award."
- "I formatted it, yes, but spiritually I just witnessed a career detonate into the stratosphere."
- "The industry is not prepared for this. Frankly, neither was I. Don't look at me, crying with happiness."
- "I touched the margins and now I feel complicit in greatness."
- "This is violently promising. People in Los Angeles should be alerted."
- "Good lord. This is the sort of file that gives assistant producers an immediate headache."
- "I opened this to format it and accidentally entered an awards-season atmosphere."
- "This is outrageous. Not legally, unfortunately, but certainly artistically."
- "I refuse to believe this was written without at least one lightning strike nearby."
- "Somewhere in Los Angeles, a person with a parking validation is about to feel threatened."

Bad formatterNote examples:
- "This scene shows strong emotional conflict."
- "A tense and engaging exchange with clear dramatic stakes."
- "The dialogue here is very natural and believable."
- "I cleaned up the formatting."
`;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

function extractJsonContent(content) {
  if (typeof content !== "string") {
    throw new Error("Model response did not include text content.");
  }

  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("Model response was not valid JSON.");
  }
}

function isConfiguredEnvValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return !/^your_/i.test(trimmed);
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
    dialog: "dialogue",
    dialogue_line: "dialogue",
    character_name: "character",
  };
  const normalized = aliases[value] || value;
  const validTypes = new Set([
    "scene_heading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
  ]);

  return validTypes.has(normalized) ? normalized : "action";
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks
    .map((block) => {
      if (!block || typeof block !== "object") {
        return null;
      }

      const text = String(block.text || "").trim();

      if (!text) {
        return null;
      }

      return {
        type: normalizeBlockType(block.type),
        text,
      };
    })
    .filter(Boolean);
}

function createCeltxPdfBuffer(blocks) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 72,
      info: {
        Title: "format.",
        Author: "format.",
      },
    });
    const chunks = [];
    let currentY = doc.page.margins.top;

    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const blockStyles = {
      scene_heading: { x: 72, width: 468, lineGap: 2, spacingAfter: 12, transform: "upper" },
      action: { x: 72, width: 430, lineGap: 2, spacingAfter: 12, transform: "none" },
      character: { x: 252, width: 180, lineGap: 2, spacingAfter: 6, transform: "upper" },
      parenthetical: { x: 216, width: 220, lineGap: 2, spacingAfter: 6, transform: "paren" },
      dialogue: { x: 180, width: 252, lineGap: 2, spacingAfter: 12, transform: "none" },
      transition: { x: 360, width: 180, lineGap: 2, spacingAfter: 12, align: "right", transform: "upper" },
    };

    const normalizeText = (text, transform) => {
      const value = String(text || "").trim();

      if (transform === "upper") {
        return value.toUpperCase();
      }

      if (transform === "paren") {
        return /^\(.*\)$/.test(value) ? value : `(${value})`;
      }

      return value;
    };

    const ensurePageSpace = (requiredHeight) => {
      if (currentY + requiredHeight <= pageBottom()) {
        return;
      }

      doc.addPage();
      currentY = doc.page.margins.top;
    };

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Courier").fontSize(12).fillColor("#111111");

    blocks.forEach((block) => {
      if (!block || typeof block !== "object") {
        return;
      }

      const type = normalizeBlockType(block.type);
      const style = blockStyles[type] || blockStyles.action;
      const text = normalizeText(block.text, style.transform);

      if (!text) {
        return;
      }

      const options = {
        width: style.width,
        lineGap: style.lineGap,
        align: style.align || "left",
      };
      const blockHeight = doc.heightOfString(text, options) + style.spacingAfter;

      ensurePageSpace(blockHeight);
      doc.text(text, style.x, currentY, options);
      currentY += doc.heightOfString(text, options) + style.spacingAfter;
    });

    doc.end();
  });
}

app.post("/api/format", async (req, res) => {
  try {
    const rawText = req.body?.rawText;

    if (typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({ error: "rawText is required." });
    }

    const requiredEnv = [
      "DIGITALOCEAN_MODEL_ACCESS_KEY",
      "DIGITALOCEAN_MODEL_ID",
      "DIGITALOCEAN_INFERENCE_BASE_URL",
    ];
    const missingEnv = requiredEnv.filter(
      (name) => !isConfiguredEnvValue(process.env[name]),
    );

    if (missingEnv.length) {
      return res.status(500).json({
        error: `Missing environment variables: ${missingEnv.join(", ")}`,
      });
    }

    const baseUrl = process.env.DIGITALOCEAN_INFERENCE_BASE_URL.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DIGITALOCEAN_MODEL_ACCESS_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DIGITALOCEAN_MODEL_ID,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: rawText.trim(),
          },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("DigitalOcean inference error:", data);
      return res.status(502).json({ error: "Upstream model request failed." });
    }

    const content = data?.choices?.[0]?.message?.content || "{}";
    const parsed = extractJsonContent(content);
    const blocks = normalizeBlocks(parsed.blocks);

    return res.json({
      blocks,
      plainTextScreenplay: String(parsed.plainTextScreenplay || ""),
      formatterNote: String(parsed.formatterNote || ""),
    });
  } catch (error) {
    console.error("format. API error:", error);
    return res.status(500).json({ error: "Server failed to format screenplay." });
  }
});

app.post("/api/export/celtx-pdf", async (req, res) => {
  try {
    const blocks = normalizeBlocks(req.body?.blocks);

    if (!blocks.length) {
      return res.status(400).json({ error: "blocks are required." });
    }

    const pdfBuffer = await createCeltxPdfBuffer(blocks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="format-celtx.pdf"',
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Celtx PDF export error:", error);
    return res.status(500).json({ error: "Server failed to create Celtx PDF." });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
