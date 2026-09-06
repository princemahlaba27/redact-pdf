import type { NormalizedRect, RedactionRect } from './redaction';

export type ThermalThreatKind =
  | 'ssn'
  | 'balance'
  | 'address'
  | 'email'
  | 'phone'
  | 'card'
  | 'metadata';

export type ThermalThreat = {
  id: string;
  kind: ThermalThreatKind;
  label: string;
  risk: number;
  rect: NormalizedRect;
  /** Page index for seeding the editor after burn. */
  pageIndex: number;
};

export const THERMAL_SCAN_MS = 3000;

export function threatToRedaction(threat: ThermalThreat): RedactionRect {
  return {
    id: threat.id,
    pageIndex: threat.pageIndex,
    rect: threat.rect,
    style: 'black',
  };
}
