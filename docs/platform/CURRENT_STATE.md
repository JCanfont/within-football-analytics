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
