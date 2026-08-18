import type { PlannedFixture } from "../types/floorPlan";

type Props = {
  fixtures: PlannedFixture[];
  mm: (meters: number) => number;
};

function box(
  mm: (m: number) => number,
  rect: PlannedFixture["rect"],
): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  const x = mm(rect.x);
  const y = mm(rect.y);
  const w = mm(rect.w);
  const h = mm(rect.h);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

export function FloorPlanFixtures({ fixtures, mm }: Props) {
  return (
    <g className="fp-fixtures" aria-hidden="true">
      {fixtures.map((fixture) => {
        const b = box(mm, fixture.rect);
        switch (fixture.kind) {
          case "cama":
            return (
              <g key={fixture.id} className="fp-fix-bed">
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#f8fafc" stroke="#475569" strokeWidth={0.9} />
                {/* headboard */}
                <rect x={b.x} y={b.y} width={b.w} height={Math.max(2.5, b.h * 0.12)} fill="#cbd5e1" stroke="#475569" strokeWidth={0.6} />
                {/* pillows */}
                <rect
                  x={b.x + b.w * 0.08}
                  y={b.y + b.h * 0.16}
                  width={b.w * 0.35}
                  height={b.h * 0.18}
                  fill="#e2e8f0"
                  stroke="#64748b"
                  strokeWidth={0.5}
                />
                <rect
                  x={b.x + b.w * 0.55}
                  y={b.y + b.h * 0.16}
                  width={b.w * 0.35}
                  height={b.h * 0.18}
                  fill="#e2e8f0"
                  stroke="#64748b"
                  strokeWidth={0.5}
                />
                <text x={b.cx} y={b.cy + b.h * 0.28} textAnchor="middle" className="fp-fixture-label">
                  {fixture.label}
                </text>
              </g>
            );
          case "mesilla":
          case "armario":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#64748b" strokeWidth={0.7} />
                {fixture.kind === "armario" ? (
                  <line x1={b.cx} y1={b.y + 1} x2={b.cx} y2={b.y + b.h - 1} stroke="#94a3b8" strokeWidth={0.5} />
                ) : null}
                <text x={b.cx} y={b.cy + 1.5} textAnchor="middle" className="fp-fixture-label">
                  {fixture.kind === "armario" ? "Arm." : "Mes."}
                </text>
              </g>
            );
          case "encimera":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ecfdf5" stroke="#047857" strokeWidth={0.9} />
                <text x={b.cx} y={b.cy + 1.5} textAnchor="middle" className="fp-fixture-label">
                  Encimera
                </text>
              </g>
            );
          case "frigorifico":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#e0f2fe" stroke="#0369a1" strokeWidth={0.9} />
                <line x1={b.x + 1.5} y1={b.cy} x2={b.x + b.w - 1.5} y2={b.cy} stroke="#0369a1" strokeWidth={0.6} />
                <text x={b.cx} y={b.cy + b.h * 0.28} textAnchor="middle" className="fp-fixture-label">
                  FRIGO
                </text>
              </g>
            );
          case "fregadero":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#0f766e" strokeWidth={0.8} />
                <ellipse cx={b.cx - b.w * 0.18} cy={b.cy} rx={b.w * 0.18} ry={b.h * 0.28} fill="none" stroke="#0f766e" strokeWidth={0.7} />
                <ellipse cx={b.cx + b.w * 0.18} cy={b.cy} rx={b.w * 0.18} ry={b.h * 0.28} fill="none" stroke="#0f766e" strokeWidth={0.7} />
              </g>
            );
          case "placa":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#334155" strokeWidth={0.8} />
                <circle cx={b.cx - b.w * 0.22} cy={b.cy - b.h * 0.18} r={Math.min(b.w, b.h) * 0.14} fill="none" stroke="#334155" strokeWidth={0.6} />
                <circle cx={b.cx + b.w * 0.22} cy={b.cy - b.h * 0.18} r={Math.min(b.w, b.h) * 0.14} fill="none" stroke="#334155" strokeWidth={0.6} />
                <circle cx={b.cx - b.w * 0.22} cy={b.cy + b.h * 0.18} r={Math.min(b.w, b.h) * 0.14} fill="none" stroke="#334155" strokeWidth={0.6} />
                <circle cx={b.cx + b.w * 0.22} cy={b.cy + b.h * 0.18} r={Math.min(b.w, b.h) * 0.14} fill="none" stroke="#334155" strokeWidth={0.6} />
              </g>
            );
          case "lavadora":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#475569" strokeWidth={0.8} />
                <circle cx={b.cx} cy={b.cy} r={Math.min(b.w, b.h) * 0.28} fill="none" stroke="#475569" strokeWidth={0.7} />
                <text x={b.cx} y={b.y + b.h - 1.5} textAnchor="middle" className="fp-fixture-label">
                  LV
                </text>
              </g>
            );
          case "inodoro":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h * 0.28} fill="#fff" stroke="#0e7490" strokeWidth={0.7} />
                <ellipse cx={b.cx} cy={b.y + b.h * 0.62} rx={b.w * 0.38} ry={b.h * 0.28} fill="#fff" stroke="#0e7490" strokeWidth={0.7} />
              </g>
            );
          case "lavabo":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#0e7490" strokeWidth={0.7} />
                <ellipse cx={b.cx} cy={b.cy} rx={b.w * 0.32} ry={b.h * 0.28} fill="none" stroke="#0e7490" strokeWidth={0.7} />
              </g>
            );
          case "ducha":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ecfeff" stroke="#0e7490" strokeWidth={0.9} />
                <line x1={b.x} y1={b.y} x2={b.x + b.w} y2={b.y + b.h} stroke="#67e8f9" strokeWidth={0.6} />
                <line x1={b.x + b.w} y1={b.y} x2={b.x} y2={b.y + b.h} stroke="#67e8f9" strokeWidth={0.6} />
                <circle cx={b.x + b.w * 0.78} cy={b.y + b.h * 0.22} r={Math.min(b.w, b.h) * 0.08} fill="none" stroke="#0e7490" strokeWidth={0.6} />
                <text x={b.cx} y={b.cy + 1.5} textAnchor="middle" className="fp-fixture-label">
                  Ducha
                </text>
              </g>
            );
          case "banera":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(b.h, b.w) * 0.2} fill="#ecfeff" stroke="#0e7490" strokeWidth={0.9} />
                <ellipse cx={b.cx} cy={b.cy} rx={b.w * 0.38} ry={b.h * 0.28} fill="none" stroke="#0e7490" strokeWidth={0.6} />
                <text x={b.cx} y={b.cy + 1.5} textAnchor="middle" className="fp-fixture-label">
                  Bañera
                </text>
              </g>
            );
          case "sofa":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#57534e" strokeWidth={0.8} />
                <rect x={b.x} y={b.y} width={b.w} height={b.h * 0.28} fill="#e7e5e4" stroke="#57534e" strokeWidth={0.5} />
                <text x={b.cx} y={b.cy + b.h * 0.2} textAnchor="middle" className="fp-fixture-label">
                  Sofá
                </text>
              </g>
            );
          case "mesa_comedor":
            return (
              <g key={fixture.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" stroke="#57534e" strokeWidth={0.8} />
                <text x={b.cx} y={b.cy + 1.5} textAnchor="middle" className="fp-fixture-label">
                  Mesa
                </text>
              </g>
            );
          case "silla":
            return (
              <rect
                key={fixture.id}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill="#fff"
                stroke="#a8a29e"
                strokeWidth={0.6}
              />
            );
          default:
            return null;
        }
      })}
    </g>
  );
}
