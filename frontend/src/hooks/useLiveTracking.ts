import { useEffect, useState } from "react";
import type { LiveTrackingSettings } from "../types/api";
import {
  fetchLiveTrackingSettings,
  setGlobalLiveTracking,
  setMatchLiveTracking,
  updateLiveTrackingSettings,
} from "../services/api";

const fallbackSettings: LiveTrackingSettings = {
  follow_all_by_default: false,
  tracked_match_ids: [],
  refresh_seconds: 60,
  alert_level: "normal",
};

export function useLiveTracking() {
  const [settings, setSettings] = useState<LiveTrackingSettings>(fallbackSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchLiveTrackingSettings()
      .then((value) => {
        if (isMounted) {
          setSettings(value);
          setError(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("No se pudo cargar la configuracion de directo.");
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

  async function toggleGlobal(enabled: boolean) {
    return persist(() => setGlobalLiveTracking(enabled));
  }

  async function toggleMatch(matchId: number, enabled: boolean) {
    return persist(() => setMatchLiveTracking(matchId, enabled));
  }

  async function updateSettings(next: LiveTrackingSettings) {
    return persist(() => updateLiveTrackingSettings(next));
  }

  async function persist(action: () => Promise<LiveTrackingSettings>) {
    setIsSaving(true);
    try {
      const next = await action();
      setSettings(next);
      setError(null);
    } catch {
      setError("No se pudo guardar el seguimiento en directo.");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    settings,
    isLoading,
    isSaving,
    error,
    toggleGlobal,
    toggleMatch,
    updateSettings,
  };
}
