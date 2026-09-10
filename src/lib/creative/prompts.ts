export interface ProductForPrompt {
  name: string;
  nameSi?: string;
  categoryName?: string;
  description?: string;
}

export interface PromptVariant {
  key: string;
  label: string;
  prompt: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  foods:
    "appetizing professional food photography, elegant table styling, fresh natural ingredients, premium food campaign",
  crafts:
    "artisan studio, natural materials, handcrafted atmosphere, warm premium lifestyle photography",
  naturals:
    "clean green wellness environment, botanical styling, organic natural materials, sophisticated spa atmosphere",
  fashion:
    "luxury editorial fashion photography, sophisticated styling, premium fashion campaign backdrop",
  electronics:
    "modern technology environment, controlled studio lighting, sleek premium presentation",
  beauty:
    "luxury cosmetic studio, spa environment, natural botanical styling, premium beauty campaign",
  health:
    "clean premium wellness environment, natural materials, sophisticated commercial photography",
  home:
    "elegant lifestyle environment, sophisticated interior, natural warm lighting",
  automotive:
    "professional automotive advertising photography, cinematic environment, dramatic but realistic lighting",
  general:
    "premium commercial studio photography, cinematic lighting, sophisticated art direction",
};

export function categoryArtDirection(categoryName?: string): string {
  if (!categoryName) return CATEGORY_STYLES.general;
  return CATEGORY_STYLES[categoryName.toLowerCase()] ?? CATEGORY_STYLES.general;
}

const VARIANT_DIRECTIONS: Record<string, string> = {
  studio:
    "premium studio still-life: controlled softbox lighting, clean seamless backdrop, sophisticated neutral tones",
  lifestyle:
    "bright lifestyle editorial: natural daylight warmth, styled home context, soft depth of field",
  minimal:
    "minimal commercial style: vast clean negative space, one strong light source, restrained premium palette",
};

function buildPrompt(
  product: ProductForPrompt,
  variantKey: string
): string {
  return `You are a world-class commercial advertising photographer for Fortune Market (Sri Lanka's online marketplace).

PRODUCT: ${product.name}
CATEGORY ART DIRECTION: ${categoryArtDirection(product.categoryName)}
PRODUCT CONTEXT: ${product.description ? product.description.slice(0, 220) : "n/a"}

Attach or use the supplied product photograph as the exact reference and preserve the real product faithfully — colors, label, packaging, shape and details. Do not redesign or replace the product.

STYLE — ${VARIANT_DIRECTIONS[variantKey]}

FORTUNE MARKET STANDARDS:
- This is professional product PHOTOGRAPHY, not a poster, infographic or text advertisement.
- Do NOT render any text, letters, numbers, words, slogans, watermarks or logos anywhere in the image — Fortune Market adds its own branding later.
- Keep the TOP-LEFT and BOTTOM-RIGHT areas clean and uncluttered so branding can be placed there.
- Cinematic lighting, natural shadows, realistic textures, premium color grading.
- Square 1:1 format, at least 1024x1024 pixels.

VARIATIONS: If your image generator supports creating multiple outputs from one prompt, produce 3 different variations of this style. If it only outputs one image at a time, produce ONE image that contains TWO layout options side by side so the best composition can be chosen; afterwards produce a single clean 1:1 image of the chosen option for the final upload.`;
}

export function buildExternalPrompts(
  product: ProductForPrompt
): PromptVariant[] {
  return [
    {
      key: "studio",
      label: "Premium Studio",
      prompt: buildPrompt(product, "studio"),
    },
    {
      key: "lifestyle",
      label: "Lifestyle",
      prompt: buildPrompt(product, "lifestyle"),
    },
    {
      key: "minimal",
      label: "Minimal",
      prompt: buildPrompt(product, "minimal"),
    },
  ];
}