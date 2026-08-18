import type { PriceCatalog } from "../types/coordination";

/** Separate versioned price catalog — not embedded in geometry models. */
export const DEFAULT_PRICE_CATALOG_V1: PriceCatalog = {
  catalog_id: "catalog-platform-default",
  version: "2026.08.1",
  currency: "EUR",
  items: [
    {
      code: "ARCH.WALL",
      description: "Muro/tabique",
      unit: "m2",
      unit_price_eur: 85,
      chapter: "Arquitectura",
    },
    {
      code: "ARCH.DOOR",
      description: "Puerta interior/acceso",
      unit: "ud",
      unit_price_eur: 420,
      chapter: "Arquitectura",
    },
    {
      code: "ARCH.WINDOW",
      description: "Ventana",
      unit: "ud",
      unit_price_eur: 380,
      chapter: "Arquitectura",
    },
    {
      code: "ARCH.SLAB",
      description: "Forjado",
      unit: "m2",
      unit_price_eur: 95,
      chapter: "Arquitectura",
    },
    {
      code: "STRUCT.COLUMN",
      description: "Pilar hormigón",
      unit: "m3",
      unit_price_eur: 320,
      chapter: "Estructura",
    },
    {
      code: "STRUCT.BEAM",
      description: "Viga hormigón",
      unit: "m",
      unit_price_eur: 75,
      chapter: "Estructura",
    },
    {
      code: "STRUCT.FOUNDATION",
      description: "Zapata hormigón",
      unit: "m3",
      unit_price_eur: 280,
      chapter: "Estructura",
    },
    {
      code: "MEP.PIPE",
      description: "Tubería instalada",
      unit: "m",
      unit_price_eur: 28,
      chapter: "Instalaciones",
    },
    {
      code: "MEP.DUCT",
      description: "Conducto ventilación",
      unit: "m",
      unit_price_eur: 55,
      chapter: "Instalaciones",
    },
    {
      code: "MEP.CABLE",
      description: "Cable eléctrico",
      unit: "m",
      unit_price_eur: 6.5,
      chapter: "Instalaciones",
    },
    {
      code: "MEP.LUMINAIRE",
      description: "Luminaria",
      unit: "ud",
      unit_price_eur: 95,
      chapter: "Instalaciones",
    },
    {
      code: "MEP.EQUIPMENT",
      description: "Equipo MEP",
      unit: "ud",
      unit_price_eur: 650,
      chapter: "Instalaciones",
    },
  ],
};

export function getDefaultPriceCatalog(): PriceCatalog {
  return {
    ...DEFAULT_PRICE_CATALOG_V1,
    items: DEFAULT_PRICE_CATALOG_V1.items.map((item) => ({ ...item })),
  };
}
