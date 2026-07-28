import { BadgePercent, Plus, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type ContraStatus = "pending" | "won" | "lost";

type ContraPick = {
  id: string;
  match: string;
  source: string;
  originalPick: string;
  originalOdd: number;
  contraPick: string;
  contraOdd: number;
  status: ContraStatus;
  createdAt: string;
};

const STORAGE_KEY = "within_contra_picks";
const DEFAULT_PICK = "1";
const DEFAULT_CONTRA_PICK = "X2";

export function ContraPage() {
  const [picks, setPicks] = useState<ContraPick[]>(readContraPicks);
  const [match, setMatch] = useState("");
  const [source, setSource] = useState("Forebet");
  const [originalPick, setOriginalPick] = useState(DEFAULT_PICK);
  const [originalOdd, setOriginalOdd] = useState("1.80");
  const [contraPick, setContraPick] = useState(DEFAULT_CONTRA_PICK);
  const [contraOdd, setContraOdd] = useState("2.10");
  const [status, setStatus] = useState<ContraStatus>("pending");

  const summary = useMemo(() => buildContraSummary(picks), [picks]);

  function savePicks(nextPicks: ContraPick[]) {
    setPicks(nextPicks);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPicks));
  }

  function addPick(event: FormEvent) {
    event.preventDefault();
    const parsedOriginalOdd = Number(originalOdd.replace(",", "."));
    const parsedContraOdd = Number(contraOdd.replace(",", "."));
    if (!match.trim() || !originalPick.trim() || !contraPick.trim() || parsedOriginalOdd <= 1 || parsedContraOdd <= 1) {
      return;
    }
    const nextPick: ContraPick = {
      id: crypto.randomUUID(),
      match: match.trim(),
      source: source.trim() || "Manual",
      originalPick: originalPick.trim(),
      originalOdd: parsedOriginalOdd,
      contraPick: contraPick.trim(),
      contraOdd: parsedContraOdd,
      status,
      createdAt: new Date().toISOString(),
    };
    savePicks([nextPick, ...picks]);
    setMatch("");
    setOriginalPick(DEFAULT_PICK);
    setContraPick(DEFAULT_CONTRA_PICK);
    setStatus("pending");
  }

  function removePick(id: string) {
    savePicks(picks.filter((pick) => pick.id !== id));
  }

  return (
    <section className="contra-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Estrategia inversa</p>
          <h1>A la contra</h1>
        </div>
      </header>

      <section className="panel contra-panel">
        <div className="panel-heading">
          <div>
            <h2>Registrar pronostico</h2>
            <p>Compara el impulso original con una entrada contraria a una unidad.</p>
          </div>
          <BadgePercent size={20} aria-hidden="true" />
        </div>
        <form className="contra-form" onSubmit={addPick}>
          <label>
            Partido
            <input value={match} onChange={(event) => setMatch(event.target.value)} placeholder="Valencia - Celta" />
          </label>
          <label>
            Fuente
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Forebet, tipster, impulso..." />
          </label>
          <label>
            Pronostico
            <input value={originalPick} onChange={(event) => setOriginalPick(event.target.value)} placeholder="1, X, 2, over 2.5..." />
          </label>
          <label>
            Cuota pronostico
            <input inputMode="decimal" value={originalOdd} onChange={(event) => setOriginalOdd(event.target.value)} />
          </label>
          <label>
            Contra
            <input value={contraPick} onChange={(event) => setContraPick(event.target.value)} placeholder="X2, under, no marca..." />
          </label>
          <label>
            Cuota contra
            <input inputMode="decimal" value={contraOdd} onChange={(event) => setContraOdd(event.target.value)} />
          </label>
          <label>
            Resultado original
            <select value={status} onChange={(event) => setStatus(event.target.value as ContraStatus)}>
              <option value="pending">Pendiente</option>
              <option value="won">Acerto</option>
              <option value="lost">Fallo</option>
            </select>
          </label>
          <button className="primary-action" type="submit" disabled={!match.trim()}>
            <Plus size={17} aria-hidden="true" />
            Anadir
          </button>
        </form>
      </section>

      <section className="contra-summary-grid">
        <ContraMetric label="Pronosticos" value={summary.total.toString()} />
        <ContraMetric label="Cerrados" value={summary.closed.toString()} />
        <ContraMetric label="Resultado original" value={formatProfit(summary.originalProfit)} />
        <ContraMetric label="Resultado a la contra" value={formatProfit(summary.contraProfit)} tone={summary.contraProfit >= summary.originalProfit ? "good" : "bad"} />
      </section>

      <section className="panel contra-panel">
        <div className="panel-heading">
          <div>
            <h2>Historial</h2>
            <p>{picks.length ? "Lectura comparativa del impulso frente a la contra." : "Todavia no hay pronosticos guardados."}</p>
          </div>
        </div>
        {picks.length ? (
          <div className="table-wrap contra-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Partido</th>
                  <th>Fuente</th>
                  <th>Pronostico</th>
                  <th>Contra</th>
                  <th>Estado</th>
                  <th>Original</th>
                  <th>A la contra</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {picks.map((pick) => (
                  <tr key={pick.id}>
                    <td>{formatDate(pick.createdAt)}</td>
                    <td>
                      <strong>{pick.match}</strong>
                    </td>
                    <td>{pick.source}</td>
                    <td>
                      {pick.originalPick} <span className="table-subtext">@{pick.originalOdd.toFixed(2)}</span>
                    </td>
                    <td>
                      {pick.contraPick} <span className="table-subtext">@{pick.contraOdd.toFixed(2)}</span>
                    </td>
                    <td>{formatStatus(pick.status)}</td>
                    <td>{pick.status === "pending" ? "Pendiente" : formatProfit(originalProfit(pick))}</td>
                    <td>{pick.status === "pending" ? "Pendiente" : formatProfit(contraProfit(pick))}</td>
                    <td>
                      <button className="row-action" type="button" onClick={() => removePick(pick.id)} aria-label={`Eliminar ${pick.match}`}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="detail-state">Anade el primer pronostico para comparar.</div>
        )}
      </section>
    </section>
  );
}

function ContraMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={tone ? `contra-metric ${tone}` : "contra-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildContraSummary(picks: ContraPick[]) {
  const closed = picks.filter((pick) => pick.status !== "pending");
  return {
    total: picks.length,
    closed: closed.length,
    originalProfit: closed.reduce((sum, pick) => sum + originalProfit(pick), 0),
    contraProfit: closed.reduce((sum, pick) => sum + contraProfit(pick), 0),
  };
}

function originalProfit(pick: ContraPick) {
  return pick.status === "won" ? pick.originalOdd - 1 : -1;
}

function contraProfit(pick: ContraPick) {
  return pick.status === "lost" ? pick.contraOdd - 1 : -1;
}

function readContraPicks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as ContraPick[];
  } catch {
    return [];
  }
}

function formatProfit(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} u`;
}

function formatStatus(status: ContraStatus) {
  if (status === "won") {
    return "Acerto";
  }
  if (status === "lost") {
    return "Fallo";
  }
  return "Pendiente";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
