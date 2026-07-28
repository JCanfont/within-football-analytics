import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MatchTable } from "./MatchTable";

describe("MatchTable", () => {
  it("distinguishes empty imports from empty filter results", () => {
    const onSelectMatch = vi.fn();

    const { rerender } = render(
      <MatchTable matches={[]} totalMatches={0} isLoading={false} selectedMatchId={null} onSelectMatch={onSelectMatch} />,
    );

    expect(screen.getByText("No hay partidos importados todavia.")).toBeInTheDocument();

    rerender(
      <MatchTable matches={[]} totalMatches={12} isLoading={false} selectedMatchId={null} onSelectMatch={onSelectMatch} />,
    );

    expect(screen.getByText("No hay partidos con estos filtros.")).toBeInTheDocument();
  });

  it("can render a collapsed state for very large match lists", () => {
    const onSelectMatch = vi.fn();

    render(
      <MatchTable
        matches={[
          {
            id: 1,
            match_date: "2026-08-15T19:30:00+00:00",
            competition: "LaLiga",
            competition_type: "domestic_league",
            season: "2026/2027",
            home_team: "Getafe",
            away_team: "Osasuna",
            status: "finished",
            is_friendly: false,
          },
        ]}
        totalMatches={1140}
        isLoading={false}
        selectedMatchId={null}
        isCollapsed
        onSelectMatch={onSelectMatch}
      />,
    );

    expect(screen.getByText(/Lista plegada: 1 partidos visibles de 1140 cargados/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("limits very large expanded lists and explains the visible slice", () => {
    const onSelectMatch = vi.fn();
    const matches = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      match_date: "2026-08-15T19:30:00+00:00",
      competition: "LaLiga",
      competition_type: "domestic_league",
      season: "2026/2027",
      home_team: `Local ${index + 1}`,
      away_team: `Visitante ${index + 1}`,
      status: "finished",
      is_friendly: false,
    }));

    render(<MatchTable matches={matches} totalMatches={35613} isLoading={false} selectedMatchId={null} onSelectMatch={onSelectMatch} />);

    expect(screen.getByText("Mostrando los primeros 100 de 101 partidos visibles. Usa filtros para acotar la busqueda.")).toBeInTheDocument();
    expect(screen.getByText("Local 100")).toBeInTheDocument();
    expect(screen.queryByText("Local 101")).not.toBeInTheDocument();
  });
});
