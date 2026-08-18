# 02 - PLATAFORMA DE VIABILIDAD Y DISENO INMOBILIARIO - MASTER SPEC

**Destino:** Cursor / Codex  
**Proyecto:** evolucion de la aplicacion inmobiliaria existente  
**Dependencia:** Urbanismo Engine mediante API versionada.

## 0. Regla principal: NO REHACER
La aplicacion ya localiza ciudad, muestra cartografia/ortofoto, permite seleccionar finca y conecta con Catastro para obtener referencia catastral. Conservarlo.

Antes de tocar codigo: inspeccionar y ejecutar todo el repositorio; identificar frontend/backend/BD; documentar mapa, ortofoto y Catastro; localizar modulos/esbozos de volumetria, planeamiento, optimizacion, 2D y render; crear `CURRENT_STATE.md` e `INTEGRATION_PLAN.md`. No cambiar tecnologias funcionales por preferencia.

## 1. Flujo objetivo
`mapa/ortofoto -> finca -> Catastro -> Urbanismo Engine -> panel urbanistico -> envolvente -> massing -> modelo arquitectonico parametrico -> BIM/IFC -> optimizacion -> planos 2D -> render -> futuras Structure + MEP -> mediciones/presupuesto`.

## 2. Cliente del motor
No duplicar parsers RPUC/MUC ni reglas urbanisticas. Consumir la API. Guardar `analysis_id`, version y timestamp para reproducibilidad.

## 3. Panel Urbanismo
Mostrar clasificacion, calificacion, usos, edificabilidad, ocupacion, altura, plantas, profundidad, retranqueos, densidad, parcela/fachada minima, condiciones especiales, conflictos y confianza. Cada valor debe abrir evidencia/fuente. Diferenciar oficial, interpretado, calculado, manual, pendiente y conflicto.

## 4. Envolvente
Crear `BuildingEnvelopeGenerator`. Entradas: poligono, retranqueos, ocupacion, edificabilidad, altura, plantas, profundidad y restricciones modelables. Salida: geometria 2D/3D, metricas y reglas limitantes. La envolvente no es el edificio definitivo.

## 5. Massing
Volumenes rapidos y parametricos para comparar alternativas, plantas, patios iniciales y aprovechamiento.

## 6. Modelo arquitectonico parametrico
Tras aprobar massing, generar objetos semanticos: Site, Building, Storey, Space, Wall, Slab, Roof, Door, Window, Stair, Core/Elevator, Terrace, ParkingSpace y Shaft. La malla visual no sera la fuente de verdad.

## 7. BIM/IFC
Crear adaptador BIM aislado. Evaluar IfcOpenShell para autoria, lectura/escritura, propiedades, geometria y validacion IFC. Objetivo: interoperabilidad con software profesional sin requerir Revit.

## 8. 3D web
Evaluar Three.js y, si el frontend es React, React Three Fiber/Drei. Incluir orbita, pan/zoom, ortografica, cortes, ocultar/explotar plantas, seleccion, transparencia, capas parcela/envolvente/massing/BIM y propiedades. Optimizar modelos grandes.

## 9. Optimizador
`DesignOptimizer` separado del visor. Inputs: envolvente, nucleo, tipologias, objetivos, restricciones y reglas. Outputs: alternativas A/B/C con metricas y violaciones. No usar LLM como unico motor geometrico; validar restricciones matematicamente.

## 10. Metricas
Edificabilidad permitida/usada, %, ocupacion, altura, plantas, m2 construidos/utiles/comunes/residenciales/comerciales/terrazas, viviendas, parking, trasteros y ratio util/construido. Permitir simulaciones fuera de limites solo si se marcan inequivocamente.

## 11. Planos 2D
Los planos deben derivar del modelo. Primera fase: plantas, alzados, secciones, cubierta, plantas de vivienda, cotas, superficies, nombres, puertas/ventanas y ejes. Preparar exportacion vectorial PDF/SVG/DXF segun viabilidad.

## 12. Multidisciplinar desde el dia 1
Aunque V1 implemente Architecture, preparar `ARCH`, `STRUCT`, `MEP_ELECTRICAL`, `MEP_LIGHTING`, `MEP_PLUMBING`, `MEP_DRAINAGE`, `MEP_DHW`, `MEP_HVAC_HEATING`, `MEP_HVAC_COOLING`, `MEP_VENTILATION`, `MEP_GAS`, `MEP_TELECOM` y `MEP_FIRE`.

No implementar ahora todos, pero ninguna decision de IDs, relaciones, IFC, BD, planos o visor debe impedirlos.

## 13. Structure futuro
Prever pilares, vigas, muros, forjados, cimentacion y huecos. El calculo estructural profesional sera un modulo especializado; no confundir geometria preliminar con calculo firmado.

## 14. MEP futuro
Representar en el futuro equipos, terminales, tuberias, conductos, bandejas/cables, conexiones, circuitos y shafts. Los planos especializados seran vistas filtradas del mismo modelo coordinado.

## 15. Clash detection
Prever interferencias: tuberia-viga, conducto-bajante, instalaciones-estructura, etc., con tolerancias configurables. No implementar hasta disponer de Structure/MEP suficientes.

## 16. Mediciones y presupuesto futuro
Cada objeto debe poder tener tipo, material, dimensiones, cantidades y clasificacion. Permitira computar tabiques, hormigon, puertas, cable, tuberia, luminarias, sanitarios, etc. Precios mediante catalogo/versionado separado.

## 17. Render
Separar 3D interactivo de render fotorrealista. Preparar adaptador opcional para Blender en fase posterior. Blender no debe ser dependencia del nucleo BIM ni de planos. Disenar `RenderJob` asincrono con estado, resolucion, camara y preset. Empezar sin infraestructura GPU cloud obligatoria.

## 18. Fuente unica de verdad
`MODELO PARAMETRICO/BIM -> visor 3D + planos + mediciones + render + Structure/MEP`. Cambiar una pared debe invalidar/regenerar derivados afectados.

## 19. Historial y escenarios
Cada estudio soporta escenarios A/B/C, versiones y comparacion. Registrar que version del analisis urbanistico alimento cada escenario.

## 20. Persistencia y jobs
Separar dominio, geometria, BIM, archivos derivados y cache. Usar IDs estables. IFC complejo, optimizacion, planos y render pueden ser jobs asincronos.

## 21. Seguridad
Validacion de archivos/modelos, limites, aislamiento de conversion/render, secretos, permisos por proyecto, logs, backups y proteccion frente a jobs abusivos.

## 22. Pruebas
Tests de geometria, restricciones, metricas, serializacion, contrato, IFC, regeneracion, planos y regresion visual. Crear edificios fixture pequenos antes de edificios completos.

## 23. Fases
P0 auditoria; P1 API/panel; P2 envolvente; P3 massing; P4 arquitectura parametrica+BIM; P5 planos; P6 optimizador; P7 render; P8 Structure; P9 MEP; P10 clash/mediciones/presupuesto. No saltar al render antes de estabilizar geometria/BIM/planos.

## 24. Definition of Done primera gran version
Seleccionar una finca existente, obtener Urbanismo Engine, visualizar fuentes, generar envolvente y massing, desarrollar BIM arquitectonico basico, visualizarlo en 3D, generar planos 2D coherentes y exportar IFC, conservando todo lo anterior.

## 25. Prohibiciones
No rehacer lo que funciona. No duplicar Urbanismo Engine. No hacer planos desconectados del modelo. No hacer del render la fuente de verdad. No cerrar el modelo a MEP/Structure. No cambiar unilateralmente el contrato API.
