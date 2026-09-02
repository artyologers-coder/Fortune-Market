import { ScrapedProduct } from "./url-scraper";

interface AiConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
}

function getConfig(): AiConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.AI_SCRAPER_MODEL || "gpt-4o-mini",
    };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model: process.env.AI_SCRAPER_MODEL || "claude-3-haiku-20240307",
    };
  }
  return null;
}

const EXTRACTION_PROMPT = `You are a product data extraction expert. Analyze the webpage content below and extract the product information as JSON.

Rules:
- Extract ONLY what is clearly present in the content. Do NOT invent or hallucinate data.
- For "name": Find the actual product name. It is typically in headings (h1/h2), title tags, or meta tags. Reject generic site names, navigation text, or breadcrumbs.
- For "description": Extract the product description. Look for meta descriptions, OG descriptions, or visible product description text. Do NOT include marketing fluff, shipping info, or reviews.
- For "price": Extract the current price as a number only (no currency symbol). If multiple prices exist, choose the sale/current price over the original price.
- For "originalPrice": If a strikethrough/list price exists that is higher than the current price, extract it as a number.
- For "images": Extract up to 5 product image URLs. Prefer full-size images over thumbnails. Look for og:image, JSON-LD images, or product gallery images.
- For "availability": Determine if the product is "in_stock", "out_of_stock", or "unknown".
- For "siteName": Extract the site/business name.
- For "sku": Extract the product SKU or model number if visible.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{"name":"...","description":"...","price":null,"originalPrice":null,"images":[],"availability":"unknown","siteName":"","sku":""}

Page content:
`;

function buildPrompt(content: string): string {
  const truncated = content.slice(0, 15000);
  return EXTRACTION_PROMPT + truncated;
}

async function callOpenAI(config: AiConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "You are a product data extraction engine. Output only valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}

async function callAnthropic(config: AiConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1000,
      system: "You are a product data extraction engine. Output only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : text;
}

interface AiExtracted extends Partial<ScrapedProduct> {
  sku?: string;
}

function parseResponse(raw: string): AiExtracted | null {
  try {
    const cleaned = raw.trim();
    const parsed = JSON.parse(cleaned);

    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      price: typeof parsed.price === "number" && !isNaN(parsed.price) ? parsed.price : null,
      originalPrice: typeof parsed.originalPrice === "number" && !isNaN(parsed.originalPrice) ? parsed.originalPrice : null,
      images: Array.isArray(parsed.images) ? parsed.images.filter((i: unknown) => typeof i === "string") : [],
      availability: ["in_stock", "out_of_stock", "unknown"].includes(parsed.availability) ? parsed.availability : "unknown",
      siteName: typeof parsed.siteName === "string" ? parsed.siteName : "",
      sku: typeof parsed.sku === "string" ? parsed.sku : undefined,
    };
  } catch {
    return null;
  }
}

export async function extractWithAI(content: string): Promise<AiExtracted | null> {
  const config = getConfig();
  if (!config) return null;

  const prompt = buildPrompt(content);

  try {
    const raw =
      config.provider === "anthropic"
        ? await callAnthropic(config, prompt)
        : await callOpenAI(config, prompt);

    const result = parseResponse(raw);
    if (!result) {
      console.warn("AI scraper: failed to parse response");
      return null;
    }

    return result;
  } catch (error) {
    console.error("AI scraper error:", error);
    return null;
  }
}
