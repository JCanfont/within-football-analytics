import { BarChart3, HelpCircle, SendHorizonal } from "lucide-react";
import { FormEvent, useState } from "react";
import { askStatisticalQuestion } from "../services/api";
import type { QuestionRankingRow, StatisticalQuestionAnswer, StreakSummary } from "../types/api";

const EXAMPLE_QUESTIONS = [
  "Cuales son las ligas que mas y menos goles por partido marcan?",
  "En LaLiga, que equipos disparan mas y menos a puerta?",
  "Que equipos necesitan mas disparos a puerta para marcar un gol?",
  "Que porcentaje de partidos hay un gol despues de una tarjeta roja?",
  "Que equipos tienen mejor y peor ratio vs la temporada anterior en goles y puntos?",
  "En que partidos en vivo llegando al minuto 75 hay menos de 1 disparo a puerta?",
  "Que porcentaje de partidos con cuota inicial 1,50 o inferior acaban con mas de dos goles de diferencia a favor del favorito?",
  "Que liga es la mas y menos tarjetera?",
  "Que jugadores se les da mejor contra un equipo?",
  "Si un partido acaba 0-0, que porcentaje el siguiente de esa competicion no tiene gol en la primera parte?",
  "Cuantos partidos seguidos lleva Getafe con under 2,5?",
];

export function QuestionsPage() {
  const [question, setQuestion] = useState(EXAMPLE_QUESTIONS[0]);
  const [answer, setAnswer] = useState<StatisticalQuestionAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    setIsLoading(true);
    setError(null);
    askStatisticalQuestion(trimmed)
      .then((result) => {
        setAnswer(result);
        setIsLoading(false);
      })
      .catch(() => {
        setError("No se pudo responder la pregunta estadistica.");
        setIsLoading(false);
      });
  };

  return (
    <section className="questions-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Consulta estadistica</p>
          <h1>Preguntas a la base de datos</h1>
        </div>
      </header>

      <section className="panel question-panel">
        <div className="panel-heading">
          <div>
            <h2>Pregunta</h2>
            <p>
              10 plantillas clave + rachas under/over 2,5. Usa stats de partido (tiros, tarjetas, HT, cuotas)
              cuando estan importadas desde Football-Data / incidentes.
            </p>
          </div>
        </div>
        <form className="question-form" onSubmit={submitQuestion}>
          <label>
            <HelpCircle size={18} aria-hidden="true" />
            <input
              aria-label="Pregunta estadistica"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ejemplo: ligas con mas y menos goles por partido"
            />
          </label>
          <button className="primary-action" type="submit" disabled={isLoading || !question.trim()}>
            <SendHorizonal size={17} aria-hidden="true" />
            {isLoading ? "Consultando..." : "Preguntar"}
          </button>
        </form>
        <div className="question-examples">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button key={example} type="button" onClick={() => setQuestion(example)}>
              {shortLabel(example)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel question-answer-panel">
        <div className="panel-heading">
          <div>
            <h2>Respuesta</h2>
            <p>
              {answer
                ? `${answer.sample_size} casos · ${answer.question_type || "consulta"} · ${statusLabel(answer.data_status)}`
                : "La respuesta aparecera aqui."}
            </p>
          </div>
          <BarChart3 size={20} aria-hidden="true" />
        </div>
        {error ? <div className="detail-state">{error}</div> : null}
        {!answer && !error ? <div className="detail-state">Haz una pregunta para calcular estadisticas.</div> : null}
        {answer ? <QuestionAnswer answer={answer} /> : null}
      </section>
    </section>
  );
}

function QuestionAnswer({ answer }: { answer: StatisticalQuestionAnswer }) {
  const showStreaks = (answer.question_type || "under_over_streak") === "under_over_streak"
    && answer.data_status === "ok";
  const rankings = answer.rankings ?? [];
  const missing = answer.missing_requirements ?? [];

  return (
    <div className="question-answer">
      <div className="question-answer-text">
        <span>{answer.scope}</span>
        <strong>{answer.answer}</strong>
      </div>

      {missing.length ? (
        <ul className="question-missing-list">
          {missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {showStreaks ? (
        <div className="question-streak-grid">
          <StreakCard title="Under 2,5" streak={answer.under_25} />
          <StreakCard title="Over 2,5" streak={answer.over_25} />
        </div>
      ) : null}

      {rankings.length ? <RankingsTable rankings={rankings} /> : null}

      {answer.recent_matches.length ? (
        <div className="table-wrap question-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Partido</th>
                <th>Resultado</th>
                <th>Goles</th>
                <th>Senal</th>
              </tr>
            </thead>
            <tbody>
              {answer.recent_matches.map((match) => (
                <tr key={`${match.match_id}-${match.signal}`}>
                  <td>{formatDate(match.match_date)}</td>
                  <td>
                    <strong>{match.home_team}</strong> vs <strong>{match.away_team}</strong>
                  </td>
                  <td>
                    {match.home_score}-{match.away_score}
                  </td>
                  <td>{match.total_goals}</td>
                  <td>{formatSignal(match.signal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function RankingsTable({ rankings }: { rankings: QuestionRankingRow[] }) {
  return (
    <div className="table-wrap question-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Concepto</th>
            <th>Valor</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row) => (
            <tr key={`${row.rank}-${row.label}`}>
              <td>{row.rank}</td>
              <td><strong>{row.label}</strong></td>
              <td>
                {formatValue(row.value)}
                {row.unit ? <span className="table-subtext"> {row.unit}</span> : null}
              </td>
              <td>
                {row.detail || "—"}
                {row.sample_size != null ? <span className="table-subtext"> · n={row.sample_size}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StreakCard({ streak, title }: { streak: StreakSummary; title: string }) {
  const currentText = streak.current_owner ? `${streak.current} actual (${streak.current_owner})` : `${streak.current} actual`;
  const maximumText = streak.maximum_owner ? `Maxima ${streak.maximum} (${streak.maximum_owner})` : `Maxima ${streak.maximum}`;

  return (
    <div className="question-streak-card">
      <span>{title}</span>
      <strong>{currentText}</strong>
      <small>
        {maximumText} · Total {streak.total} · {streak.percentage}%
      </small>
    </div>
  );
}

function shortLabel(value: string) {
  if (value.includes("under 2,5")) return "Racha under 2,5";
  if (value.includes("goles por partido")) return "1. Goles/liga";
  if (value.includes("disparan mas")) return "2. Tiros a puerta";
  if (value.includes("para marcar")) return "3. Tiros/gol";
  if (value.includes("tarjeta roja")) return "4. Gol tras roja";
  if (value.includes("temporada anterior")) return "5. Ratio vs ant.";
  if (value.includes("minuto 75")) return "6. Live 75'";
  if (value.includes("1,50")) return "7. Favorito +2";
  if (value.includes("tarjetera")) return "8. Liga tarjetera";
  if (value.includes("jugadores")) return "9. Jugador vs rival";
  if (value.includes("0-0")) return "10. Tras 0-0";
  return value.slice(0, 28);
}

function statusLabel(value?: string) {
  if (value === "missing_data") return "faltan datos";
  if (value === "partial") return "parcial";
  if (value === "unsupported") return "no soportada";
  return "ok";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatSignal(value: string) {
  if (value === "over_2_5") return "Over 2,5";
  if (value === "under_2_5") return "Under 2,5";
  return value || "—";
}

function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}
