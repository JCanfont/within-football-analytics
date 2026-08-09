import { Mail, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { useStatisticalConfig } from "../hooks/useStatisticalConfig";
import { fetchAlertEmailStatus } from "../services/api";
import type { ClosedMidtableWeights, ForebetStartEmailResult, StatisticalSettings } from "../types/api";

const weightLabels: Record<keyof ClosedMidtableWeights, string> = {
  centrality: "Centralidad",
  classification_distance: "Distancia entre posiciones",
  goal_balance: "Equilibrio goleador",
  goal_activity: "Actividad goleadora",
  reliability: "Fiabilidad de clasificacion",
  form: "Forma reciente",
  venue: "Local / visitante",
};

export function SettingsPage() {
  const { settings, isLoading, isSaving, message, error, setSettings, save } = useStatisticalConfig();
  const [emailStatus, setEmailStatus] = useState<ForebetStartEmailResult | null>(null);

  useEffect(() => {
    fetchAlertEmailStatus()
      .then(setEmailStatus)
      .catch(() => setEmailStatus({
        configured: false,
        sent: false,
        status: "not_configured",
        message: "No se pudo comprobar el estado del email.",
      }));
  }, []);

  function updateField(field: keyof StatisticalSettings, value: number) {
    if (!settings) {
      return;
    }
    setSettings({ ...settings, [field]: value });
  }

  function updateWeight(field: keyof ClosedMidtableWeights, value: number) {
    if (!settings) {
      return;
    }
    setSettings({
      ...settings,
      closed_midtable_weights: {
        ...settings.closed_midtable_weights,
        [field]: value,
      },
    });
  }

  return (
    <section className="settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Statistical controls</p>
          <h1>Configuracion</h1>
        </div>
        <button className="primary-action" type="button" onClick={save} disabled={!settings || isSaving}>
          <Save size={17} aria-hidden="true" />
          {isSaving ? "Guardando" : "Guardar"}
        </button>
      </header>

      {error ? <EmptyState title="Configuracion no disponible" message={error} /> : null}
      {message ? <div className="save-message">{message}</div> : null}

      {isLoading || !settings ? (
        <div className="detail-state">Cargando configuracion...</div>
      ) : (
        <div className="settings-grid">
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Umbrales principales</h2>
                <p>Valores base para muestras, alertas y ponderaciones generales.</p>
              </div>
            </div>
            <div className="control-grid">
              <NumberControl label="Jornada minima" value={settings.minimum_matchday} min={1} step={1} onChange={(value) => updateField("minimum_matchday", value)} />
              <NumberControl label="Muestra minima" value={settings.minimum_sample_size} min={1} step={1} onChange={(value) => updateField("minimum_sample_size", value)} />
              <NumberControl label="Umbral alertas" value={settings.alert_threshold} min={0} max={100} step={1} onChange={(value) => updateField("alert_threshold", value)} />
              <NumberControl label="Peso pretemporada" value={settings.preseason_weight} min={0} max={1} step={0.05} onChange={(value) => updateField("preseason_weight", value)} />
              <NumberControl label="Peso ausencias" value={settings.absence_weight} min={0} max={1} step={0.05} onChange={(value) => updateField("absence_weight", value)} />
              <NumberControl label="Peso estadio" value={settings.stadium_performance_weight} min={0} max={1} step={0.05} onChange={(value) => updateField("stadium_performance_weight", value)} />
              <NumberControl label="Peso rival" value={settings.rival_performance_weight} min={0} max={1} step={0.05} onChange={(value) => updateField("rival_performance_weight", value)} />
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Indice de equilibrio</h2>
                <p>Pesos configurables de la formula inicial del partido.</p>
              </div>
              <SlidersHorizontal size={19} aria-hidden="true" />
            </div>
            <div className="weight-list">
              {(Object.keys(settings.closed_midtable_weights) as Array<keyof ClosedMidtableWeights>).map((field) => (
                <NumberControl
                  key={field}
                  label={weightLabels[field]}
                  value={settings.closed_midtable_weights[field]}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => updateWeight(field, value)}
                />
              ))}
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Ponderacion de temporadas</h2>
                <p>Reglas base segun jornada.</p>
              </div>
            </div>
            <div className="rules-list">
              {settings.season_blend_rules.map((rule) => (
                <div key={`${rule.from_matchday}-${rule.to_matchday ?? "end"}`}>
                  <strong>
                    Jornadas {rule.from_matchday}-{rule.to_matchday ?? "+"}
                  </strong>
                  <span>Anterior {Math.round(rule.previous_season_weight * 100)}%</span>
                  <span>Actual {Math.round(rule.current_season_weight * 100)}%</span>
                  <span>{rule.reliability}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Intervalos de gol</h2>
                <p>Bloques temporales usados en la lectura de goles.</p>
              </div>
            </div>
            <div className="interval-list">
              {settings.goal_intervals.map((interval) => (
                <span key={interval.label}>{interval.label}</span>
              ))}
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Alertas por email</h2>
                <p>Forebet (inicio) y Flashscore (gol &lt;30&apos; del favorito ≤ 1,50).</p>
              </div>
              <Mail size={19} aria-hidden="true" />
            </div>
            {emailStatus == null ? (
              <div className="detail-state">Comprobando Resend...</div>
            ) : (
              <div className={emailStatus.configured ? "save-message" : "flashscore-setup-message"}>
                {emailStatus.configured
                  ? "Email configurado (`RESEND_API_KEY` + `FOREBET_ALERT_EMAIL`)."
                  : "Faltan `RESEND_API_KEY` o `FOREBET_ALERT_EMAIL` en Vercel. Sin eso no se envian alertas."}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

type NumberControlProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  onChange: (value: number) => void;
};

function NumberControl({ label, value, min, max, step, onChange }: NumberControlProps) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
