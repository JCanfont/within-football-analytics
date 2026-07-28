import { Bell, CalendarDays, DatabaseZap, Gauge, Goal, ListChecks, SearchCheck, Settings, Shield, Trophy, UsersRound } from "lucide-react";
import { useState } from "react";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForebetPage } from "./pages/ForebetPage";
import { ImportsPage } from "./pages/ImportsPage";
import { PlayersPage } from "./pages/PlayersPage";
import { SettingsPage } from "./pages/SettingsPage";

const navigation = [
  { label: "Dashboard", icon: Gauge, view: "dashboard" },
  { label: "Partidos", icon: CalendarDays },
  { label: "Competiciones", icon: Trophy },
  { label: "Equipos", icon: Shield },
  { label: "Jugadores", icon: UsersRound, view: "players" },
  { label: "Forebet", icon: SearchCheck, view: "forebet" },
  { label: "Importaciones", icon: DatabaseZap, view: "imports" },
  { label: "Alertas", icon: Bell, view: "alerts" },
  { label: "Configuracion", icon: Settings, view: "settings" },
];

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">
            <Goal size={22} aria-hidden="true" />
          </div>
          <div>
            <strong>WITHIN</strong>
            <span>Football Analytics</span>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.view === activeView || (!item.view && activeView === "dashboard" && item.label === "Dashboard");
            return (
              <button
                className={isActive ? "nav-item active" : "nav-item"}
                key={item.label}
                type="button"
                onClick={() => item.view && setActiveView(item.view)}
                disabled={!item.view}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <ListChecks size={18} aria-hidden="true" />
          <span>Fase 12 importaciones</span>
        </div>
      </aside>

      <main className="main-panel">
        {activeView === "settings" ? (
          <SettingsPage />
        ) : activeView === "alerts" ? (
          <AlertsPage />
        ) : activeView === "forebet" ? (
          <ForebetPage />
        ) : activeView === "imports" ? (
          <ImportsPage />
        ) : activeView === "players" ? (
          <PlayersPage />
        ) : (
          <DashboardPage />
        )}
      </main>
    </div>
  );
}
