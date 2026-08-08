import { BarChart3, Bell, Building2, CalendarDays, DatabaseZap, Gauge, Goal, HelpCircle, ListChecks, Radio, SearchCheck, Settings, Shield, Scale, Trophy, UsersRound } from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AlertsPage } from "./pages/AlertsPage";
import { CompetitionsPage, TeamsPage } from "./pages/CatalogPages";
import { ContraPage } from "./pages/ContraPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FloorPlanPage } from "./pages/FloorPlanPage";
import { ForebetPage } from "./pages/ForebetPage";
import { ForebetStatsPage } from "./pages/ForebetStatsPage";
import { FlashscorePage } from "./pages/FlashscorePage";
import { ImportsPage } from "./pages/ImportsPage";
import { LiveMatchesPage } from "./pages/LiveMatchesPage";
import { PlayersPage } from "./pages/PlayersPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { SettingsPage } from "./pages/SettingsPage";

const navigation = [
  { label: "Dashboard", icon: Gauge, path: "/" },
  { label: "Partidos en directo", icon: CalendarDays, path: "/live-matches" },
  { label: "Competiciones", icon: Trophy, path: "/competitions" },
  { label: "Equipos", icon: Shield, path: "/teams" },
  { label: "Jugadores", icon: UsersRound, path: "/players" },
  { label: "Forebet", icon: SearchCheck, path: "/forebet" },
  { label: "Estadisticas Forebet", icon: BarChart3, path: "/forebet-stats" },
  { label: "Flashscore", icon: Radio, path: "/flashscore" },
  { label: "A la contra", icon: Scale, path: "/contra" },
  { label: "Preguntas", icon: HelpCircle, path: "/questions" },
  { label: "AutoCAD plano", icon: Building2, path: "/floor-plan" },
  { label: "Importaciones", icon: DatabaseZap, path: "/imports" },
  { label: "Alertas", icon: Bell, path: "/alerts" },
  { label: "Configuracion", icon: Settings, path: "/settings" },
];

export default function App() {
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
            return (
              <NavLink
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                end={item.path === "/"}
                key={item.path}
                to={item.path}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <ListChecks size={18} aria-hidden="true" />
          <span>Fase 12 importaciones</span>
        </div>
      </aside>

      <main className="main-panel">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/live-matches" element={<LiveMatchesPage />} />
          <Route path="/competitions" element={<CompetitionsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/forebet" element={<ForebetPage />} />
          <Route path="/forebet-stats" element={<ForebetStatsPage />} />
          <Route path="/flashscore" element={<FlashscorePage />} />
          <Route path="/contra" element={<ContraPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/floor-plan" element={<FloorPlanPage />} />
          <Route path="/imports" element={<ImportsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
