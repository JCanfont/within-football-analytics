import { useEffect, useState } from "react";
import { fetchMatchInsight } from "../services/api";
import type { MatchInsightData } from "../types/api";

type MatchInsightState = {
  data: MatchInsightData | null;
  isLoading: boolean;
  error: string | null;
};

export function useMatchInsight(matchId: number | null): MatchInsightState {
  const [state, setState] = useState<MatchInsightState>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!matchId) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let isMounted = true;
    setState({ data: null, isLoading: true, error: null });

    fetchMatchInsight(matchId)
      .then((data) => {
        if (isMounted) {
          setState({ data, isLoading: false, error: null });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({
            data: null,
            isLoading: false,
            error: "No se pudo cargar el detalle analitico del partido.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [matchId]);

  return state;
}
