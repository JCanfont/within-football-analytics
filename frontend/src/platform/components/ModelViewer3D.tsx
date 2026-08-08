import { useEffect, useRef, useState } from "react";
import type { RenderCamera, RenderLayer, RenderScene, ViewerLayerVisibility } from "../types/render";
import { collectProjectedFaces, defaultCameraForScene, facesToSvgPath } from "../services/renderProjector";
import { RENDER_PRESETS } from "../services/renderPresets";

type Props = {
  scene: RenderScene;
  camera?: RenderCamera;
  onCameraChange?: (camera: RenderCamera) => void;
};

const DEFAULT_LAYERS: ViewerLayerVisibility = {
  plot: true,
  envelope: true,
  building: true,
  courtyard: true,
  core: true,
  roof: true,
};

const LAYER_LABELS: Record<RenderLayer, string> = {
  plot: "Parcela",
  envelope: "Envolvente",
  building: "Edificio",
  courtyard: "Patio",
  core: "Núcleo",
  roof: "Cubierta",
};

export function ModelViewer3D({ scene, camera: controlledCamera, onCameraChange }: Props) {
  const [internalCamera, setInternalCamera] = useState<RenderCamera>(() => defaultCameraForScene(scene));
  const [layers, setLayers] = useState<ViewerLayerVisibility>(DEFAULT_LAYERS);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const camera = controlledCamera ?? internalCamera;

  useEffect(() => {
    setInternalCamera(defaultCameraForScene(scene));
  }, [scene.scene_id]);

  const setCamera = (next: RenderCamera) => {
    setInternalCamera(next);
    onCameraChange?.(next);
  };

  const width = 720;
  const height = 420;
  const colors = RENDER_PRESETS.clay;
  const faces = collectProjectedFaces(scene, camera, width, height, colors, layers);

  return (
    <div className="model-viewer-3d">
      <div className="model-viewer-toolbar">
        <label className="model-viewer-check">
          <input
            type="checkbox"
            checked={camera.orthographic}
            onChange={(event) => setCamera({ ...camera, orthographic: event.target.checked })}
          />
          Ortográfica
        </label>
        {(Object.keys(LAYER_LABELS) as RenderLayer[]).map((layer) => (
          <label key={layer} className="model-viewer-check">
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={(event) => setLayers((prev) => ({ ...prev, [layer]: event.target.checked }))}
            />
            {LAYER_LABELS[layer]}
          </label>
        ))}
      </div>

      <svg
        className="model-viewer-canvas"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Visor 3D interactivo del modelo"
        onPointerDown={(event) => {
          (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            yaw: camera.yaw_deg,
            pitch: camera.pitch_deg,
          };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const dx = event.clientX - dragRef.current.x;
          const dy = event.clientY - dragRef.current.y;
          setCamera({
            ...camera,
            yaw_deg: dragRef.current.yaw + dx * 0.35,
            pitch_deg: Math.max(8, Math.min(80, dragRef.current.pitch + dy * 0.25)),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const factor = event.deltaY > 0 ? 1.08 : 0.92;
          setCamera({
            ...camera,
            distance_m: Math.max(scene.bounds.max.z + 5, camera.distance_m * factor),
          });
        }}
      >
        <rect width={width} height={height} fill={colors.sky} />
        {faces.map((face, index) => (
          <path
            key={`face-${index}`}
            d={facesToSvgPath(face.points)}
            fill={face.fill}
            fillOpacity={face.opacity}
            stroke={face.stroke}
            strokeOpacity={0.45}
            strokeWidth={0.7}
          />
        ))}
        <text x={16} y={height - 14} fill={colors.stroke} fontSize={12} opacity={0.7}>
          Arrastrar: órbita · rueda: zoom · derivado del modelo ARCH
        </text>
      </svg>
    </div>
  );
}
