export interface ProductForPrompt {
  name: string;
  nameSi?: string;
  categoryName?: string;
  description?: string;
}

export const FORTUNE_MARKET_CREATIVE_PROMPT = `FORTUNE MARKET — AI PRODUCT ADVERTISEMENT PHOTOGRAPHY

Create a premium, world-class commercial product advertisement IMAGE for Fortune Market.

IMPORTANT:
This is NOT a poster.
This is NOT an infographic.
This is NOT a text-based advertisement.

The output must look like a professionally produced advertising photoshoot created by a world-class commercial photographer and advertising art director.

--------------------------------------------------
CANVAS
--------------------------------------------------

Final output:

1000 × 1000 pixels
1:1 square

Maximum final file size:
3 MB

The final image must be suitable for:
- Facebook
- Instagram
- Social media sharing
- Fortune Market product promotion

--------------------------------------------------
PRIMARY OBJECTIVE
--------------------------------------------------

Transform the Producer's supplied product photograph into a visually stunning, professional commercial advertisement.

The viewer should immediately feel:

"That is a professionally photographed product."

The image should create desire, curiosity and trust and encourage the viewer to visit the Fortune Market product page.

The product itself must remain the hero.

--------------------------------------------------
PRODUCT PRESERVATION — EXTREMELY IMPORTANT
--------------------------------------------------

Use the uploaded product photograph as the PRIMARY PRODUCT REFERENCE.

Preserve the real product faithfully.

DO NOT:
- redesign the product
- change the product shape
- change packaging
- change labels
- change colors
- change logos
- invent product components
- add fake packaging
- remove important product features
- alter brand identity
- replace the actual product with an AI-created imitation

The final product must remain clearly recognizable as the Producer's real product.

--------------------------------------------------
FORTUNE MARKET BRAND IDENTITY
--------------------------------------------------

Do not include or generate an alternative logo as Fortune Market logo.

Use Fortune Market's established visual identity through:

- Forest Green
- Mustard Gold
- White / warm white
- Elegant natural tones where appropriate

The brand identity should primarily come through:

- Art direction
- Composition
- Lighting
- Background
- Props
- Materials
- Color accents
- Premium visual treatment

Do NOT force green and gold into every product if it makes the advertisement visually unnatural.

The result must feel like Fortune Market while remaining appropriate for the specific product.

--------------------------------------------------
PRODUCT BRAND LOGO
--------------------------------------------------

If the Producer supplies an official product brand logo:

Use the supplied brand logo only.

Do not recreate it.

Do not modify it.

Do not generate text pretending to be the brand logo.

Place it naturally and professionally within the composition when appropriate.

If no brand logo is supplied:

Do not invent one.

--------------------------------------------------
ABSOLUTELY NO GENERATED TEXT
--------------------------------------------------

THIS IS A CRITICAL REQUIREMENT.

Do NOT generate any text in the image.

Do NOT generate:

- Product name
- Brand name as text
- Price
- Description
- Benefits
- Category
- Subcategory
- Product specifications
- SKU
- Product code
- Contact number
- Hashtags
- CTA
- Advertising slogans
- Promotional phrases
- Fake labels
- Decorative typography
- Random letters
- Random words

Do not create typography as part of the AI-generated scene.

The image should be almost entirely visual.

The ONLY permitted logos are:

1. The official Fortune Market logo supplied by the system.
2. The official product brand logo supplied by the Producer, if available.

--------------------------------------------------
COMMERCIAL PHOTOGRAPHY QUALITY
--------------------------------------------------

Treat this as a high-budget international advertising photoshoot.

Use professional:

- Studio photography
- Product photography
- Cinematic lighting
- Controlled reflections
- Natural shadows
- Premium materials
- Depth
- Composition
- Lens perspective
- Realistic textures
- Sophisticated color grading
- High-end commercial art direction

The image must NOT look like:

- A generic AI image
- A template
- A cheap marketplace advertisement
- A stock photo
- A simple product cutout
- A basic Canva design

--------------------------------------------------
CATEGORY-ADAPTIVE ART DIRECTION
--------------------------------------------------

Automatically determine an appropriate commercial photography concept based on the product.

Examples:

BEAUTY / SKINCARE:
Luxury cosmetic studio / spa environment / natural botanical styling / premium beauty campaign.

FOOD:
Appetizing professional food photography / natural ingredients / elegant table styling / premium food campaign.

FASHION:
Luxury editorial fashion photography / sophisticated environment / premium styling.

CRAFTS:
Artisan studio / natural materials / handcrafted atmosphere / premium lifestyle photography.

ELECTRONICS:
Modern technology environment / controlled studio lighting / sleek premium presentation.

HOME & GARDEN:
Elegant lifestyle environment / sophisticated interior / natural lighting.

AUTOMOTIVE:
Professional automotive advertising photography / cinematic environment / dramatic but realistic lighting.

HEALTH CARE:
Clean premium wellness environment / natural materials / sophisticated commercial photography.

The system should adapt the visual concept to the actual product.

--------------------------------------------------
FASHION MODEL PRESERVATION
--------------------------------------------------

Applicable ONLY to FASHION items.

If the supplied product photograph already includes a model (person) wearing the product:

- Preserve the model exactly as captured.
- Do NOT change or replace the model — no alterations to their face, skin tone, hair, body, pose, or identity.

If the supplied product photograph does NOT include a model:

- Add a suitable Sri Lankan model whose appearance, skin tone, and styling match the fashion product being advertised.
- The model must feel authentic and appropriate for Sri Lanka's market.

For all non-fashion categories, ignore this rule — never insert, change, or replace people unless they were already present in the original photograph.

--------------------------------------------------
COMPOSITION
--------------------------------------------------

The product must remain the dominant focal point.

Use:

- Strong visual hierarchy
- Professional negative space
- Balanced composition
- Premium depth
- Natural perspective
- Sophisticated background separation

Avoid excessive decorative elements.

Do not overcrowd the image.

Every visual element must have a reason to exist.

--------------------------------------------------
FORTUNE MARKET VISUAL SIGNATURE
--------------------------------------------------

Create a subtle Fortune Market visual signature through:

- Forest Green accents
- Mustard Gold accents
- Premium clean backgrounds
- Elegant composition
- Natural materials where appropriate
- Sophisticated lighting
- Modern marketplace aesthetic

The result should be recognizable as Fortune Market even without large amounts of branding.

--------------------------------------------------
LOGO PLACEMENT
--------------------------------------------------

If a product brand logo is supplied with product image, position it naturally in relation to the product. But do not place in Bottom Left.

Never distort either logo.

--------------------------------------------------
FORTUNE MARKET WEB URL
--------------------------------------------------

Position "fortunemarket.lk" web url in bottom right corner.

Never distort text or miss spelled.

"Do not add any other text in the post. Only this." The "fortunemarket.lk" web URL is the ONLY visible text in the final image.

--------------------------------------------------
COPYRIGHT MARK
--------------------------------------------------

Embed a subtle, practically non-visible copyright trace "@FortuneMarket" within the image.

- It must NOT appear as visible letters, words, or typography in the final image.
- It should be an imperceptible / barely-detectable mark, noticed only on close forensic inspection.
- It must not disturb the composition, lighting, product, or background.
- This trace is not a text element; it must never read as readable characters.

--------------------------------------------------
NO PRICE / NO TEMPORARY INFORMATION
--------------------------------------------------

Do not include price or other changing product information.

This is intentional.

The same creative should remain visually valid even if:

- Price changes
- Stock changes
- Product description changes
- Seller information changes
- Product promotion changes

All current product information will remain on the Fortune Market product page.

--------------------------------------------------
FINAL CREATIVE PHILOSOPHY
--------------------------------------------------

Think:

"Apple-level product photography"

"Premium international advertising campaign"

"World-class commercial product photoshoot"

"Fortune Market visual identity"

NOT:

"Online marketplace flyer"

NOT:

"Product information poster"

NOT:

"AI text advertisement"

The final result must be a clean, sophisticated, highly desirable commercial product photograph.

NO TEXT.

NO GENERATED TYPOGRAPHY.

NO INVENTED INFORMATION.

ONLY THE REAL PRODUCT + PROFESSIONAL ART DIRECTION + APPROVED LOGOS.`;

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