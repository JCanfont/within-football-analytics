import { Bell, CalendarDays, DatabaseZap, Gauge, Goal, HelpCircle, ListChecks, SearchCheck, Settings, Shield, Scale, Trophy, UsersRound } from "lucide-react";
import { useState } from "react";
import { AlertsPage } from "./pages/AlertsPage";
import { CompetitionsPage, TeamsPage } from "./pages/CatalogPages";
import { ContraPage } from "./pages/ContraPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForebetPage } from "./pages/ForebetPage";
import { ImportsPage } from "./pages/ImportsPage";
import { LiveMatchesPage } from "./pages/LiveMatchesPage";
import { PlayersPage } from "./pages/PlayersPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { SettingsPage } from "./pages/SettingsPage";

const navigation = [
  { label: "Dashboard", icon: Gauge, view: "dashboard" },
  { label: "Partidos en directo", icon: CalendarDays, view: "live-matches" },
  { label: "Competiciones", icon: Trophy, view: "competitions" },
  { label: "Equipos", icon: Shield, view: "teams" },
  { label: "Jugadores", icon: UsersRound, view: "players" },
  { label: "Forebet", icon: SearchCheck, view: "forebet" },
  { label: "A la contra", icon: Scale, view: "contra" },
  { label: "Preguntas", icon: HelpCircle, view: "questions" },
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
        ) : activeView === "contra" ? (
          <ContraPage />
        ) : activeView === "questions" ? (
          <QuestionsPage />
        ) : activeView === "imports" ? (
          <ImportsPage />
        ) : activeView === "players" ? (
          <PlayersPage />
        ) : activeView === "live-matches" ? (
          <LiveMatchesPage />
        ) : activeView === "competitions" ? (
          <CompetitionsPage />
        ) : activeView === "teams" ? (
          <TeamsPage />
        ) : (
          <DashboardPage />
        )}
      </main>
    </div>
  );
}
