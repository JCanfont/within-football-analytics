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

    expect(screen.getByText(/Lista plegada: 1 partidos visibles/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
