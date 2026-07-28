import { useEffect, useState } from "react";
import { fetchStatisticalConfig, saveStatisticalConfig } from "../services/api";
import type { StatisticalSettings } from "../types/api";

type ConfigState = {
  settings: StatisticalSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  message: string | null;
  error: string | null;
  setSettings: (settings: StatisticalSettings) => void;
  save: () => Promise<void>;
};

export function useStatisticalConfig(): ConfigState {
  const [settings, setSettings] = useState<StatisticalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchStatisticalConfig()
      .then((config) => {
        if (isMounted) {
          setSettings(config.value);
          setError(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("No se pudo cargar la configuracion estadistica.");
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

  async function save() {
    if (!settings) {
      return;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await saveStatisticalConfig(settings);
      setSettings(saved.value);
      setMessage("Configuracion guardada.");
    } catch {
      setError("No se pudo guardar la configuracion.");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    settings,
    isLoading,
    isSaving,
    message,
    error,
    setSettings,
    save,
  };
}
