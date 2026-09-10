import sharp, { type OverlayOptions } from "sharp";
import { readFile } from "fs/promises";
import path from "path";

const LOGO_PATH = path.join(process.cwd(), "public", "fortune-market-logo.svg");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "noto-sans-regular.ttf");

const FORTUNE_LOGO_WIDTH = 160;
const LOGO_MARGIN = 32;
const BRAND_TEXT = "www.fortunemarket.lk";
const BRAND_TEXT_SIZE = 26;
const BRAND_TEXT_MARGIN = 36;

let fontDataUrl: string | null = null;

async function getFontDataUrl(): Promise<string> {
  if (!fontDataUrl) {
    const buf = await readFile(FONT_PATH);
    fontDataUrl = `data:font/ttf;base64,${buf.toString("base64")}`;
  }
  return fontDataUrl;
}

export async function loadFortuneLogo(): Promise<Buffer> {
  const svg = await readFile(LOGO_PATH);
  return sharp(svg, { density: 300 })
    .resize({ width: FORTUNE_LOGO_WIDTH })
    .png()
    .toBuffer();
}

async function buildTextLayer(): Promise<Buffer> {
  const font = await getFontDataUrl();
  const x = 1000 - BRAND_TEXT_MARGIN;
  const y = 1000 - BRAND_TEXT_MARGIN;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
  <style>@font-face { font-family: 'Noto Sans'; font-weight: 400; src: url('${font}'); }</style>
  <text x="${x}" y="${y + 1}" text-anchor="end" font-family="'Noto Sans', sans-serif" font-size="${BRAND_TEXT_SIZE}" letter-spacing="1.5" fill="rgba(0,0,0,0.45)">${BRAND_TEXT}</text>
  <text x="${x}" y="${y}" text-anchor="end" font-family="'Noto Sans', sans-serif" font-size="${BRAND_TEXT_SIZE}" letter-spacing="1.5" fill="rgba(255,255,255,0.88)">${BRAND_TEXT}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function brandCreative(buf: Buffer): Promise<Buffer> {
  const fmLogo = await loadFortuneLogo();
  const textLayer = await buildTextLayer();

  const overlays: OverlayOptions[] = [
    { input: fmLogo, left: LOGO_MARGIN, top: LOGO_MARGIN },
    { input: textLayer, left: 0, top: 0 },
  ];

  return sharp(buf, { failOn: "none" }).composite(overlays).png().toBuffer();
}