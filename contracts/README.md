# Contratos compartidos

Este directorio contiene el **contrato de integración estable** entre:

- `urbanismo-engine/` (repositorio independiente; **no vive en este repo**)
- `real-estate-design-platform/` (este repositorio / módulo de plataforma)

## Archivo canónico

- [`03_CONTRATO_INTEGRACION.md`](./03_CONTRATO_INTEGRACION.md)

**Regla:** el mismo fichero debe existir en ambos repositorios. Cualquier cambio incompatible requiere ADR y versionado (`v1` → `v2`).

## Qué NO va aquí

- Implementación del Urbanismo Engine (parsers MUC/RPUC, extractores, PostGIS del motor, etc.).
- Acceso directo a tablas internas del motor.

La plataforma solo consume `POST /api/v1/urbanism/analyze` (y jobs async asociados) vía cliente HTTP + fixtures de contrato.
