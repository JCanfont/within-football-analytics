# Fuera de alcance en este repositorio

## Urbanismo Engine

El **Urbanismo Engine es un producto y repositorio independientes**.

En este repositorio está **prohibido**:

- Implementar parsers MUC/RPUC o extractores documentales urbanísticos.
- Mantener reglas urbanísticas como fuente de verdad.
- Resolver vigencia/jerarquía documental de planeamiento.
- Añadir un paquete `urbanismo-engine`, servicios de intersección MUC o BD PostGIS del motor.
- Acceder a tablas internas del motor.

La plataforma **solo consume** el contrato versionado en [`/contracts/03_CONTRATO_INTEGRACION.md`](../../contracts/03_CONTRATO_INTEGRACION.md).

La especificación de implementación del motor (`01_URBANISMO_ENGINE_MASTER_SPEC`) pertenece exclusivamente al repositorio `urbanismo-engine/`.
