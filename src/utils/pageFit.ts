import type { NormalizedRect } from '../models/redaction';

/** Aspect-fit placement of a page inside a container (letterboxing). */
export type PageFit = {
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
  containerWidth: number;
  containerHeight: number;
  /** Natural page width/height used for the fit (PDF user space or pixels). */
  pageWidth: number;
  pageHeight: number;
};

/**
 * Compute the displayed page frame inside a container using aspect-fit
 * (identical to CSS object-fit: contain).
 */
export function computeAspectFit(
  pageWidth: number,
  pageHeight: number,
  containerWidth: number,
  containerHeight: number,
): PageFit {
  const pw = Math.max(pageWidth, 1);
  const ph = Math.max(pageHeight, 1);
  const cw = Math.max(containerWidth, 1);
  const ch = Math.max(containerHeight, 1);

  const imageRatio = pw / ph;
  const containerRatio = cw / ch;

  let renderWidth: number;
  let renderHeight: number;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > containerRatio) {
    renderWidth = cw;
    renderHeight = cw / imageRatio;
    offsetY = (ch - renderHeight) / 2;
  } else {
    renderHeight = ch;
    renderWidth = ch * imageRatio;
    offsetX = (cw - renderWidth) / 2;
  }

  return {
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    containerWidth: cw,
    containerHeight: ch,
    pageWidth: pw,
    pageHeight: ph,
  };
}

export type ScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Map a normalized page rect to screen pixels inside an aspect-fit frame.
 *
 * Default: `rect` is UI top-left (pdf.js bridge output).
 * Pass `visionOrigin: true` for Apple Vision bottom-left normalized coords:
 *   boxY = offsetY + ((1 - rect.y - rect.height) * renderHeight)
 *
 * Padding (+2px H, +1px V) fully covers glyphs without neighboring-line bleed.
 */
export function mapPageRectToScreen(
  rect: NormalizedRect,
  fit: PageFit,
  options?: { visionOrigin?: boolean; padX?: number; padY?: number },
): ScreenRect {
  const padX = options?.padX ?? 2;
  const padY = options?.padY ?? 1;
  const boxW = rect.width * fit.renderWidth;
  const boxH = rect.height * fit.renderHeight;
  const boxX = fit.offsetX + rect.x * fit.renderWidth;

  const boxY = options?.visionOrigin
    ? fit.offsetY + (1 - rect.y - rect.height) * fit.renderHeight
    : fit.offsetY + rect.y * fit.renderHeight;

  return {
    left: boxX - padX,
    top: boxY - padY,
    width: boxW + padX * 2,
    height: boxH + padY * 2,
  };
}

/**
 * Convert a screen-space drag rect back into page-normalized UI coordinates
 * (top-left), clamped to the page frame. Used by manual draw.
 */
export function mapScreenRectToPage(
  screen: { x: number; y: number; width: number; height: number },
  fit: PageFit,
): NormalizedRect {
  const x = (screen.x - fit.offsetX) / fit.renderWidth;
  const y = (screen.y - fit.offsetY) / fit.renderHeight;
  const width = screen.width / fit.renderWidth;
  const height = screen.height / fit.renderHeight;

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const nx = clamp01(x);
  const ny = clamp01(y);
  return {
    x: nx,
    y: ny,
    width: Math.min(Math.max(width, 0), 1 - nx),
    height: Math.min(Math.max(height, 0), 1 - ny),
  };
}
