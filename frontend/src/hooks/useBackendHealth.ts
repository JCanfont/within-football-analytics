import { useEffect, useState } from "react";
import { fetchBackendHealth } from "../services/api";

export type BackendHealthStatus = "checking" | "connected" | "disconnected" | "updating";

export function useBackendHealth() {
  const [status, setStatus] = useState<BackendHealthStatus>("checking");

  useEffect(() => {
    let isMounted = true;

    async function check() {
      if (localStorage.getItem("within_backend_status") === "updating") {
        if (isMounted) {
          setStatus("updating");
        }
        return;
      }
      const isConnected = await fetchBackendHealth();
      if (isMounted) {
        setStatus(isConnected ? "connected" : "disconnected");
      }
    }

    check();
    const interval = window.setInterval(check, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return status;
}
