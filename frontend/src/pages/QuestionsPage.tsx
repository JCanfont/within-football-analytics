import { BarChart3, HelpCircle, SendHorizonal } from "lucide-react";
import { FormEvent, useState } from "react";
import { askStatisticalQuestion } from "../services/api";
import type { StatisticalQuestionAnswer, StreakSummary } from "../types/api";

export function QuestionsPage() {
  const [question, setQuestion] = useState("Cuantos partidos seguidos lleva Getafe con under 2,5?");
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
            <p>Rachas under/over 2,5 por equipo o sobre toda la base cargada.</p>
          </div>
        </div>
        <form className="question-form" onSubmit={submitQuestion}>
          <label>
            <HelpCircle size={18} aria-hidden="true" />
            <input
              aria-label="Pregunta estadistica"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ejemplo: cuantos under 2,5 seguidos lleva Getafe"
            />
          </label>
          <button className="primary-action" type="submit" disabled={isLoading || !question.trim()}>
            <SendHorizonal size={17} aria-hidden="true" />
            {isLoading ? "Consultando..." : "Preguntar"}
          </button>
        </form>
        <div className="question-examples">
          <button type="button" onClick={() => setQuestion("Cuantos partidos seguidos lleva Celta con under 2,5?")}>
            Celta under 2,5
          </button>
          <button type="button" onClick={() => setQuestion("Cuantos over 2,5 seguidos lleva Valencia?")}>
            Valencia over 2,5
          </button>
          <button type="button" onClick={() => setQuestion("Racha under y over 2,5 de todos los partidos")}>
            Toda la base
          </button>
        </div>
      </section>

      <section className="panel question-answer-panel">
        <div className="panel-heading">
          <div>
            <h2>Respuesta</h2>
            <p>{answer ? `${answer.sample_size} partidos usados en el calculo` : "La respuesta aparecera aqui."}</p>
          </div>
          <BarChart3 size={20} aria-hidden="true" />
        </div>
        {error ? <div className="detail-state">{error}</div> : null}
        {!answer && !error ? <div className="detail-state">Haz una pregunta para calcular rachas estadisticas.</div> : null}
        {answer ? <QuestionAnswer answer={answer} /> : null}
      </section>
    </section>
  );
}

function QuestionAnswer({ answer }: { answer: StatisticalQuestionAnswer }) {
  return (
    <div className="question-answer">
      <div className="question-answer-text">
        <span>{answer.scope}</span>
        <strong>{answer.answer}</strong>
      </div>
      <div className="question-streak-grid">
        <StreakCard title="Under 2,5" streak={answer.under_25} />
        <StreakCard title="Over 2,5" streak={answer.over_25} />
      </div>
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
              <tr key={match.match_id}>
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
    </div>
  );
}

function StreakCard({ streak, title }: { streak: StreakSummary; title: string }) {
  return (
    <div className="question-streak-card">
      <span>{title}</span>
      <strong>{streak.current} actual</strong>
      <small>
        Maxima {streak.maximum} · Total {streak.total} · {streak.percentage}%
      </small>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatSignal(value: string) {
  return value === "over_2_5" ? "Over 2,5" : "Under 2,5";
}
