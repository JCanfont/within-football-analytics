import { AlertCircle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { uploadImportCsv } from "../services/api";
import type { ImportResult } from "../types/api";

type ImportDefinition = {
  id: string;
  title: string;
  endpoint: string;
  description: string;
  columns: string;
  example?: string;
};

const importDefinitions: ImportDefinition[] = [
  {
    id: "standings",
    title: "Clasificaciones",
    endpoint: "/api/import/standings-csv",
    description: "Clasificacion por jornada antes de analizar partidos.",
    columns: "competition, season, team, matchday, snapshot_date, position, points",
  },
  {
    id: "results",
    title: "Resultados historicos",
    endpoint: "/api/import/results-csv",
    description: "Partidos, marcadores, tipo de competicion y amistosos.",
    columns: "competition, season, match_date, home_team, away_team, status, source, external_id",
  },
  {
    id: "players",
    title: "Estadisticas de jugadores",
    endpoint: "/api/import/player-stats-csv",
    description: "Minutos, goles, asistencias, xG y rendimiento por estadio.",
    columns: "player_full_name, team, opponent_team, minutes_played, goals, assists",
  },
  {
    id: "timing",
    title: "Goles por intervalo",
    endpoint: "/api/import/goal-timing-csv",
    description: "Distribucion ya agregada por intervalos para detectar patrones tempranos y tardios.",
    columns: "team, venue_type, interval_start, interval_end, goals_scored, goals_conceded",
  },
  {
    id: "moments",
    title: "Momentos de gol",
    endpoint: "/api/import/goal-moments-csv",
    description: "Un registro por cada gol. La app agrupa el minuto en 1-15, 15-30, 30-45, 46-60, 60-75 y 75-90.",
    columns: "match_source, match_external_id, team, minute, period",
    example: "csv,match-2026-001,Getafe,12,primera | csv,match-2026-001,Osasuna,4,segunda",
  },
  {
    id: "forebet",
    title: "Forebet manual",
    endpoint: "/api/import/forebet",
    description: "Capturas manuales de probabilidades, marcador previsto y under/over.",
    columns: "match_source, match_external_id, captured_at, prediction, expected_goals",
  },
];

type ImportState = {
  file: File | null;
  isUploading: boolean;
  result: ImportResult | null;
  error: string | null;
};

type ImportStates = Record<string, ImportState>;

const initialState = importDefinitions.reduce<ImportStates>((accumulator, definition) => {
  accumulator[definition.id] = { file: null, isUploading: false, result: null, error: null };
  return accumulator;
}, {});

export function ImportsPage() {
  const [states, setStates] = useState<ImportStates>(initialState);

  function updateState(id: string, next: Partial<ImportState>) {
    setStates((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...next,
      },
    }));
  }

  async function upload(definition: ImportDefinition) {
    const file = states[definition.id].file;
    if (!file) {
      updateState(definition.id, { error: "Selecciona un archivo CSV antes de importar." });
      return;
    }
    updateState(definition.id, { isUploading: true, error: null, result: null });
    try {
      const result = await uploadImportCsv(definition.endpoint, file);
      updateState(definition.id, { isUploading: false, result });
    } catch {
      updateState(definition.id, { isUploading: false, error: "No se pudo importar el CSV. Revisa el formato y el backend." });
    }
  }

  return (
    <section className="imports-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Private data intake</p>
          <h1>Importaciones CSV</h1>
        </div>
        <div className="status-pill">
          <span />
          Manual
        </div>
      </header>

      <div className="imports-grid">
        {importDefinitions.map((definition) => {
          const state = states[definition.id];
          return (
            <section className="panel import-card" key={definition.id}>
              <div className="import-card-heading">
                <div className="analysis-icon">
                  <FileUp size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2>{definition.title}</h2>
                  <p>{definition.description}</p>
                </div>
              </div>
              <div className="import-columns">
                <span>Columnas clave</span>
                <p>{definition.columns}</p>
                {definition.example ? <p>Ejemplo: {definition.example}</p> : null}
              </div>
              <label className="file-picker">
                <span>{state.file ? state.file.name : "Seleccionar CSV"}</span>
                <input
                  accept=".csv,text/csv"
                  type="file"
                  onChange={(event) => updateState(definition.id, { file: event.target.files?.[0] ?? null, error: null })}
                />
              </label>
              <button className="primary-action" type="button" onClick={() => upload(definition)} disabled={state.isUploading}>
                <Upload size={17} aria-hidden="true" />
                {state.isUploading ? "Importando..." : "Importar"}
              </button>
              {state.result ? <ImportResultBox result={state.result} /> : null}
              {state.error ? (
                <div className="import-message error">
                  <AlertCircle size={17} aria-hidden="true" />
                  <span>{state.error}</span>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ImportResultBox({ result }: { result: ImportResult }) {
  return (
    <div className={result.errors.length > 0 ? "import-result has-errors" : "import-result"}>
      <div className="import-message">
        <CheckCircle2 size={17} aria-hidden="true" />
        <span>{result.import_type}</span>
      </div>
      <div className="import-result-grid">
        <span>Procesadas: {result.processed}</span>
        <span>Creadas: {result.created}</span>
        <span>Actualizadas: {result.updated}</span>
        <span>Omitidas: {result.skipped}</span>
      </div>
      {result.errors.length > 0 ? (
        <div className="import-errors">
          {result.errors.slice(0, 3).map((error) => (
            <p key={`${error.row}-${error.message}`}>
              Fila {error.row}: {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
