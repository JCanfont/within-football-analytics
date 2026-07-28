import { useEffect, useState } from "react";
import { fetchAlerts, generateMatchAlerts } from "../services/api";
import type { Alert } from "../types/api";

type AlertsState = {
  alerts: Alert[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  generateForMatch: (matchId: number) => Promise<void>;
};

export function useAlerts(): AlertsState {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchAlerts()
      .then((data) => {
        if (isMounted) {
          setAlerts(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("No se pudieron cargar las alertas.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function generateForMatch(matchId: number) {
    setIsGenerating(true);
    setError(null);
    try {
      await generateMatchAlerts(matchId);
      setAlerts(await fetchAlerts());
    } catch {
      setError("No se pudieron generar alertas para el partido.");
    } finally {
      setIsGenerating(false);
    }
  }

  return { alerts, isLoading, isGenerating, error, generateForMatch };
}
