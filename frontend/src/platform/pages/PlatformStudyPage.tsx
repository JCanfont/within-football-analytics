import { Building2, DraftingCompass, Link2, Radar } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UrbanismPanel } from "../components/UrbanismPanel";
import {
  analyzeParcel,
  isUrbanismEngineConfigured,
  linkScenarioToUrbanism,
  readCachedUrbanismAnalysis,
  UrbanismClientError,
} from "../services/urbanismClient";
import type { DesignScenarioUrbanLink, UrbanismAnalysis } from "../types/urbanismContract";

const SCENARIO_KEY = "platform.designScenario.urbanLink.v1";

function readScenarioLink(): DesignScenarioUrbanLink | null {
  try {
    const raw = localStorage.getItem(SCENARIO_KEY);
    return raw ? (JSON.parse(raw) as DesignScenarioUrbanLink) : null;
  } catch {
    return null;
  }
}

export function PlatformStudyPage() {
  const [cadastralReference, setCadastralReference] = useState("1234501VH1234S0001AB");
  const [analysis, setAnalysis] = useState<UrbanismAnalysis | null>(() => readCachedUrbanismAnalysis());
  const [scenarioLink, setScenarioLink] = useState<DesignScenarioUrbanLink | null>(() => readScenarioLink());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const engineConfigured = useMemo(() => isUrbanismEngineConfigured(), []);

  const onAnalyze = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    analyzeParcel({
      request_id: `req-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      cadastral_reference: cadastralReference.trim() || null,
    })
      .then((result) => {
        setAnalysis(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoading(false);
        if (err instanceof UrbanismClientError) {
          setError(err.payload.message);
          const cached = readCachedUrbanismAnalysis();
          if (cached) {
            setAnalysis(cached);
          }
          return;
        }
        setError("No se pudo consultar el Urbanismo Engine.");
      });
  };

  const bindToFloorPlanScenario = () => {
    if (!analysis) {
      return;
    }
    const link = linkScenarioToUrbanism(analysis);
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(link));
    setScenarioLink(link);
  };

  return (
    <section className="platform-study-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Plataforma inmobiliaria</p>
          <h1>Estudio de finca</h1>
          <p className="page-lead">
            Consume el Urbanismo Engine por API v1 (sin implementar el motor aquí) y enlaza el análisis al
            escenario de planos/DXF existente.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Radar size={18} aria-hidden="true" /> Consulta urbanística
            </h2>
            <p>
              {engineConfigured
                ? "Cliente apuntando a VITE_URBANISMO_API_BASE_URL."
                : "Modo fixture local: el motor no está configurado en este entorno (correcto mientras el repo urbanismo-engine vive aparte)."}
            </p>
          </div>
        </div>

        <form className="platform-analyze-form" onSubmit={onAnalyze}>
          <label>
            Referencia catastral
            <input
              value={cadastralReference}
              onChange={(event) => setCadastralReference(event.target.value)}
              placeholder="Ej. 1234501VH1234S0001AB"
              aria-label="Referencia catastral"
            />
          </label>
          <button className="primary-action" type="submit" disabled={loading}>
            {loading ? "Analizando..." : "Analizar parcela"}
          </button>
        </form>
        {error ? <p className="platform-error">{error}</p> : null}
      </section>

      {analysis ? (
        <>
          <UrbanismPanel
            analysis={analysis}
            cachedNotice={
              engineConfigured
                ? null
                : "Respuesta de fixture de contrato v1 (no es un análisis oficial del motor)."
            }
          />

          <section className="panel platform-next-steps">
            <div className="panel-heading">
              <div>
                <h2>
                  <Link2 size={18} aria-hidden="true" /> Escenario de diseño
                </h2>
                <p>
                  Los overrides técnicos se guardan en el escenario de la plataforma; nunca sobrescriben la base
                  del Urbanismo Engine.
                </p>
              </div>
            </div>

            <div className="platform-actions">
              <button type="button" className="primary-action" onClick={bindToFloorPlanScenario}>
                Vincular análisis al escenario de plano
              </button>
              <Link className="secondary-action" to="/floor-plan">
                <DraftingCompass size={16} aria-hidden="true" />
                Abrir planos / AutoCAD DXF
              </Link>
            </div>

            {scenarioLink ? (
              <dl className="fp-summary">
                <div>
                  <dt>urbanism_analysis_id</dt>
                  <dd>{scenarioLink.urbanism_analysis_id}</dd>
                </div>
                <div>
                  <dt>api_version</dt>
                  <dd>{scenarioLink.api_version}</dd>
                </div>
                <div>
                  <dt>parameters_hash</dt>
                  <dd>{scenarioLink.parameters_hash}</dd>
                </div>
                <div>
                  <dt>generated_at</dt>
                  <dd>{new Date(scenarioLink.generated_at).toLocaleString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="page-lead">Aún no hay vínculo de escenario.</p>
            )}

            <p className="platform-boundary">
              <Building2 size={16} aria-hidden="true" />
              Límite de responsabilidades: este repo no interpreta MUC/RPUC ni resuelve vigencia documental.
            </p>
          </section>
        </>
      ) : null}
    </section>
  );
}
