# CURRENT_STATE — Plataforma (P0)

Fecha: 2026-08-08  
Repositorio actual: evolución de plataforma sobre el código existente (incluye módulo de plano/DXF).

## Qué existe hoy

### Base previa del monorepo
- Backend FastAPI orientado a analítica (legado del proyecto original).
- Frontend React + Vite + TypeScript.

### Módulo de diseño inmobiliario ya entregado
Ruta UI: `/floor-plan` (nav: **AutoCAD plano**).

| Pieza | Ubicación | Estado |
|---|---|---|
| Cuestionario vivienda | `frontend/src/pages/FloorPlanPage.tsx` | Operativo |
| Layout paramétrico 2D | `frontend/src/utils/floorPlanLayout.ts` | Operativo |
| Mobiliario/sanitarios | `frontend/src/utils/floorPlanFixtures.ts` | Operativo |
| Vista previa SVG | `frontend/src/components/FloorPlanDrawing.tsx` | Operativo |
| Export AutoCAD DXF | `frontend/src/utils/floorPlanDxf.ts` | Operativo (AC1024, metros) |

Capas DXF: `A-WALL`, `A-DOOR`, `A-GLAZ`, `A-FURN`, `A-FLOR-APPL`, `A-FLOR-SANR`, `A-ANNO-*`.

### Cartografía / Catastro / mapa
**Aún no auditado como flujo productivo en este repo.** El master spec asume mapa/ortofoto/Catastro previos en la app inmobiliaria objetivo; aquí se documenta como dependencia a conectar en P1 sin rehacer el plano/DXF.

## Qué NO existe (y no debe existir aquí)
- Urbanismo Engine (repo aparte).
- Parsers MUC/RPUC.
- Generación de reglas urbanísticas locales.

## Nuevo en P0/P1 plataforma
- Contrato copiado en `/contracts/03_CONTRATO_INTEGRACION.md`.
- Cliente HTTP + fixtures OpenAPI v1 (consumo).
- Panel Urbanismo (lectura de análisis + confianza/fuentes).
- Vínculo estudio: `urbanism_analysis_id` + snapshot de parámetros → escenario de plano.

## Nuevo en P2 plataforma
- `BuildingEnvelopeGenerator` (`frontend/src/platform/services/buildingEnvelopeGenerator.ts`).
- Huella máxima a partir de retranqueos, ocupación, edificabilidad, altura/plantas.
- Trazabilidad `constraint → urban_parameter → source_refs` en UI (`EnvelopePanel`).
- Escenario guarda también `envelope_id`.
- Avisos si parámetros `unknown`/`conflict` (sin defaults silenciosos).

## Nuevo en P3 plataforma
- `generateMassingStudy` con alternativas A/B/C:
  - A máximo aprovechamiento (full fill)
  - B patio interior
  - C barra compacta
- Métricas: plantas, altura, huella, m²t, patio, fill de envolvente y violaciones.
- UI de comparación y selección; escenario guarda `massing_study_id` + `massing_selected_key`.

## Nuevo en P4 plataforma
- Modelo semántico ARCH (`generateArchitecturalModel`): Site, Building, Storey, Space, Wall, Slab, Roof, Door, Window, Stair, Core, Shaft, Terrace, ParkingSpace.
- Disciplinas reservadas para Structure/MEP futuros; IDs estables.
- Adaptador BIM aislado `services/bim/ifcAdapter.ts` → export IFC4 SPF + JSON semántico (fuente de verdad).
- Escenario guarda `architectural_model_id`.

## Nuevo en P5 plataforma
- Planos 2D derivados del modelo (`generatePlanSetFromModel`):
  - plantas por storey
  - planta de cubierta
  - alzado sur
  - sección A-A
- Cotas, ejes, nombres, superficies, puertas/ventanas.
- Export **DXF** y **SVG** por hoja.
- Escenario guarda `plan_set_id`.
