import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const systemPrompt = `You are Script Doctor, a precise screenplay formatter.
Return valid JSON only with this schema:
{
  "formattedScript": "string",
  "formatterNote": "string",
  "assumptions": ["string"]
}

Rules:
- formattedScript must be plain screenplay text only
- no markdown fences
- no commentary outside JSON
- formatterNote must be 1-3 short sentences
- formatterNote may be dry and mildly witty but never insulting
- preserve meaning
- avoid inventing major story details
- be conservative when context is unclear`;

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

    return res.json({
      formattedScript: String(parsed.formattedScript || ""),
      formatterNote: String(parsed.formatterNote || ""),
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.map(String)
        : [],
    });
  } catch (error) {
    console.error("Format API error:", error);
    return res.status(500).json({ error: "Server failed to format screenplay." });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
