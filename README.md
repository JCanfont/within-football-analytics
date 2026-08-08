# WITHIN FOOTBALL ANALYTICS

Aplicacion privada de analisis estadistico de futbol.

## Fase 1

Esta primera fase crea solo la base del backend:

- FastAPI.
- SQLite con SQLAlchemy.
- Alembic para migraciones.
- Modelos iniciales: competicion, temporada, equipo, alias de equipo, estadio, partido, clasificacion historica y prediccion de Forebet.
- Endpoint `GET /health`.
- Tests iniciales.

No incluye todavia frontend, scrapers, alertas, jugadores, modelos predictivos ni machine learning.

## Fase 2

Esta fase amplia el dominio del backend sin crear todavia frontend ni scrapers:

- Jugadores, alias de jugador e historial de equipos.
- Forma reciente del equipo.
- Disponibilidad de jugadores.
- Alineaciones.
- Distribucion temporal de goles.
- Estadisticas del jugador por partido.
- Resultados de analisis.
- Alertas.
- Configuracion estadistica.
- Calculos iniciales para posicion relativa, centralidad, diferencia goleadora, actividad goleadora, ponderacion de temporadas, fiabilidad e indice de equilibrio del partido.

## Fase 3

Esta fase anade importacion manual por CSV:

- `POST /api/import/standings-csv`
- `POST /api/import/results-csv`
- `POST /api/import/player-stats-csv`
- `POST /api/import/goal-timing-csv`
- `POST /api/import/forebet`

Los endpoints reciben un archivo `file` en formulario multipart y devuelven:

```json
{
  "import_type": "results_csv",
  "processed": 1,
  "created": 1,
  "updated": 0,
  "skipped": 0,
  "errors": []
}
```

No hay scraping en esta fase. `/api/import/forebet` importa capturas manuales de Forebet desde CSV.

## Fase 4

Esta fase anade endpoints principales de consulta y analisis inicial:

- `GET /api/matches`
- `GET /api/matches/today`
- `GET /api/matches/{match_id}`
- `GET /api/competitions`
- `GET /api/teams`
- `GET /api/players`
- `GET /api/stadiums`
- `GET /api/alerts`
- `GET /api/analytics/matches/{match_id}`
- `GET /api/analytics/team/{team_id}/goal-timing`
- `GET /api/analytics/player/{player_id}/stadiums`
- `GET /api/analytics/stadium/{stadium_id}/players`

El analisis de partido calcula un indice de equilibrio inicial cuando existen snapshots de clasificacion anteriores al partido. Si faltan datos, devuelve `insufficient_data` con una explicacion.

## Fase 5

Esta fase crea el frontend base con React, Vite y TypeScript:

- Layout privado con navegacion lateral.
- Dashboard inicial.
- Tarjetas de metricas.
- Tabla de partidos importados.
- Grafico inicial con Recharts.
- Cliente Axios conectado al backend.
- Estados de carga, vacio y backend no disponible.
- Test inicial con Vitest y Testing Library.

No incluye todavia detalle avanzado de partido, configuracion editable, alertas completas ni voz.

## Fase 6

Esta fase amplia el dashboard y crea el detalle operativo de partido:

- Seleccion de partido desde la tabla.
- Carga de `GET /api/matches/{match_id}`.
- Carga de `GET /api/analytics/matches/{match_id}`.
- Carga de timing de goles para local y visitante.
- Panel de partido con competicion, estadio, marcador y estado.
- Tarjetas de indice de equilibrio, Forebet y clasificacion previa.
- Explicacion textual del analisis.
- Grafico de goles por intervalo.
- Mini tabla de clasificacion previa al partido.

Sigue pendiente el detalle avanzado completo con ausencias, alineaciones, historico de jugadores contra rival y controles de filtros por temporada.

## Fase 7

Esta fase anade configuracion estadistica editable:

- `GET /api/config/statistical`
- `PUT /api/config/statistical`
- Defaults para pesos del indice de equilibrio.
- Defaults para ponderacion temporada anterior/actual por jornada.
- Defaults para intervalos de goles.
- Pantalla `Configuracion` en el frontend.
- Edicion de jornada minima, muestra minima, umbral de alertas, peso de pretemporada, peso de ausencias, peso de estadio, peso de rival y pesos del indice de equilibrio.

La configuracion se guarda en la tabla existente `statistical_config` como JSON. No requiere nueva migracion.

## Fase 8

Esta fase anade alertas explicables y aplica la configuracion guardada al analisis:

- El indice de equilibrio usa los pesos guardados en `GET /api/config/statistical`.
- `POST /api/alerts/generate/matches/{match_id}` genera alertas iniciales para un partido.
- `GET /api/alerts` lista alertas persistidas.
- Reglas iniciales:
  - Indice de equilibrio alto.
  - Senal under de Forebet.
  - Equipo que encaja especialmente al final.
  - Jugador con buen historial en el estadio.
- Pantalla `Alertas` en el frontend.
- Boton para generar alertas del ultimo partido cargado.
- Cada alerta muestra motivo, muestra, fiabilidad y fecha de actualizacion.

Las alertas se presentan como senales explicables y asociaciones historicas, no como certezas.

## Fase 9

Esta fase anade peticiones por voz en el dashboard:

- Panel `Nombra a voz un partido`.
- Reconocimiento de voz con la API del navegador cuando este disponible.
- Busqueda local del partido por nombres de equipos importados.
- Seleccion automatica del partido encontrado.
- Respuesta hablada con `speechSynthesis`.
- Boton para leer el analisis del partido seleccionado.
- No se envia audio al backend.

El reconocimiento de voz depende del navegador. Chrome y Edge suelen ofrecer mejor soporte.

## Fase 10

Esta fase anade parametrizacion avanzada de goles posterior a voz:

- Campo opcional `competition_type` en competiciones.
- Campo `is_friendly` en partidos.
- Importacion opcional de `competition_type` e `is_friendly` desde `results-csv`.
- Perfil de goles dentro de `GET /api/analytics/matches/{match_id}`.
- Clasificacion de volumen goleador: bajo, medio o alto.
- Senal under/over combinando marcador real o xG/Forebet.
- Lectura de goles tempranos y tardios usando `team_goal_timing`.
- Peso estadistico reducido para amistosos.
- Seccion `Parametros de goles` en el detalle del dashboard.
- Respuesta por voz ampliada con perfil de goles.

La fase presenta estos parametros como asociaciones historicas, no como causalidad.

## Fase 11

Esta fase convierte los parametros de goles en filtros operativos del dashboard:

- `GET /api/matches` devuelve tambien `competition_type`.
- Panel `Filtros de parametros` en el dashboard.
- Filtro por tipo de competicion.
- Filtro por partidos oficiales o amistosos.
- Filtro por under/over.
- Filtro por volumen de goles: bajo, medio, alto o sin marcador.
- Las metricas, tabla, grafico y busqueda por voz usan el conjunto filtrado.
- La seleccion de partido se reajusta automaticamente si el filtro oculta el partido activo.

## Fase 12

Esta fase anade una pantalla privada para cargar CSV desde la interfaz:

- Nueva vista `Importaciones`.
- Subida de clasificaciones, resultados, estadisticas de jugadores, goles por minuto y Forebet.
- Cada tarjeta muestra columnas clave esperadas.
- Resultado visible por importacion: procesadas, creadas, actualizadas, omitidas y errores.
- Usa los endpoints existentes bajo `/api/import/*`.
- No requiere migracion nueva.

## Fase 13

Esta fase anade salida operativa de informes:

- Boton `Exportar informe` en el detalle del partido.
- Generacion de informe `.txt` desde el analisis cargado.
- Incluye partido, competicion, marcador, indice de equilibrio, Forebet, parametros de goles, explicacion, tabla previa y goles por intervalo.
- El nombre del archivo se genera con equipos e id del partido.
- El informe mantiene la nota de que los patrones son asociaciones historicas, no causalidad.
- No requiere backend nuevo ni migracion.

## Estructura propuesta

```text
within-football-analytics/
  backend/
    app/
      main.py
      config.py
      database.py
      models/
      schemas/
      routers/
      services/
      scrapers/
      analytics/
      repositories/
      utils/
    alembic/
      versions/
    tests/
    requirements.txt
    .env.example
  frontend/
    src/
      components/
      pages/
      layouts/
      services/
      hooks/
      types/
      charts/
    package.json
    vite.config.ts
  data/
    imports/
    exports/
  docs/
  README.md
```

En esta fase se crea el backend y las carpetas de datos/documentacion. El frontend queda reservado para la fase 2.

## Instalacion backend

Desde la carpeta `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Si `python` no esta en el PATH, usar el ejecutable de Python disponible en el equipo.

## Configuracion

Copiar `.env.example` a `.env` si se quiere personalizar la configuracion:

```powershell
Copy-Item .env.example .env
```

Por defecto la base de datos SQLite se crea en:

```text
sqlite:///./within_football_analytics.db
```

## Migraciones

Aplicar migraciones:

```powershell
alembic upgrade head
```

Revision actual verificada:

```text
a8544894009f (head)
```

Crear una nueva migracion:

```powershell
alembic revision --autogenerate -m "descripcion"
```

## Arranque

Desde `backend`:

```powershell
uvicorn app.main:app --reload
```

Desde `frontend`:

```powershell
npm install
npm run dev
```

URLs locales verificadas:

```text
Backend: http://127.0.0.1:8000
Frontend: http://127.0.0.1:5175
```

Endpoint disponible:

```text
GET /health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "within-football-analytics"
}
```

## Importar Honduras y Sudafrica desde FootyStats

Las ligas hondurena y sudafricana no estan disponibles en el CSV publico de
Football-Data que usa `scripts/sync_football_data.py`. Para cargarlas se usa
FootyStats con una clave API autorizada y con esas ligas seleccionadas en la
cuenta.

El importador genera resultados, clasificaciones calculadas y minutos de goles
cuando FootyStats los devuelve:

```powershell
$env:FOOTYSTATS_API_KEY="TU_CLAVE"
.\backend\.venv\Scripts\python.exe scripts\sync_footystats_leagues.py --import-db --with-standings
```

Por defecto carga las tres ultimas temporadas utiles de:

- Honduras: Liga Nacional de Futbol Profesional de Honduras.
- South Africa: Premier Soccer League.

Tambien se pueden indicar otras ligas compatibles con FootyStats:

```powershell
.\backend\.venv\Scripts\python.exe scripts\sync_footystats_leagues.py --targets "Honduras:Liga Nacional de Futbol Profesional de Honduras" "South Africa:Premier Soccer League"
```

## Importar catalogo SofaScore gratis

SofaScore cubre muchas competiciones, pero su API directa bloquea llamadas de
backend con `403 Forbidden`. La ruta gratuita preparada usa Crawlora, que ofrece
endpoints de SofaScore con plan Free y clave API.

El catalogo base esta en:

```text
data/imports/sofascore-competitions-40.csv
```

Incluye 40 competiciones. Las que tienen `sofascore_id` informado se pueden
cargar directamente; las que no lo tienen quedan pendientes de completar con el
ID exacto de SofaScore antes de importarlas. No se deben inventar IDs.

Comando:

```powershell
$env:CRAWLORA_API_KEY="TU_CLAVE_GRATUITA"
.\backend\.venv\Scripts\python.exe scripts\sync_sofascore_crawlora_leagues.py --import-db --with-standings
```

Para cargar solo una competicion concreta:

```powershell
.\backend\.venv\Scripts\python.exe scripts\sync_sofascore_crawlora_leagues.py --tournament-id 358 --import-db --with-standings
```

El importador usa temporadas, clasificaciones y partidos recientes por equipo.
En el plan gratuito conviene respetar el ritmo lento por defecto, porque la
cuota indicada por Crawlora es de 5 peticiones por minuto.

## SofaScore live por equipos elegidos

La pantalla `Partidos en directo` permite guardar IDs de equipos SofaScore. Con
`CRAWLORA_API_KEY` configurada en el backend, se pueden cargar sus proximos
eventos y pedir un snapshot de evento con marcador, posesion y tiros cuando
SofaScore tenga esos datos.

## Tests

Desde `backend`:

```powershell
pytest
```

Resultado verificado en fase 13:

```text
Backend: 22 passed
Frontend: 10 passed
```

Build frontend verificado:

```text
npm run build
```

## Decisiones fase 1

- Se separa la API, los modelos, la configuracion y la base de datos desde el inicio.
- Las capturas de Forebet usan `captured_at` y no se sobrescriben.
- Los modelos incluyen `created_at` y `updated_at` cuando aplica.
- Se anaden restricciones unicas para evitar duplicados obvios sin vincular entidades dudosas automaticamente.
- La normalizacion de nombres se centraliza en `app/utils/normalization.py`.

## Decisiones fase 2

- El jugador tiene identidad propia y no depende solo de nombre o equipo.
- `PlayerTeamHistory` permite conservar el mismo `player_id` aunque cambie de club.
- `ForebetPrediction`, `AnalysisResult`, `Alert`, `TeamGoalTiming` y otros registros analiticos conservan capturas fechadas.
- `StatisticalConfig` queda preparado para guardar pesos configurables como JSON.
- La formula inicial del indice de equilibrio queda aislada en `app/analytics/statistics.py` para poder cambiar pesos sin tocar endpoints.

## Decisiones fase 4

- Los routers de consulta estan separados por responsabilidad: catalogo, partidos y analytics.
- Los endpoints devuelven datos simples pensados para alimentar el futuro frontend.
- El detalle de partido incluye predicciones Forebet ordenadas de mas reciente a mas antigua.
- El analisis de partido utiliza solo snapshots anteriores al partido.
- La fiabilidad se muestra de forma conservadora; no se presenta como solida si la muestra es pequena.
- El rendimiento jugador-estadio se presenta como asociacion historica, no como causalidad.

## Decisiones fase 5

- El frontend se crea como aplicacion Vite separada dentro de `frontend/`.
- El cliente Axios usa proxy de Vite hacia `http://127.0.0.1:8000` en desarrollo.
- El panel se centra en uso interno: navegacion lateral, metricas y tabla operativa.
- Recharts se incorpora desde el inicio para graficos.
- La primera version mantiene una sola pantalla real: Dashboard.
- El resto de secciones quedan representadas en navegacion, pero sin vistas propias todavia.

## Decisiones fase 6

- El dashboard selecciona automaticamente el primer partido disponible.
- El detalle de partido consume endpoints reales del backend en vez de datos incrustados.
- Si faltan datos de analisis, el panel muestra el estado explicable que devuelve la API.
- El grafico de timing compara goles marcados por local y visitante con los datos importados.
- Las tarjetas del detalle priorizan lectura rapida: indice, Forebet y clasificacion previa.

## Decisiones fase 7

- La configuracion se gestiona como un unico documento JSON bajo la clave `statistical_settings`.
- La API crea valores por defecto si la configuracion no existe.
- La pantalla permite editar pesos y umbrales principales, pero por ahora muestra reglas de temporada e intervalos como lectura.
- Los cambios se persisten mediante `PUT /api/config/statistical`.
- Queda pendiente aplicar dinamicamente estos pesos al calculo real del indice de equilibrio.

## Decisiones fase 8

- Los pesos configurados ya se aplican al calculo del indice de equilibrio.
- La generacion de alertas es explicita mediante endpoint; no se ejecuta automaticamente en cada consulta.
- Las alertas generadas se persisten y se actualizan si ya existe una alerta del mismo tipo para el partido.
- Las primeras reglas son conservadoras y dependen de datos ya importados.
- Queda pendiente ampliar alertas de alineaciones, bajas importantes y cambios de prediccion entre capturas.

## Decisiones fase 9

- La voz se implementa en el frontend con APIs nativas del navegador.
- El audio no se guarda ni se envia al backend.
- La busqueda por voz compara el texto reconocido con nombres de equipos de los partidos cargados.
- La respuesta hablada resume partido, indice de equilibrio, Forebet, fiabilidad, marcador y explicacion.
- Si el navegador no soporta reconocimiento o sintesis, la interfaz lo comunica.

## Decisiones fase 10

- `competition_type` admite valores normalizados como `domestic_league`, `domestic_cup`, `continental` y `friendly`.
- Si el CSV no indica tipo, se infiere de forma conservadora por el nombre de competicion.
- Los amistosos se conservan en el analisis, pero con `statistical_weight` de 0.35.
- El perfil usa marcador real si existe; si no, recurre a xG de la captura Forebet mas reciente.
- Las senales de goles tempranos y tardios usan la ultima captura de `team_goal_timing` por equipo, competicion, temporada y sede.
- El texto de producto evita afirmar causalidad: habla de patrones y asociaciones historicas.

## Decisiones fase 11

- Los filtros se aplican en el frontend para mantener el dashboard rapido y evitar endpoints extra.
- La voz busca dentro de los partidos visibles, respetando el contexto filtrado por el usuario.
- El volumen de goles se calcula con marcador real cuando existe.
- Si no hay marcador, el partido puede agruparse como `Sin marcador`.

## Decisiones fase 12

- La importacion se mantiene manual para conservar control sobre la fuente de datos.
- Cada tipo de CSV se sube de forma independiente para poder localizar errores por lote.
- La pantalla no almacena archivos; solo los envia al backend para procesarlos.
- Los errores se muestran por fila cuando el backend los devuelve.

## Decisiones fase 13

- El informe se genera en frontend usando los datos ya cargados para evitar otra llamada al backend.
- Se exporta como texto plano por compatibilidad y facilidad de lectura.
- El archivo conserva el enfoque conservador del producto: patrones historicos, no certeza predictiva.

## Avisos de inicio por email

El envio se configura en el entorno de produccion con `RESEND_API_KEY` y
`FOREBET_ALERT_EMAIL`. Opcionalmente, `FOREBET_ALERT_FROM` permite usar un
remitente verificado propio en lugar del remitente de pruebas de Resend. La
clave de envio se crea en `https://resend.com/api-keys`.

## Flashscore (cuotas bajas y gol temprano)

En Vercel hacen falta `RAPIDAPI_KEY` (FlashScore4 en RapidAPI),
`RESEND_API_KEY`, `FOREBET_ALERT_EMAIL` y `CRON_SECRET`.

La pantalla Flashscore lista la jornada filtrada a partidos con cuota de
equipo ≤ 1,60. Los emails se envian al detectar un gol del favorito
(cuota ≤ 1,50) antes del minuto 30. Con la pagina abierta y auto-refresh
cada 1 minuto ya sale el aviso. En segundo plano, el workflow
`flashscore-tick` (con secret `CRON_SECRET`) revisa aproximadamente cada
minuto llamando a `/api/flashscore/tick`.

## Formatos CSV fase 3

### Clasificaciones

Columnas:

```text
competition,season,country,team,matchday,snapshot_date,position,played,won,drawn,lost,goals_for,goals_against,goal_difference,points
```

`goal_difference` es opcional; si falta, se calcula como `goals_for - goals_against`.

### Resultados historicos

Columnas:

```text
competition,season,country,competition_type,matchday,match_date,home_team,away_team,stadium,city,home_score,away_score,status,is_friendly,source,external_id
```

`source` y `external_id` se usan para detectar duplicados. Si se importa el mismo partido otra vez, se actualizan marcador y estado.
`competition_type` e `is_friendly` son opcionales; si faltan, se infiere tipo de competicion y `is_friendly` queda en `false`.

### Estadisticas de jugadores

Columnas:

```text
competition,season,country,matchday,match_date,team,opponent_team,was_home_team,stadium,city,player_full_name,date_of_birth,nationality,primary_position,player_external_id,minutes_played,started,position_played,goals,assists,shots,shots_on_target,key_passes,expected_goals,expected_assists,rating,yellow_cards,red_cards,captured_at,source,match_external_id
```

`player_external_id` es opcional, pero recomendable para evitar homonimos.

### Goles por minuto

Columnas:

```text
competition,season,country,team,venue_type,interval_start,interval_end,goals_scored,goals_conceded,matches_played,percentage_scored,percentage_conceded,calculated_at
```

### Forebet manual

Columnas:

```text
match_source,match_external_id,captured_at,home_probability,draw_probability,away_probability,prediction,predicted_score,predicted_home_score,predicted_away_score,expected_goals,over_under_prediction,both_teams_score_prediction,source_url
```

El partido debe existir previamente, normalmente importado con `results-csv`.
