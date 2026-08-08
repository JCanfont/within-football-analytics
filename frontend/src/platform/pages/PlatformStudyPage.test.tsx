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
    expect(screen.getByRole("heading", { name: /Modelo arquitectónico paramétrico/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Planos 2D \(desde modelo\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Optimizador de diseño/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Visor 3D y Render/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Estructura preliminar/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Instalaciones MEP preliminares/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar IFC4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar DXF/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar STRUCT JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar MEP JSON/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Objetivo de optimización/i), {
      target: { value: "maximize_courtyard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar recomendada/i }));
    fireEvent.click(screen.getByRole("button", { name: /Lanzar RenderJob/i }));
    expect(screen.getByText(/job_id/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Vincular análisis \+ envolvente \+ massing \+ optimización \+ BIM \+ planos \+ render \+ estructura \+ MEP al escenario/i,
      }),
    );
    expect(screen.getAllByText("ua-fixture-cat-001").length).toBeGreaterThan(0);
    expect(screen.getByText(/plan_set_id/i)).toBeInTheDocument();
    expect(screen.getByText(/optimization_id/i)).toBeInTheDocument();
    expect(screen.getByText(/render_job_id/i)).toBeInTheDocument();
    expect(screen.getAllByText(/structural_model_id/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mep_model_id/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Abrir planos \/ AutoCAD DXF/i })).toHaveAttribute(
      "href",
      "/floor-plan",
    );
  });
});
