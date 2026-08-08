import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FloorPlanPage } from "./FloorPlanPage";

describe("FloorPlanPage", () => {
  it("walks the questionnaire and renders a technical plan", () => {
    render(
      <MemoryRouter>
        <FloorPlanPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Plano técnico descriptivo" })).toBeInTheDocument();
    expect(screen.getByText("Indica si la finca es rústica o urbana.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Rústica/i }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    expect(screen.getByText(/Selecciona si es local/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Vivienda aislada/i }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    fireEvent.click(screen.getByRole("button", { name: /Una planta/i }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    // Surface
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Bathrooms
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Bedrooms
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Orientation (default already sur)
    fireEvent.click(screen.getByRole("button", { name: /surOrientación principal/i }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Windows
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Hallways
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    // Doors
    expect(screen.getByText(/Incluye obligatoriamente la entrada a la vivienda/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));

    expect(screen.getByRole("img", { name: /Plano técnico/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Memoria descriptiva/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar AutoCAD \(\.dxf\)/i })).toBeInTheDocument();
    expect(screen.getByText("DXF AC1024")).toBeInTheDocument();
  });
});
