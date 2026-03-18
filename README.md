# format.

`format.` is a screenplay formatting tool for turning rough, messy script text into clean, readable screenplay structure.

Paste unformatted text into the left panel, run the formatter, and get:

- a polished screenplay preview
- a short formatter note
- a `Copy` action optimized for Word via HTML clipboard
- a `Download` action that exports a PDF for Celtx import

## What It Is

This project is a dark, minimal screenplay-cleanup interface backed by a small Node/Express server. The frontend keeps the writing experience focused and cinematic, while the backend sends raw text to a model endpoint, receives structured screenplay blocks, and returns formatted output for preview and export.

The app is designed to separate:

- preview styling inside the UI
- export-safe plain text for copy workflows
- PDF export for Celtx import workflows

## Built For

This project was created for the [DigitalOcean Gradient AI Hackathon](https://digitalocean.devpost.com/), hosted on Devpost.

The official hackathon page describes it as:
"Build smarter. Ship faster. Power the next wave of AI."

## Features

- Two-panel screenplay formatting UI
- AI-powered screenplay cleanup through a backend formatting API
- Structured output blocks for reliable in-app styling
- Formatter note display separate from the screenplay output
- Word-friendly copy using HTML clipboard data
- PDF export for Celtx import
- Responsive layout for desktop and mobile

## Stack

- HTML
- CSS
- Vanilla JavaScript
- Node.js
- Express
- PDFKit
- DigitalOcean Gradient AI inference API

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with your DigitalOcean Gradient AI credentials:

```env
DIGITALOCEAN_MODEL_ACCESS_KEY=your_key_here
DIGITALOCEAN_MODEL_ID=your_model_here
DIGITALOCEAN_INFERENCE_BASE_URL=your_gradient_base_url_here
PORT=3000
```

3. Start the app:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## API

### `POST /api/format`

Accepts:

```json
{
  "rawText": "messy screenplay text"
}
```

Returns:

```json
{
  "blocks": [
    { "type": "scene_heading", "text": "INT. APARTMENT - NIGHT" },
    { "type": "action", "text": "Moonlight spills over a cluttered desk." }
  ],
  "plainTextScreenplay": "INT. APARTMENT - NIGHT\n\nMoonlight spills over a cluttered desk.",
  "formatterNote": "I gave it structure. You're welcome, cinema."
}
```

### `POST /api/export/celtx-pdf`

Accepts structured screenplay blocks and returns a PDF download intended for Celtx import.

## License

This project is open source under the MIT License. See [LICENSE](./LICENSE).
