import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { fetchNewsHeadlines } from "../services/api";
import type { NewsHeadline, NewsHeadlinesResult } from "../types/api";

const SOURCE_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "marca", label: "Marca" },
  { id: "sport", label: "Sport" },
  { id: "as", label: "AS" },
  { id: "mundo_deportivo", label: "Mundo Deportivo" },
  { id: "athletic", label: "The Athletic" },
] as const;

type SourceFilter = (typeof SOURCE_FILTERS)[number]["id"];

export function NewsPage() {
  const [data, setData] = useState<NewsHeadlinesResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  async function loadHeadlines(refresh = false) {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const result = await fetchNewsHeadlines({ limitPerSource: 12, refresh });
      setData(result);
      if (result.status === "request_failed") {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las noticias.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadHeadlines(false);
  }, []);

  const headlines = useMemo(() => {
    const items = data?.headlines ?? [];
    if (sourceFilter === "all") {
      return items;
    }
    return items.filter((item) => item.source === sourceFilter);
  }, [data, sourceFilter]);

  return (
    <section className="news-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Prensa deportiva</p>
          <h1>Noticias</h1>
          <p className="page-subtitle">
            Titulares de Marca, Sport, AS, Mundo Deportivo y The Athletic.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={isLoading || isRefreshing}
          onClick={() => void loadHeadlines(true)}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {isRefreshing ? "Actualizando" : "Capturar titulares"}
        </button>
      </header>

      {error ? <EmptyState title="Noticias no disponibles" message={error} /> : null}

      <section className="panel news-panel">
        <div className="panel-heading">
          <div>
            <h2>Titulares de fútbol</h2>
            <p>{data?.message ?? "Cargando feeds RSS de los cinco medios."}</p>
          </div>
          <Newspaper size={19} aria-hidden="true" />
        </div>

        <div className="news-toolbar" role="toolbar" aria-label="Filtro por medio">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={sourceFilter === filter.id ? "news-filter active" : "news-filter"}
              onClick={() => setSourceFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {data ? (
          <div className="news-source-status" aria-label="Estado por medio">
            {data.sources.map((source) => (
              <span
                key={source.source}
                className={`news-source-chip news-source-${source.status}`}
                title={source.message}
              >
                {source.source_label}: {source.status === "ok" ? source.headlines.length : source.status}
              </span>
            ))}
            {data.fetched_at ? (
              <span className="news-fetched-at">Actualizado {formatDateTime(data.fetched_at)}</span>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div className="detail-state">Cargando titulares...</div>
        ) : headlines.length === 0 ? (
          <div className="detail-state">No hay titulares para este filtro.</div>
        ) : (
          <div className="news-list">
            {headlines.map((item) => (
              <NewsRow key={`${item.source}-${item.url}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function NewsRow({ item }: { item: NewsHeadline }) {
  return (
    <article className="news-row">
      <div className="news-row-meta">
        <span className={`news-source-badge source-${item.source}`}>{item.source_label}</span>
        {item.published_at ? <time dateTime={item.published_at}>{formatDateTime(item.published_at)}</time> : null}
      </div>
      <a className="news-title-link" href={item.url} target="_blank" rel="noreferrer">
        <strong>{item.title}</strong>
        <ExternalLink size={15} aria-hidden="true" />
      </a>
      {item.summary ? <p>{item.summary}</p> : null}
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
