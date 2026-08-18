# ADR 0001 — Consumir Urbanismo Engine solo por API

## Problema
La plataforma necesita parámetros urbanísticos trazables, pero el motor debe permanecer en un repositorio independiente.

## Alternativas
1. Embebier parsers MUC/RPUC en este repo.
2. Compartir base de datos entre productos.
3. Consumir API versionada `/api/v1` con fixtures de contrato.

## Decisión
Opción 3. Este repositorio implementa únicamente cliente, panel, cache de respuestas y transformación a restricciones geométricas.

## Impacto
- Prohibido código del Urbanismo Engine aquí.
- Contrato duplicado en `/contracts` de ambos repos.
- Desarrollo local posible con fixtures sin motor levantado.

## Migración
Cuando el motor exponga el endpoint real, apuntar `VITE_URBANISMO_API_BASE_URL` y mantener tests de contrato contra fixtures v1.
