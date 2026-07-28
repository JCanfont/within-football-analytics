import { BellRing, Sparkles } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useAlerts } from "../hooks/useAlerts";
import { useDashboardData } from "../hooks/useDashboardData";

export function AlertsPage() {
  const { alerts, isLoading, isGenerating, error, generateForMatch } = useAlerts();
  const dashboard = useDashboardData();
  const latestMatch = dashboard.data?.matches[0] ?? null;

  return (
    <section className="alerts-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Explainable signals</p>
          <h1>Alertas</h1>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={!latestMatch || isGenerating}
          onClick={() => latestMatch && generateForMatch(latestMatch.id)}
        >
          <Sparkles size={17} aria-hidden="true" />
          {isGenerating ? "Generando" : "Generar ultimo partido"}
        </button>
      </header>

      {error ? <EmptyState title="Alertas no disponibles" message={error} /> : null}

      <section className="panel alerts-panel">
        <div className="panel-heading">
          <div>
            <h2>Senales detectadas</h2>
            <p>Motivo, datos de soporte, muestra y fiabilidad.</p>
          </div>
          <BellRing size={19} aria-hidden="true" />
        </div>

        {isLoading ? (
          <div className="detail-state">Cargando alertas...</div>
        ) : alerts.length === 0 ? (
          <div className="detail-state">No hay alertas generadas todavia.</div>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => (
              <article className="alert-row" key={alert.id}>
                <div>
                  <strong>{formatAlertType(alert.alert_type)}</strong>
                  <p>{alert.reason}</p>
                </div>
                <div className="alert-meta">
                  <span>{alert.reliability}</span>
                  <span>Muestra {alert.sample_size ?? "n/d"}</span>
                  <span>{formatDate(alert.updated_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function formatAlertType(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
