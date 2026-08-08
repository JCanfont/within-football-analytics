# INTEGRATION_PLAN — Plataforma ↔ Urbanismo Engine

## Principio
Dos repositorios, un contrato. Este repo **solo consume** la API.

## Secuencia (alineada al contrato §19)

| Paso | Acción en este repo | Acción en `urbanismo-engine` |
|---|---|---|
| 1 | Congelar/documentar plano+DXF y hueco Catastro (`CURRENT_STATE.md`) | — |
| 2 | OpenAPI v1 + fixtures + tests de contrato cliente | Misma copia del contrato + server stubs |
| 3 | — | Primer `POST /api/v1/urbanism/analyze` real |
| 4 | Panel Urbanismo en UI | — |
| 5 | `BuildingEnvelopeGenerator` con `constraint → urban_parameter → source_refs` | — | ✅ P2 |
| 6 | Massing / BIM / planos (evolucionar DXF actual desde modelo) | — | ✅ Massing P3; BIM/planos siguiente |
| 7+ | Optimizador, render, Structure/MEP | Solo si aparecen parámetros urbanísticos nuevos |

## Cliente en plataforma
- Env: `VITE_URBANISMO_API_BASE_URL` (vacío → modo fixture/mock).
- Nunca defaults silenciosos para `unknown`.
- Cache local conserva `analysis_id` + `generated_at`.
- Overrides técnicos se guardan en el **escenario**, no se escriben al motor.

## Reproducibilidad
Cada escenario de plano/BIM guarda:
- `urbanism_analysis_id`
- `api_version`
- `generated_at`
- hash/snapshot de parámetros consumidos

## Sincronización del contrato
El fichero `contracts/03_CONTRATO_INTEGRACION.md` debe ser idéntico en ambos repos. Cambio incompatible → ADR + bump de versión.
