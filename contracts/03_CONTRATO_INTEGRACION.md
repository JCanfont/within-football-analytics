# 03 - CONTRATO DE INTEGRACION - URBANISMO ENGINE <-> PLATAFORMA

**Destino:** ambos repositorios y todos los agentes Cursor/Codex.

## 1. Principio
Son dos productos independientes que forman un ecosistema. Urbanismo Engine entrega reglas/datos urbanisticos estructurados. La Plataforma consume ese resultado para envolvente, edificio, BIM, optimizacion, planos y render. La comunicacion se realiza por API versionada. Ningun proyecto accede directamente a tablas internas del otro.

## 2. Repositorios
- `urbanismo-engine/`
- `real-estate-design-platform/`

Cada uno con CI, tests, variables, despliegue y ciclo de versiones propios.

## 3. Contrato estable
Base conceptual `/api/v1`. No modificar campos de forma incompatible dentro de v1. Para incompatibilidades: v2 o deprecacion/adaptador. Publicar OpenAPI y tests de contrato.

## 4. Peticion
La plataforma enviara el minimo necesario: referencia catastral cuando exista, geometria/coordenadas cuando sea necesaria, `request_id` y version solicitada. No enviar BIM ni planos al motor.

## 5. Respuesta minima
Motor devuelve `analysis_id`, `api_version`, parcela resuelta, municipio, clasificacion/calificacion, usos, parametros, instrumentos, fuentes, conflictos, confianza, revision requerida y timestamp.

Cada parametro tendra `status`, `value`, `unit`, `confidence`, `source_refs` y `extraction_method` cuando aplique.

## 6. Estados
Vocabulario estable: `confirmed`, `interpreted`, `manual_validated`, `conflict`, `unknown`, `not_applicable`. La plataforma no convierte `unknown` en cero ni aplica defaults silenciosos.

## 7. Errores
Errores estructurados con codigo, mensaje, `retryable` y detalle seguro. Distinguir parcela no encontrada, fuente no disponible, analisis incompleto, rate limit y error interno.

Una caida temporal del motor no destruye un estudio existente: la plataforma puede mostrar el ultimo analisis cacheado indicando fecha/version.

## 8. Reproducibilidad
Cada escenario BIM guarda `urbanism_analysis_id`, version API, fecha y snapshot/hash de parametros consumidos. Si el motor cambia una regla, no modificar proyectos antiguos silenciosamente; ofrecer recalculo como nueva version.

## 9. Seguridad
HTTPS; autenticacion servicio-a-servicio; secretos fuera del codigo; rate limits; logs sin secretos; permisos separados para API publica y administrativa.

## 10. Rendimiento y cache
El motor puede cachear resultados por parcela/version de fuentes. La plataforma puede cachear respuestas, pero debe conservar `generated_at` y `analysis_id`. Nunca presentar cache antiguo como analisis actual sin fecha.

## 11. Async
Analisis costosos pueden responder `202 Accepted` con `job_id`. La plataforma consulta estado o usa mecanismo futuro acordado. No mantener una peticion HTTP abierta durante procesos largos.

## 12. Fuentes
`source_refs` deben poder resolverse a metadatos/evidencia. La plataforma no necesita conocer como el motor obtuvo internamente el documento, solo el contrato de evidencia.

## 13. Overrides
Si un tecnico introduce un valor manual en la Plataforma, no debe sobrescribir la base del Urbanismo Engine. Guardarlo como override del escenario. Si se desea corregir la regla general, hacerlo mediante el flujo de revision del Motor.

## 14. Limite de responsabilidades
### Urbanismo Engine NO hace
BIM, distribucion de viviendas, planos, render, calculo estructural o MEP.

### Plataforma NO hace
interpretacion central de RPUC/MUC, mantenimiento de reglas urbanisticas ni resolucion de vigencia documental.

## 15. Contrato con BIM
La Plataforma transforma parametros del motor en restricciones geometricas. Debe guardar la relacion `constraint -> urban_parameter -> source_refs` para poder explicar por que una cara de la envolvente esta donde esta.

## 16. Compatibilidad futura
Structure, MEP, clash detection, mediciones y render no requieren cambios en Urbanismo Engine salvo nuevos parametros urbanisticos relevantes. No introducir dependencias de esas disciplinas en la API del motor sin necesidad.

## 17. CI de integracion
Mantener fixtures de respuestas v1 y tests del cliente. Antes de desplegar cambios del motor, ejecutar tests de contrato contra la Plataforma. Antes de cambiar el cliente, probar contra respuestas actuales y anteriores compatibles.

## 18. Regla para Cursor/Codex
Antes de cualquier cambio que afecte a ambos proyectos, escribir un breve `ADR` (Architecture Decision Record) con problema, alternativas, decision, impacto y migracion. No editar ambos repositorios de forma improvisada.

## 19. Secuencia de implementacion
1. Congelar/documentar flujo actual de finca/Catastro.
2. Definir OpenAPI v1 con fixtures.
3. Construir primer endpoint real del Motor.
4. Integrar panel Urbanismo en Plataforma.
5. Construir envolvente con parametros trazables.
6. Massing/BIM/planos.
7. Optimizar.
8. Render.
9. Structure/MEP y disciplinas posteriores.

## 20. Principio final
**Dos repositorios, dos productos, un contrato estable y una sola cadena de trazabilidad desde la norma hasta la geometria.**
