import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboardData, fetchMatchesWithAnalytics } from "../services/api";
import type { DashboardData } from "../types/api";

type DashboardState = {
  data: DashboardData | null;
  isLoading: boolean;
  isLoadingAnalytics: boolean;
  error: string | null;
  hydrateAnalytics: () => void;
};

type DashboardLoadState = Omit<DashboardState, "hydrateAnalytics">;

export function useDashboardData(): DashboardState {
  const isHydratingRef = useRef(false);
  const isMountedRef = useRef(false);
  const [state, setState] = useState<DashboardLoadState>({
    data: null,
    isLoading: true,
    isLoadingAnalytics: false,
    error: null,
  });

  const loadDashboard = useCallback((showLoading = false) => {
    if (showLoading) {
      setState((current) => ({ ...current, isLoading: true }));
    }
    fetchDashboardData()
      .then((data) => {
        if (isMountedRef.current) {
          setState((current) => ({ ...current, data, isLoading: false, error: null }));
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setState((current) =>
            current.data
              ? current
              : {
                  data: null,
                  isLoading: false,
                  isLoadingAnalytics: false,
                  error: "No se pudo conectar con el backend. Arranca la API o importa datos para ver el panel completo.",
                },
          );
        }
      });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadDashboard(true);
    return () => {
      isMountedRef.current = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!state.error || state.data) {
      return undefined;
    }
    const retry = window.setInterval(() => loadDashboard(false), 3000);
    return () => window.clearInterval(retry);
  }, [loadDashboard, state.data, state.error]);

  const hydrateAnalytics = useCallback(() => {
    if (isHydratingRef.current) {
      return;
    }
    isHydratingRef.current = true;
    setState((current) => {
      return { ...current, isLoadingAnalytics: true };
    });
    fetchMatchesWithAnalytics()
      .then((matchesWithAnalytics) => {
        isHydratingRef.current = false;
        setState((current) => ({
          ...current,
          data: current.data ? { ...current.data, matches: matchesWithAnalytics } : current.data,
          isLoadingAnalytics: false,
        }));
      })
      .catch(() => {
        isHydratingRef.current = false;
        setState((current) => ({ ...current, isLoadingAnalytics: false }));
      });
  }, []);

  return { ...state, hydrateAnalytics };
}
