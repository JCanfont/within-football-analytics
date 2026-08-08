import { Building2, DraftingCompass, Link2, Radar } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArchitecturalModelPanel } from "../components/ArchitecturalModelPanel";
import { EnvelopePanel } from "../components/EnvelopePanel";
import { MassingPanel } from "../components/MassingPanel";
import { OptimizerPanel } from "../components/OptimizerPanel";
import { PlanSheetsPanel } from "../components/PlanSheetsPanel";
import { UrbanismPanel } from "../components/UrbanismPanel";
import { generateArchitecturalModel } from "../services/architecturalModelGenerator";
import { generateBuildingEnvelope } from "../services/buildingEnvelopeGenerator";
import { optimizeDesign } from "../services/designOptimizer";
import { generateMassingStudy } from "../services/massingGenerator";
import { generatePlanSetFromModel } from "../services/modelPlanGenerator";
import {
  analyzeParcel,
  isUrbanismEngineConfigured,
  linkScenarioToUrbanism,
  readCachedUrbanismAnalysis,
  UrbanismClientError,
} from "../services/urbanismClient";
import type { OptimizerObjective } from "../types/optimizer";
import type { DesignScenarioUrbanLink, UrbanismAnalysis } from "../types/urbanismContract";

const SCENARIO_KEY = "platform.designScenario.urbanLink.v1";
const ENVELOPE_KEY = "platform.designScenario.envelope.v1";
const MASSING_KEY = "platform.designScenario.massing.v1";
const ARCH_MODEL_KEY = "platform.designScenario.architecturalModel.v1";
const PLAN_SET_KEY = "platform.designScenario.planSet.v1";
const OPTIMIZATION_KEY = "platform.designScenario.optimization.v1";

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
  const [selectedMassing, setSelectedMassing] = useState<"A" | "B" | "C">(
    () => readScenarioLink()?.massing_selected_key ?? "A",
  );
  const [optimizerObjective, setOptimizerObjective] = useState<OptimizerObjective>(
    () => (readScenarioLink()?.optimization_objective as OptimizerObjective | undefined) ?? "balanced",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const engineConfigured = useMemo(() => isUrbanismEngineConfigured(), []);

  const envelope = useMemo(() => {
    if (!analysis) {
      return null;
    }
    return generateBuildingEnvelope({
      urbanism_analysis_id: analysis.analysis_id,
      api_version: analysis.api_version,
      parameters: analysis.parameters,
      plot_area_m2: analysis.parcel?.area_m2 ?? null,
    });
  }, [analysis]);

  const massingStudy = useMemo(() => {
    if (!envelope) {
      return null;
    }
    return generateMassingStudy({ envelope });
  }, [envelope]);

  const selectedMassingAlternative = useMemo(() => {
    return massingStudy?.alternatives.find((alternative) => alternative.key === selectedMassing) ?? null;
  }, [massingStudy, selectedMassing]);

  const architecturalModel = useMemo(() => {
    if (!analysis || !envelope || !selectedMassingAlternative) {
      return null;
    }
    return generateArchitecturalModel({
      urbanism_analysis_id: analysis.analysis_id,
      envelope_id: envelope.envelope_id,
      plot_polygon: envelope.plot_polygon,
      massing: selectedMassingAlternative,
    });
  }, [analysis, envelope, selectedMassingAlternative]);

  const planSet = useMemo(() => {
    if (!architecturalModel) {
      return null;
    }
    return generatePlanSetFromModel(architecturalModel);
  }, [architecturalModel]);

  const optimization = useMemo(() => {
    if (!envelope || !massingStudy) {
      return null;
    }
    return optimizeDesign({
      envelope,
      massingStudy,
      objective: optimizerObjective,
      prefer_compliant: true,
    });
  }, [envelope, massingStudy, optimizerObjective]);

  useEffect(() => {
    if (!massingStudy) {
      return;
    }
    setSelectedMassing((current) => {
      if (massingStudy.alternatives.some((alt) => alt.key === current)) {
        return current;
      }
      return massingStudy.selected_key;
    });
  }, [massingStudy]);

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
    if (!analysis || !envelope || !massingStudy || !architecturalModel || !planSet || !optimization) {
      return;
    }
    const link: DesignScenarioUrbanLink = {
      ...linkScenarioToUrbanism(analysis),
      envelope_id: envelope.envelope_id,
      massing_study_id: massingStudy.study_id,
      massing_selected_key: selectedMassing,
      architectural_model_id: architecturalModel.model_id,
      plan_set_id: planSet.plan_set_id,
      optimization_id: optimization.optimization_id,
      optimization_objective: optimization.objective,
      optimization_recommended_key: optimization.recommended_massing_key,
    };
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(link));
    localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
    localStorage.setItem(
      MASSING_KEY,
      JSON.stringify({ ...massingStudy, selected_key: selectedMassing }),
    );
    localStorage.setItem(ARCH_MODEL_KEY, JSON.stringify(architecturalModel));
    localStorage.setItem(PLAN_SET_KEY, JSON.stringify(planSet));
    localStorage.setItem(OPTIMIZATION_KEY, JSON.stringify(optimization));
    setScenarioLink(link);
  };

  return (
    <section className="platform-study-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Plataforma inmobiliaria · P6</p>
          <h1>Estudio de finca</h1>
          <p className="page-lead">
            Urbanismo → envolvente → massing → optimizador → BIM → planos 2D. El Urbanismo Engine no se
            implementa en este repositorio.
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

          {envelope ? (
            <section className="panel">
              <EnvelopePanel envelope={envelope} />
            </section>
          ) : null}

          {envelope && massingStudy ? (
            <section className="panel">
              <MassingPanel
                study={massingStudy}
                envelope={envelope}
                selectedKey={selectedMassing}
                onSelect={setSelectedMassing}
              />
            </section>
          ) : null}

          {optimization ? (
            <section className="panel">
              <OptimizerPanel
                result={optimization}
                objective={optimizerObjective}
                onObjectiveChange={setOptimizerObjective}
                onApplyRecommended={() => setSelectedMassing(optimization.recommended_massing_key)}
                selectedMassingKey={selectedMassing}
              />
            </section>
          ) : null}

          {architecturalModel ? (
            <section className="panel">
              <ArchitecturalModelPanel model={architecturalModel} />
            </section>
          ) : null}

          {planSet ? (
            <section className="panel">
              <PlanSheetsPanel planSet={planSet} />
            </section>
          ) : null}

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
                Vincular análisis + envolvente + massing + optimización + BIM + planos al escenario
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
                  <dt>envelope_id</dt>
                  <dd>{scenarioLink.envelope_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>massing</dt>
                  <dd>
                    {scenarioLink.massing_selected_key ?? "—"} · {scenarioLink.massing_study_id ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>architectural_model_id</dt>
                  <dd>{scenarioLink.architectural_model_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>plan_set_id</dt>
                  <dd>{scenarioLink.plan_set_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>optimization_id</dt>
                  <dd>
                    {scenarioLink.optimization_id ?? "—"}
                    {scenarioLink.optimization_recommended_key
                      ? ` · rec. ${scenarioLink.optimization_recommended_key}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>api_version</dt>
                  <dd>{scenarioLink.api_version}</dd>
                </div>
                <div>
                  <dt>parameters_hash</dt>
                  <dd>{scenarioLink.parameters_hash}</dd>
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
