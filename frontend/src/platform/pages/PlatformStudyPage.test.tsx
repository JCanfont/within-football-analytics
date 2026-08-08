import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { PlatformStudyPage } from "./PlatformStudyPage";

describe("PlatformStudyPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("analyzes a parcel via contract fixture and links the design scenario", async () => {
    render(
      <MemoryRouter>
        <PlatformStudyPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Estudio de finca" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Analizar parcela/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Panel urbanístico" })).toBeInTheDocument();
    });

    expect(screen.getByText(/Edificabilidad/i)).toBeInTheDocument();
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
    expect(screen.getByText(/Parcela mínima/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vincular análisis al escenario de plano/i }));
    expect(screen.getAllByText("ua-fixture-cat-001").length).toBeGreaterThan(0);
    expect(screen.getByText(/parameters_hash/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir planos \/ AutoCAD DXF/i })).toHaveAttribute(
      "href",
      "/floor-plan",
    );
  });
});
