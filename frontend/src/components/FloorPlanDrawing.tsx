import type { FloorPlanModel, PlannedOpening, WallSide } from "../types/floorPlan";
import { metersToPaperMm, scaleLabel } from "../utils/floorPlanScale";
import { FloorPlanFixtures } from "./FloorPlanFixtures";

type Props = {
  model: FloorPlanModel;
};

function openingGeometry(
  wall: WallSide,
  offsetM: number,
  openingWidthM: number,
  buildingWidthM: number,
  buildingDepthM: number,
): { x1: number; y1: number; x2: number; y2: number; nx: number; ny: number } {
  if (wall === "norte") {
    return { x1: offsetM, y1: 0, x2: offsetM + openingWidthM, y2: 0, nx: 0, ny: -1 };
  }
  if (wall === "sur") {
    return {
      x1: offsetM,
      y1: buildingDepthM,
      x2: offsetM + openingWidthM,
      y2: buildingDepthM,
      nx: 0,
      ny: 1,
    };
  }
  if (wall === "oeste") {
    return { x1: 0, y1: offsetM, x2: 0, y2: offsetM + openingWidthM, nx: -1, ny: 0 };
  }
  return {
    x1: buildingWidthM,
    y1: offsetM,
    x2: buildingWidthM,
    y2: offsetM + openingWidthM,
    nx: 1,
    ny: 0,
  };
}

function OpeningGlyph({
  opening,
  widthM,
  depthM,
  mm,
}: {
  opening: PlannedOpening;
  widthM: number;
  depthM: number;
  mm: (m: number) => number;
}) {
  const geom = openingGeometry(opening.wall, opening.offsetM, opening.widthM, widthM, depthM);
  const x1 = mm(geom.x1);
  const y1 = mm(geom.y1);
  const x2 = mm(geom.x2);
  const y2 = mm(geom.y2);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  if (opening.type === "ventana") {
    const ox = geom.nx * 3;
    const oy = geom.ny * 3;
    return (
      <g className="fp-window">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111827" strokeWidth={2.2} />
        <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} stroke="#111827" strokeWidth={1} />
        <text x={midX + ox * 3} y={midY + oy * 3} className="fp-annotation">
          {opening.label}
        </text>
      </g>
    );
  }

  const leaf = mm(opening.widthM);
  const hingeX = opening.swing === "right" ? x2 : x1;
  const hingeY = opening.swing === "right" ? y2 : y1;
  let endX = hingeX;
  let endY = hingeY;
  if (opening.wall === "norte" || opening.wall === "sur") {
    endX = hingeX;
    endY = hingeY - geom.ny * leaf;
  } else {
    endX = hingeX - geom.nx * leaf;
    endY = hingeY;
  }
  const leafEndX = opening.swing === "right" ? x1 : x2;
  const leafEndY = opening.swing === "right" ? y1 : y2;
  const sweep = opening.swing === "right" ? 0 : 1;
  const path = `M ${hingeX} ${hingeY} L ${leafEndX} ${leafEndY} A ${leaf} ${leaf} 0 0 ${sweep} ${endX} ${endY}`;

  return (
    <g className="fp-door">
      <path d={path} fill="none" stroke="#0f766e" strokeWidth={1.2} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f8fafc" strokeWidth={3.5} />
      <text x={midX + geom.nx * 10} y={midY + geom.ny * 10} className="fp-annotation door">
        {opening.label}
      </text>
    </g>
  );
}

export function FloorPlanDrawing({ model }: Props) {
  const mm = (meters: number) => metersToPaperMm(meters, model.scale);
  const hasTerrace = model.rooms.some((room) => room.kind === "terraza");
  const margin = 28;
  const titleBlockH = 54;
  const drawingW = mm(model.widthM);
  const drawingH = mm(model.depthM + (hasTerrace ? 1.5 : 0));
  const vbW = drawingW + margin * 2 + 70;
  const vbH = drawingH + margin * 2 + titleBlockH + 36;

  return (
    <svg
      className="floor-plan-svg"
      viewBox={`0 0 ${vbW} ${vbH}`}
      role="img"
      aria-label={`Plano técnico a ${model.scale}: ${model.title}`}
    >
      <rect x={0} y={0} width={vbW} height={vbH} fill="#f8fafc" />
      <g transform={`translate(${margin + 40}, ${margin + 20})`}>
        {/* Outer walls */}
        <rect
          x={0}
          y={0}
          width={drawingW}
          height={mm(model.depthM)}
          fill="#ffffff"
          stroke="#111827"
          strokeWidth={2.8}
        />
        <rect
          x={2.2}
          y={2.2}
          width={drawingW - 4.4}
          height={mm(model.depthM) - 4.4}
          fill="none"
          stroke="#111827"
          strokeWidth={0.7}
        />

        {model.rooms
          .filter((room) => room.kind !== "terraza")
          .map((room) => {
            const x = mm(room.rect.x);
            const y = mm(room.rect.y);
            const w = mm(room.rect.w);
            const h = mm(room.rect.h);
            const fill =
              room.kind === "bano"
                ? "#ecfeff"
                : room.kind === "pasillo" || room.kind === "entrada"
                  ? "#f1f5f9"
                  : room.kind === "escalera"
                    ? "#fef3c7"
                    : room.kind === "cocina"
                      ? "#f0fdf4"
                      : "#ffffff";
            return (
              <g key={room.id}>
                <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#334155" strokeWidth={0.9} />
                <text x={x + w / 2} y={y + 8} textAnchor="middle" className="fp-room-label">
                  {room.label.split("\n")[0]}
                </text>
                {room.label.includes("\n") ? (
                  <text x={x + w / 2} y={y + 15} textAnchor="middle" className="fp-room-sub">
                    {room.label.split("\n")[1]}
                  </text>
                ) : null}
                <text x={x + w / 2} y={y + (room.label.includes("\n") ? 22 : 16)} textAnchor="middle" className="fp-room-area">
                  {room.areaM2.toFixed(1)} m²
                </text>
                {room.kind === "escalera" ? (
                  <>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <line
                        key={`${room.id}-step-${i}`}
                        x1={x + 3}
                        y1={y + 4 + i * ((h - 8) / 5)}
                        x2={x + w - 3}
                        y2={y + 4 + i * ((h - 8) / 5)}
                        stroke="#92400e"
                        strokeWidth={0.6}
                      />
                    ))}
                  </>
                ) : null}
              </g>
            );
          })}

        <FloorPlanFixtures fixtures={model.fixtures} mm={mm} />

        {hasTerrace
          ? model.rooms
              .filter((room) => room.kind === "terraza")
              .map((room) => (
                <g key={room.id}>
                  <rect
                    x={mm(room.rect.x)}
                    y={mm(room.rect.y)}
                    width={mm(room.rect.w)}
                    height={mm(room.rect.h)}
                    fill="#ecfccb"
                    stroke="#3f6212"
                    strokeWidth={0.8}
                    strokeDasharray="3 2"
                  />
                  <text
                    x={mm(room.rect.x + room.rect.w / 2)}
                    y={mm(room.rect.y + room.rect.h / 2)}
                    textAnchor="middle"
                    className="fp-room-label"
                  >
                    {room.label}
                  </text>
                </g>
              ))
          : null}

        {model.openings.map((opening) => (
          <OpeningGlyph
            key={opening.id}
            opening={opening}
            widthM={model.widthM}
            depthM={model.depthM}
            mm={mm}
          />
        ))}

        {/* Overall dimensions */}
        <g className="fp-dims">
          <line x1={0} y1={-12} x2={drawingW} y2={-12} stroke="#0f172a" strokeWidth={0.8} />
          <line x1={0} y1={-15} x2={0} y2={-9} stroke="#0f172a" strokeWidth={0.8} />
          <line x1={drawingW} y1={-15} x2={drawingW} y2={-9} stroke="#0f172a" strokeWidth={0.8} />
          <text x={drawingW / 2} y={-16} textAnchor="middle" className="fp-dim-label">
            {model.widthM.toFixed(2)} m
          </text>

          <line x1={-12} y1={0} x2={-12} y2={mm(model.depthM)} stroke="#0f172a" strokeWidth={0.8} />
          <line x1={-15} y1={0} x2={-9} y2={0} stroke="#0f172a" strokeWidth={0.8} />
          <line
            x1={-15}
            y1={mm(model.depthM)}
            x2={-9}
            y2={mm(model.depthM)}
            stroke="#0f172a"
            strokeWidth={0.8}
          />
          <text
            x={-18}
            y={mm(model.depthM) / 2}
            textAnchor="middle"
            className="fp-dim-label"
            transform={`rotate(-90 -18 ${mm(model.depthM) / 2})`}
          >
            {model.depthM.toFixed(2)} m
          </text>
        </g>
      </g>

      {/* North arrow */}
      <g transform={`translate(${vbW - 36}, 36) rotate(${model.northAngleDeg})`}>
        <circle r={14} fill="#fff" stroke="#111827" strokeWidth={1} />
        <polygon points="0,-10 4,6 0,3 -4,6" fill="#111827" />
        <text y={22} textAnchor="middle" className="fp-north">
          N
        </text>
      </g>

      {/* Scale bar */}
      <g transform={`translate(${margin}, ${vbH - titleBlockH - 8})`}>
        <text className="fp-scale-label">{scaleLabel(model.scale)}</text>
        <line x1={0} y1={10} x2={metersToPaperMm(5, model.scale)} y2={10} stroke="#111827" strokeWidth={1.4} />
        <line x1={0} y1={7} x2={0} y2={13} stroke="#111827" strokeWidth={1} />
        <line
          x1={metersToPaperMm(5, model.scale)}
          y1={7}
          x2={metersToPaperMm(5, model.scale)}
          y2={13}
          stroke="#111827"
          strokeWidth={1}
        />
        <text x={0} y={22} className="fp-scale-tick">
          0
        </text>
        <text x={metersToPaperMm(5, model.scale)} y={22} textAnchor="end" className="fp-scale-tick">
          5 m
        </text>
      </g>

      {/* Title block */}
      <g transform={`translate(${margin}, ${vbH - titleBlockH + 8})`}>
        <rect width={vbW - margin * 2} height={titleBlockH - 12} fill="#fff" stroke="#111827" strokeWidth={1} />
        <text x={8} y={14} className="fp-title">
          {model.title}
        </text>
        <text x={8} y={28} className="fp-subtitle">
          Plano de planta descriptivo · superficie {model.answers.floorAreaM2.toFixed(1)} m² · orientación{" "}
          {model.answers.orientation}
        </text>
        <text x={8} y={40} className="fp-subtitle">
          Cotas en metros. Representación esquemática a escala de proyecto ({model.scale}).
        </text>
      </g>
    </svg>
  );
}
