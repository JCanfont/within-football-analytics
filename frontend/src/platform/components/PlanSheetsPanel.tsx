import { Download, FileImage, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadPlanSheetDxf, downloadPlanSheetSvg } from "../services/planSheetDxf";
import type { PlanSet, PlanSheet } from "../types/planSheet";

type Props = {
  planSet: PlanSet;
};

function buildSvgMarkup(sheet: PlanSheet): string {
  const pad = 1.5;
  const minX = sheet.bounds.minX - pad;
  const minY = sheet.bounds.minY - pad;
  const width = sheet.bounds.maxX - sheet.bounds.minX + pad * 2;
  const height = sheet.bounds.maxY - sheet.bounds.minY + pad * 2;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="900" height="640">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    `<g transform="translate(${-minX} ${height + minY}) scale(1 -1)">`,
  ];

  for (const primitive of sheet.primitives) {
    if (primitive.kind === "polyline") {
      const d = primitive.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ")
        .concat(primitive.closed ? " Z" : "");
      parts.push(
        `<path d="${d}" fill="none" stroke="#111827" stroke-width="0.05"${
          primitive.dashed ? ' stroke-dasharray="0.2 0.15"' : ""
        } />`,
      );
    } else if (primitive.kind === "text") {
      parts.push(
        `<g transform="translate(${primitive.at.x} ${primitive.at.y}) scale(1 -1)"><text x="0" y="0" font-size="${
          primitive.height ?? 0.3
        }" fill="#111827" text-anchor="middle">${escapeXml(primitive.text)}</text></g>`,
      );
    } else if (primitive.kind === "dim") {
      const midX = (primitive.a.x + primitive.b.x) / 2;
      const midY = (primitive.a.y + primitive.b.y) / 2;
      parts.push(
        `<line x1="${primitive.a.x}" y1="${primitive.a.y + primitive.offset}" x2="${primitive.b.x}" y2="${
          primitive.b.y + (Math.abs(primitive.a.y - primitive.b.y) < 1e-6 ? primitive.offset : 0)
        }" stroke="#b91c1c" stroke-width="0.04" />`,
      );
      parts.push(
        `<g transform="translate(${midX} ${midY + primitive.offset / 2}) scale(1 -1)"><text x="0" y="0" font-size="0.25" fill="#b91c1c" text-anchor="middle">${escapeXml(
          primitive.label,
        )}</text></g>`,
      );
    } else {
      parts.push(
        `<g transform="translate(${primitive.at.x} ${primitive.at.y}) scale(1 -1)"><text x="0" y="0" font-size="0.25" fill="#0f766e" text-anchor="middle">${escapeXml(
          primitive.label ?? primitive.symbol,
        )}</text></g>`,
      );
    }
  }

  parts.push("</g>");
  parts.push(
    `<text x="12" y="24" font-size="16" fill="#111827" font-family="sans-serif">${escapeXml(
      sheet.title,
    )} · ${sheet.scale}</text>`,
  );
  parts.push("</svg>");
  return parts.join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function PlanSheetSvg({ sheet }: { sheet: PlanSheet }) {
  const pad = 1.5;
  const minX = sheet.bounds.minX - pad;
  const minY = sheet.bounds.minY - pad;
  const width = sheet.bounds.maxX - sheet.bounds.minX + pad * 2;
  const height = sheet.bounds.maxY - sheet.bounds.minY + pad * 2;

  return (
    <svg
      className="plan-sheet-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={sheet.title}
    >
      <rect width="100%" height="100%" fill="#f8fafc" />
      <g transform={`translate(${-minX} ${height + minY}) scale(1 -1)`}>
        {sheet.primitives.map((primitive) => {
          if (primitive.kind === "polyline") {
            const d = primitive.points
              .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
              .join(" ")
              .concat(primitive.closed ? " Z" : "");
            return (
              <path
                key={primitive.id}
                d={d}
                fill="none"
                stroke="#111827"
                strokeWidth={0.05}
                strokeDasharray={primitive.dashed ? "0.2 0.15" : undefined}
              />
            );
          }
          if (primitive.kind === "text") {
            return (
              <g key={primitive.id} transform={`translate(${primitive.at.x} ${primitive.at.y}) scale(1 -1)`}>
                <text x={0} y={0} fontSize={primitive.height ?? 0.3} fill="#111827" textAnchor="middle">
                  {primitive.text}
                </text>
              </g>
            );
          }
          if (primitive.kind === "dim") {
            const midX = (primitive.a.x + primitive.b.x) / 2;
            const midY = (primitive.a.y + primitive.b.y) / 2;
            const horizontal = Math.abs(primitive.a.y - primitive.b.y) < 1e-6;
            return (
              <g key={primitive.id}>
                <line
                  x1={horizontal ? primitive.a.x : primitive.a.x + primitive.offset}
                  y1={horizontal ? primitive.a.y + primitive.offset : primitive.a.y}
                  x2={horizontal ? primitive.b.x : primitive.b.x + primitive.offset}
                  y2={horizontal ? primitive.b.y + primitive.offset : primitive.b.y}
                  stroke="#b91c1c"
                  strokeWidth={0.04}
                />
                <g transform={`translate(${midX} ${midY}) scale(1 -1)`}>
                  <text x={0} y={0} fontSize={0.25} fill="#b91c1c" textAnchor="middle">
                    {primitive.label}
                  </text>
                </g>
              </g>
            );
          }
          return (
            <g key={primitive.id} transform={`translate(${primitive.at.x} ${primitive.at.y}) scale(1 -1)`}>
              <text x={0} y={0} fontSize={0.25} fill="#0f766e" textAnchor="middle">
                {primitive.label ?? primitive.symbol}
              </text>
            </g>
          );
        })}
      </g>
      <text x={12} y={24} fontSize={16} fill="#111827">
        {sheet.title} · {sheet.scale}
      </text>
    </svg>
  );
}

export function PlanSheetsPanel({ planSet }: Props) {
  const [activeId, setActiveId] = useState(planSet.sheets[0]?.id ?? "");
  const activeSheet = useMemo(
    () => planSet.sheets.find((sheet) => sheet.id === activeId) ?? planSet.sheets[0]!,
    [activeId, planSet.sheets],
  );

  return (
    <section className="plan-sheets-panel" aria-label="Planos 2D derivados del modelo">
      <header className="panel-heading">
        <div>
          <h2>
            <Layers size={18} aria-hidden="true" /> Planos 2D (desde modelo)
          </h2>
          <p>{planSet.disclaimer}</p>
        </div>
      </header>

      <div className="plan-sheet-tabs" role="tablist" aria-label="Hojas de plano">
        {planSet.sheets.map((sheet) => (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            aria-selected={sheet.id === activeSheet.id}
            className={sheet.id === activeSheet.id ? "active" : ""}
            onClick={() => setActiveId(sheet.id)}
          >
            {sheet.title}
          </button>
        ))}
      </div>

      <div className="plan-sheet-actions">
        <button type="button" className="primary-action" onClick={() => downloadPlanSheetDxf(activeSheet)}>
          <Download size={16} aria-hidden="true" />
          Exportar DXF
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => downloadPlanSheetSvg(buildSvgMarkup(activeSheet), activeSheet)}
        >
          <FileImage size={16} aria-hidden="true" />
          Exportar SVG
        </button>
      </div>

      <div className="plan-sheet-canvas">
        <PlanSheetSvg sheet={activeSheet} />
      </div>

      <ul className="plan-sheet-notes">
        {activeSheet.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
