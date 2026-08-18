import { Box, Camera, Download, ImagePlay } from "lucide-react";
import { useMemo, useState } from "react";
import type { ArchitecturalModel } from "../types/architecturalModel";
import type { BuildingEnvelope } from "../types/envelope";
import type {
  RenderCamera,
  RenderJob,
  RenderPresetId,
  RenderResolutionId,
} from "../types/render";
import { downloadBlenderPayload, toBlenderScenePayload } from "../services/blenderAdapter";
import { createAndRunRenderJob } from "../services/renderJobService";
import { listRenderPresets, listRenderResolutions } from "../services/renderPresets";
import { buildRenderSceneFromModel } from "../services/renderSceneBuilder";
import { ModelViewer3D } from "./ModelViewer3D";

type Props = {
  model: ArchitecturalModel;
  envelope: BuildingEnvelope;
  job: RenderJob | null;
  onJobChange: (job: RenderJob) => void;
};

export function RenderPanel({ model, envelope, job, onJobChange }: Props) {
  const scene = useMemo(() => buildRenderSceneFromModel(model, envelope), [model, envelope]);
  const [preset, setPreset] = useState<RenderPresetId>(job?.preset ?? "daylight_concept");
  const [resolution, setResolution] = useState<RenderResolutionId>(job?.resolution.id ?? "1080p");
  const [camera, setCamera] = useState<RenderCamera | undefined>(job?.camera);

  const runPreview = () => {
    const next = createAndRunRenderJob({
      model,
      envelope,
      preset,
      resolution,
      camera,
      engine: "local_preview_v1",
    });
    onJobChange(next);
  };

  const exportBlenderBridge = () => {
    const payload = toBlenderScenePayload(scene, camera ?? job?.camera ?? {
      yaw_deg: 38,
      pitch_deg: 28,
      distance_m: 40,
      target: { x: 0, y: 0, z: 0 },
      fov_deg: 42,
      orthographic: false,
    });
    downloadBlenderPayload(payload);
  };

  const downloadPreview = () => {
    if (!job?.preview_svg) return;
    const blob = new Blob([job.preview_svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${job.job_id}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="render-panel" aria-label="Visor 3D y render">
      <header className="panel-heading">
        <div>
          <h2>
            <Box size={18} aria-hidden="true" /> Visor 3D y Render
          </h2>
          <p>
            El visor interactivo y el RenderJob son derivados del modelo ARCH. Blender es adaptador opcional y no
            dependencia del núcleo BIM/planos. Sin GPU cloud obligatoria.
          </p>
        </div>
      </header>

      <ModelViewer3D scene={scene} camera={camera} onCameraChange={setCamera} />

      <div className="render-job-controls">
        <label>
          Preset
          <select
            aria-label="Preset de render"
            value={preset}
            onChange={(event) => setPreset(event.target.value as RenderPresetId)}
          >
            {listRenderPresets().map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Resolución
          <select
            aria-label="Resolución de render"
            value={resolution}
            onChange={(event) => setResolution(event.target.value as RenderResolutionId)}
          >
            {listRenderResolutions().map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.width}×{item.height})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary-action" onClick={runPreview}>
          <ImagePlay size={16} aria-hidden="true" />
          Lanzar RenderJob (preview local)
        </button>
        <button type="button" className="secondary-action" onClick={exportBlenderBridge}>
          <Camera size={16} aria-hidden="true" />
          Exportar bridge Blender (JSON)
        </button>
      </div>

      {job ? (
        <div className="render-job-status">
          <dl className="massing-metrics">
            <div>
              <dt>job_id</dt>
              <dd>{job.job_id}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{job.status}</dd>
            </div>
            <div>
              <dt>Motor</dt>
              <dd>{job.engine}</dd>
            </div>
            <div>
              <dt>Progreso</dt>
              <dd>{Math.round(job.progress * 100)}%</dd>
            </div>
          </dl>
          <p className="page-lead">{job.disclaimer}</p>
          {job.error ? <p className="platform-error">{job.error}</p> : null}
          {job.preview_svg ? (
            <div className="render-preview-wrap">
              <img
                className="render-preview"
                alt={`Preview render ${job.preset}`}
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.preview_svg)}`}
              />
              <button type="button" className="secondary-action" onClick={downloadPreview}>
                <Download size={16} aria-hidden="true" />
                Descargar preview SVG
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="page-lead">Aún no hay RenderJob. El visor 3D ya está disponible desde el modelo.</p>
      )}
    </section>
  );
}
