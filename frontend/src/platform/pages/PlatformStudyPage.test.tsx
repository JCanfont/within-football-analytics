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

    expect(screen.getAllByText(/Edificabilidad/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Envolvente edificable/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Massing paramétrico/i })).toBeInTheDocument();
    expect(screen.getByText(/A · Máximo aprovechamiento/i)).toBeInTheDocument();
    expect(screen.getByText(/B · Patio interior/i)).toBeInTheDocument();
    expect(screen.getByText(/C · Barra compacta/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /B · Patio interior/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Vincular análisis \+ envolvente \+ massing al escenario/i }),
    );
    expect(screen.getAllByText("ua-fixture-cat-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/env-ua-fixture-cat-001/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/mass-study-env-ua-fixture-cat-001/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir planos \/ AutoCAD DXF/i })).toHaveAttribute(
      "href",
      "/floor-plan",
    );
  });
});
