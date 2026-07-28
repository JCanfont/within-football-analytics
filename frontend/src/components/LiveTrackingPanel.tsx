import { Radio, RefreshCw, SatelliteDish } from "lucide-react";
import type { LiveTrackingSettings, MatchListItem } from "../types/api";

type LiveTrackingPanelProps = {
  settings: LiveTrackingSettings;
  matches: MatchListItem[];
  selectedMatchId: number | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onToggleGlobal: (enabled: boolean) => void;
  onToggleMatch: (matchId: number, enabled: boolean) => void;
  onUpdateSettings: (settings: LiveTrackingSettings) => void;
};

export function LiveTrackingPanel({
  settings,
  matches,
  selectedMatchId,
  isLoading,
  isSaving,
  error,
  onToggleGlobal,
  onToggleMatch,
  onUpdateSettings,
}: LiveTrackingPanelProps) {
  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? null;
  const selectedIsTracked = selectedMatchId != null && settings.tracked_match_ids.includes(selectedMatchId);
  const disabled = isLoading || isSaving;

  return (
    <section className="panel live-panel">
      <div className="panel-heading">
        <div>
          <h2>Seguimiento en directo</h2>
          <p>Activa la comparativa live para todos los partidos o solo para el partido seleccionado.</p>
        </div>
        <SatelliteDish size={20} aria-hidden="true" />
      </div>

      <div className="live-grid">
        <div className="live-card">
          <div>
            <span>Modo global</span>
            <strong>{settings.follow_all_by_default ? "Todos los partidos" : "Solo seleccionados"}</strong>
            <small>{settings.follow_all_by_default ? "La app vigilara cada partido disponible." : "La app vigilara solo los partidos marcados."}</small>
          </div>
          <button
            className={`live-toggle ${settings.follow_all_by_default ? "active" : ""}`}
            type="button"
            disabled={disabled}
            onClick={() => onToggleGlobal(!settings.follow_all_by_default)}
            title={settings.follow_all_by_default ? "Desactivar seguimiento global" : "Activar seguimiento global"}
          >
            <Radio size={17} aria-hidden="true" />
            {settings.follow_all_by_default ? "Desactivar todos" : "Activar todos"}
          </button>
        </div>

        <div className="live-card">
          <div>
            <span>Partido seleccionado</span>
            <strong>{selectedMatch ? `${selectedMatch.home_team} vs ${selectedMatch.away_team}` : "Sin seleccion"}</strong>
            <small>{selectedIsTracked ? "Seguimiento individual activo." : "Sin seguimiento individual."}</small>
          </div>
          <button
            className={`live-toggle ${selectedIsTracked ? "active" : ""}`}
            type="button"
            disabled={disabled || !selectedMatchId}
            onClick={() => selectedMatchId && onToggleMatch(selectedMatchId, !selectedIsTracked)}
            title={selectedIsTracked ? "Dejar de seguir este partido" : "Seguir este partido en directo"}
          >
            <Radio size={17} aria-hidden="true" />
            {selectedIsTracked ? "Dejar de seguir" : "Seguir partido"}
          </button>
        </div>

        <div className="live-controls">
          <label>
            <span>Actualizacion</span>
            <select
              value={settings.refresh_seconds}
              disabled={disabled}
              onChange={(event) => onUpdateSettings({ ...settings, refresh_seconds: Number(event.target.value) })}
            >
              <option value={30}>30 segundos</option>
              <option value={60}>60 segundos</option>
              <option value={120}>2 minutos</option>
            </select>
          </label>
          <label>
            <span>Nivel de alerta</span>
            <select
              value={settings.alert_level}
              disabled={disabled}
              onChange={(event) =>
                onUpdateSettings({ ...settings, alert_level: event.target.value as LiveTrackingSettings["alert_level"] })
              }
            >
              <option value="conservador">Conservador</option>
              <option value="normal">Normal</option>
              <option value="agresivo">Agresivo</option>
            </select>
          </label>
          <div className="live-status">
            <RefreshCw size={16} aria-hidden="true" />
            <span>{settings.tracked_match_ids.length} partidos marcados</span>
          </div>
        </div>
      </div>

      {error ? <p className="live-error">{error}</p> : null}
    </section>
  );
}
