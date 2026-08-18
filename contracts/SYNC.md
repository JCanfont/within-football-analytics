# Sincronización del contrato entre repositorios

Archivo canónico en **este** repo:

`contracts/03_CONTRATO_INTEGRACION.md`

También OpenAPI de consumo:

`contracts/openapi-urbanismo-v1.yaml`

## Destino obligatorio (repo hermano)

En el repositorio `urbanismo-engine/` debe existir **la misma copia**:

- `contracts/03_CONTRATO_INTEGRACION.md`
- (recomendado) `contracts/openapi-urbanismo-v1.yaml` como contrato servidor

## Reglas
1. No editar el contrato solo en un lado.
2. Cambio incompatible → ADR + `v2`.
3. Este repo **no** contiene implementación del motor.

## Estado actual
Este repositorio ya incluye el contrato. Cuando exista/apunte el repo `urbanismo-engine`, copiar allí estos ficheros sin modificar el texto del principio de independencia.
