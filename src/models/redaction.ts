export type RedactionMode = 'smart' | 'manual';

export type RedactionStyle = 'black' | 'blur' | 'white';

export const REDACTION_MODE_LABEL: Record<RedactionMode, string> = {
  smart: 'Private Details',
  manual: 'Draw Box',
};

export const REDACTION_STYLE_LABEL: Record<RedactionStyle, string> = {
  black: 'Black',
  blur: 'Gray',
  white: 'White',
};

export const REDACTION_STYLE_COLOR: Record<RedactionStyle, string> = {
  black: '#000000',
  blur: 'rgba(120,120,120,0.7)',
  white: '#FFFFFF',
};

/** Normalized page rect (0–1 relative to page width/height). Origin top-left for UI. */
export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RedactionRect = {
  id: string;
  pageIndex: number;
  /** Normalized 0–1, top-left origin (UI space). */
  rect: NormalizedRect;
  style: RedactionStyle;
  /** Present when this box was spawned from the Private Details checklist. */
  source?: 'threat' | 'manual' | 'thermal';
};

export type LoadedPdfDocument = {
  uri: string;
  title: string;
};
