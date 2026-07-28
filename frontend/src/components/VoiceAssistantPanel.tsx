import { Mic, MicOff, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { DirectMatchResult, MatchInsightData, MatchListItem, ThreeSeasonSummary } from "../types/api";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";

type VoiceAssistantPanelProps = {
  matches: MatchListItem[];
  isLoadingMatches: boolean;
  selectedInsight: MatchInsightData | null;
  onSelectMatch: (matchId: number) => void;
  onReadAnalysis: () => void;
};

export function VoiceAssistantPanel({ matches, isLoadingMatches, selectedInsight, onSelectMatch, onReadAnalysis }: VoiceAssistantPanelProps) {
  const voice = useVoiceAssistant({ matches, selectedInsight, onSelectMatch });
  const [typedRequest, setTypedRequest] = useState("");
  const summary = selectedInsight?.analytics.three_season_summary ?? null;
  const seasonRows = useMemo(() => buildSeasonRows(summary), [summary]);
  const statusMessage = !voice.isSupported
    ? "Pulsa el boton para comprobar si tu navegador admite reconocimiento de voz."
    : isLoadingMatches
      ? "Cargando partidos para poder encontrarlos por voz."
    : matches.length === 0
      ? "Primero importa partidos para que pueda encontrarlos por voz."
      : voice.message;

  return (
    <section className="panel voice-panel" aria-label="Asistente de voz">
      <div className="voice-copy">
        <p className="eyebrow">Voice assistant</p>
        <h2>Pide un partido hablando</h2>
        <p>{statusMessage}</p>
        {voice.transcript ? <span>Escuchado: {voice.transcript}</span> : null}
        {voice.pendingOptions.length > 0 ? (
          <div className="voice-choices" aria-label="Aclarar equipo o partido">
            {voice.pendingOptions.map((option) => (
              <button className="voice-choice" key={option.matchId} type="button" onClick={() => voice.choosePendingOption(option.matchId)}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="voice-actions">
        <form
          className="voice-text-form"
          onSubmit={(event) => {
            event.preventDefault();
            voice.submitTextRequest(typedRequest);
          }}
        >
          <input
            aria-label="Peticion de partido por texto"
            placeholder="Real Madrid contra Ath Bilbao"
            value={typedRequest}
            onChange={(event) => setTypedRequest(event.target.value)}
          />
          <button className="voice-button secondary" type="submit">
            Probar texto
          </button>
        </form>
        <button
          className={voice.isListening ? "voice-button listening" : "voice-button"}
          type="button"
          onClick={voice.isListening ? voice.stopListening : voice.startListening}
          disabled={isLoadingMatches}
          title="Escuchar partido"
        >
          {voice.isListening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          {voice.isListening ? "Detener" : "Escuchar"}
        </button>
        <button
          className="voice-button secondary"
          type="button"
          onClick={() => {
            onReadAnalysis();
            voice.speakCurrentAnalysis();
          }}
          disabled={!voice.isSupported || !selectedInsight}
          title="Leer analisis"
        >
          <Volume2 size={18} aria-hidden="true" />
          Leer analisis
        </button>
        {voice.speechSegments.length > 0 ? (
          <>
            <div className="voice-player" aria-label="Control de lectura">
              <button
                className="voice-icon-button"
                type="button"
                onClick={voice.previousSpeechSegment}
                disabled={voice.currentSpeechSegment === 0}
                title="Retroceder lectura"
              >
                <SkipBack size={16} aria-hidden="true" />
              </button>
              <label>
                <span>
                  Bloque {voice.currentSpeechSegment + 1}/{voice.speechSegments.length}
                </span>
                <input
                  aria-label="Progreso de lectura"
                  type="range"
                  min={0}
                  max={Math.max(voice.speechSegments.length - 1, 0)}
                  step={1}
                  value={voice.currentSpeechSegment}
                  onChange={(event) => voice.seekSpeechSegment(Number(event.target.value))}
                />
              </label>
              <button
                className="voice-icon-button"
                type="button"
                onClick={voice.nextSpeechSegment}
                disabled={voice.currentSpeechSegment >= voice.speechSegments.length - 1}
                title="Avanzar lectura"
              >
                <SkipForward size={16} aria-hidden="true" />
              </button>
              <button className="voice-icon-button" type="button" onClick={voice.stopSpeaking} disabled={!voice.isSpeaking} title="Detener lectura">
                <Pause size={16} aria-hidden="true" />
              </button>
              <button className="voice-icon-button" type="button" onClick={voice.resumeSpeaking} disabled={voice.isSpeaking} title="Continuar lectura">
                <Play size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="voice-teleprompter" aria-live="polite">
              <div className="voice-current-line">
                <span>{voice.isSpeaking ? "Leyendo ahora" : "Lectura pausada"}</span>
                <p>{voice.currentSpeechText}</p>
              </div>
              <div className="voice-digest" aria-label="Sintesis del analisis">
                {voice.speechDigest.map((item, index) => (
                  <button
                    key={`${item}-${index}`}
                    className={index === voice.currentSpeechSegment ? "active" : ""}
                    type="button"
                    onClick={() => voice.seekSpeechSegment(index)}
                  >
                    <span>{index + 1}</span>
                    {item}
                  </button>
                ))}
              </div>
              {summary ? <VoiceAnalysisTables summary={summary} seasonRows={seasonRows} /> : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

type VoiceSeasonRow = {
  season: string;
  matches: number;
  goals: number;
  average: number;
};

function VoiceAnalysisTables({ summary, seasonRows }: { summary: ThreeSeasonSummary; seasonRows: VoiceSeasonRow[] }) {
  return (
    <div className="voice-analysis-tables" aria-label="Tablas del analisis de voz">
      <div className="voice-mini-table">
        <div className="voice-table-title">
          <span>Temporadas</span>
          <strong>{summary.matches} partidos encontrados</strong>
        </div>
        <div className="voice-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Temporada</th>
                <th>Partidos</th>
                <th>Goles</th>
                <th>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {seasonRows.length > 0 ? (
                seasonRows.map((row) => (
                  <tr key={row.season}>
                    <td>{formatSeason(row.season)}</td>
                    <td>{row.matches}</td>
                    <td>{row.goals}</td>
                    <td>{row.average.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Sin resultados directos cargados por temporada</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="voice-mini-table">
        <div className="voice-table-title">
          <span>Goles</span>
          <strong>Resumen del cruce</strong>
        </div>
        <div className="voice-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total goles</td>
                <td>{summary.total_goals}</td>
              </tr>
              <tr>
                <td>Promedio por partido</td>
                <td>{summary.goals_per_match}</td>
              </tr>
              <tr>
                <td>Under 2.5</td>
                <td>{formatCountAndPercentage(summary.under_25_matches, summary.under_25_percentage)}</td>
              </tr>
              <tr>
                <td>Over 2.5</td>
                <td>{formatCountAndPercentage(summary.over_25_matches, summary.over_25_percentage)}</td>
              </tr>
              <tr>
                <td>Varianza</td>
                <td>{summary.goals_variance ?? "n/d"}</td>
              </tr>
              <tr>
                <td>Desviacion tipica</td>
                <td>{summary.goals_standard_deviation ?? "n/d"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {summary.direct_matches && summary.direct_matches.length > 0 ? (
        <div className="voice-mini-table voice-results-table">
          <div className="voice-table-title">
            <span>Resultados</span>
            <strong>Casa y fuera</strong>
          </div>
          <div className="voice-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Temporada</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {summary.direct_matches.map((match) => (
                  <tr key={match.id}>
                    <td>{formatDate(match.match_date)}</td>
                    <td>{formatSeason(match.season)}</td>
                    <td>{formatResult(match)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildSeasonRows(summary: ThreeSeasonSummary | null): VoiceSeasonRow[] {
  if (!summary?.direct_matches) {
    return [];
  }
  const grouped = new Map<string, VoiceSeasonRow>();
  for (const match of summary.direct_matches) {
    const goals = (match.home_score ?? 0) + (match.away_score ?? 0);
    const row = grouped.get(match.season) ?? { season: match.season, matches: 0, goals: 0, average: 0 };
    row.matches += 1;
    row.goals += goals;
    row.average = row.matches > 0 ? row.goals / row.matches : 0;
    grouped.set(match.season, row);
  }
  return Array.from(grouped.values()).sort((left, right) => right.season.localeCompare(left.season));
}

function formatCountAndPercentage(count?: number, percentage?: number) {
  if (count == null && percentage == null) {
    return "n/d";
  }
  if (percentage == null) {
    return `${count ?? 0}`;
  }
  return `${count ?? 0} (${percentage}%)`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatSeason(value: string) {
  const match = value.match(/(\d{2})(\d{2})\D+(\d{2})(\d{2})/);
  if (!match) {
    return value;
  }
  return `${match[2]}-${match[4]}`;
}

function formatResult(match: DirectMatchResult) {
  const homeScore = match.home_score ?? "-";
  const awayScore = match.away_score ?? "-";
  return `${match.home_team} ${homeScore} - ${match.away_team} ${awayScore}`;
}
