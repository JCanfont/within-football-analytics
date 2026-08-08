/** Architectural drawing helpers.
 *  Paper millimetres at the chosen scale.
 *  1:50 → 1 m real = 20 mm paper
 *  1:100 → 1 m real = 10 mm paper
 */

export type ArchScale = "1:50" | "1:100";

export function chooseScale(areaM2: number, maxSideM: number): ArchScale {
  // Dwellings and compact plans use 1:50; larger footprints fall back to 1:100.
  if (areaM2 > 180 || maxSideM > 18) {
    return "1:100";
  }
  return "1:50";
}

export function mmPerMeter(scale: ArchScale): number {
  return scale === "1:50" ? 20 : 10;
}

export function metersToPaperMm(meters: number, scale: ArchScale): number {
  return meters * mmPerMeter(scale);
}

export function scaleLabel(scale: ArchScale): string {
  return `Escala ${scale}`;
}

export function orientationToNorthAngle(orientation: string): number {
  // Angle of the building's main facade (south edge) relative to screen.
  // North arrow rotation: 0 = north up.
  const map: Record<string, number> = {
    norte: 180,
    sur: 0,
    este: 270,
    oeste: 90,
    noreste: 225,
    noroeste: 135,
    sureste: 315,
    suroeste: 45,
  };
  return map[orientation] ?? 0;
}
