import type { BudgetEstimate, BudgetLine, PriceCatalog, QuantityTakeoff } from "../types/coordination";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function generateBudgetEstimate(
  takeoff: QuantityTakeoff,
  catalog: PriceCatalog,
): BudgetEstimate {
  const lines: BudgetLine[] = [];

  for (const qty of takeoff.lines) {
    const price = catalog.items.find((item) => item.code === qty.code && item.unit === qty.unit);
    if (!price) continue;
    const total = round2(qty.quantity * price.unit_price_eur);
    lines.push({
      id: `bud-${qty.id}`,
      code: qty.code,
      chapter: price.chapter,
      description: price.description,
      unit: qty.unit,
      quantity: qty.quantity,
      unit_price_eur: price.unit_price_eur,
      total_eur: total,
      quantity_line_id: qty.id,
    });
  }

  const chapterMap = new Map<string, number>();
  for (const line of lines) {
    chapterMap.set(line.chapter, round2((chapterMap.get(line.chapter) ?? 0) + line.total_eur));
  }

  const chapter_totals = [...chapterMap.entries()]
    .map(([chapter, total_eur]) => ({ chapter, total_eur }))
    .sort((a, b) => a.chapter.localeCompare(b.chapter));

  const total_eur = round2(lines.reduce((sum, line) => sum + line.total_eur, 0));

  return {
    budget_id: `budget-${takeoff.takeoff_id}-${catalog.version}`,
    catalog_id: catalog.catalog_id,
    catalog_version: catalog.version,
    currency: catalog.currency,
    generated_at: new Date().toISOString(),
    lines,
    chapter_totals,
    total_eur,
    disclaimer:
      "Presupuesto estimativo a partir de mediciones y catálogo versionado. No es oferta contractual ni certificación.",
  };
}
