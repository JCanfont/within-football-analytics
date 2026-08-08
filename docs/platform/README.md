# Plataforma de viabilidad y diseño inmobiliario

Este módulo evoluciona la aplicación existente hacia la plataforma descrita en
`specs/02_PLATAFORMA_INMOBILIARIA_MASTER_SPEC.md`.

## Reglas duras
- El **Urbanismo Engine no se implementa en este repositorio**.
- El contrato de integración vive en [`/contracts/03_CONTRATO_INTEGRACION.md`](../../contracts/03_CONTRATO_INTEGRACION.md) y debe estar **copiado también** en `urbanismo-engine/`.
- Ver [`OUT_OF_SCOPE.md`](./OUT_OF_SCOPE.md).

## Entradas de UI
- `/platform/study` — consulta urbanística (cliente API / fixtures) + vínculo de escenario
- `/floor-plan` — cuestionario + planos + export DXF AutoCAD (ya existente)

## Variable de entorno
- `VITE_URBANISMO_API_BASE_URL` — base del motor (`.../api/v1`). Vacío = fixtures locales.
