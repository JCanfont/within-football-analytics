import { Building2, ChevronLeft, ChevronRight, DoorOpen, Download, DraftingCompass, Ruler } from "lucide-react";
import { useMemo, useState } from "react";
import { FloorPlanDrawing } from "../components/FloorPlanDrawing";
import type {
  BathroomFixture,
  CardinalOrientation,
  DoorSpec,
  DwellingKind,
  EstateType,
  FloorLevels,
  FloorPlanAnswers,
  HallwaySpec,
  WallSide,
  WindowSpec,
} from "../types/floorPlan";
import { downloadFloorPlanDxf, floorPlanDxfFilename } from "../utils/floorPlanDxf";
import {
  bathroomFactory,
  buildFloorPlan,
  createDefaultAnswers,
  doorFactory,
  hallwayFactory,
  windowFactory,
} from "../utils/floorPlanLayout";

const STEPS = [
  "Finca",
  "Tipología",
  "Plantas",
  "Superficie",
  "Baños",
  "Habitaciones",
  "Orientación",
  "Ventanas",
  "Pasillos",
  "Puertas",
  "Plano",
] as const;

const ORIENTATIONS: CardinalOrientation[] = [
  "norte",
  "sur",
  "este",
  "oeste",
  "noreste",
  "noroeste",
  "sureste",
  "suroeste",
];

const WALLS: WallSide[] = ["norte", "sur", "este", "oeste"];

export function FloorPlanPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FloorPlanAnswers>(createDefaultAnswers);
  const model = useMemo(() => (step === STEPS.length - 1 ? buildFloorPlan(answers) : null), [answers, step]);

  const canNext = (() => {
    if (step === 3) {
      return answers.floorAreaM2 >= 20 && answers.floorAreaM2 <= 600;
    }
    if (step === 4) {
      return answers.bathrooms.length >= 1;
    }
    if (step === 5) {
      return answers.bedroomCount >= 0;
    }
    if (step === 7) {
      return answers.windows.length >= 0;
    }
    if (step === 9) {
      return answers.doors.some((door) => door.kind === "entrada");
    }
    return true;
  })();

  const goNext = () => {
    if (!canNext || step >= STEPS.length - 1) {
      return;
    }
    setStep((current) => current + 1);
  };

  const goBack = () => {
    setStep((current) => Math.max(0, current - 1));
  };

  const setBathroomCount = (count: number) => {
    const nextCount = Math.max(1, Math.min(4, count));
    setAnswers((prev) => {
      const bathrooms = Array.from({ length: nextCount }, (_, index) => {
        return prev.bathrooms[index] ?? bathroomFactory(index, "ducha");
      });
      return { ...prev, bathrooms };
    });
  };

  const updateBathroomFixture = (index: number, fixture: BathroomFixture) => {
    setAnswers((prev) => ({
      ...prev,
      bathrooms: prev.bathrooms.map((bath, i) => (i === index ? { ...bath, fixture } : bath)),
    }));
  };

  const setWindowCount = (count: number) => {
    const nextCount = Math.max(0, Math.min(8, count));
    setAnswers((prev) => {
      const windows = Array.from({ length: nextCount }, (_, index) => {
        return prev.windows[index] ?? windowFactory(index, WALLS[index % WALLS.length]!);
      });
      return { ...prev, windows };
    });
  };

  const updateWindow = (index: number, patch: Partial<WindowSpec>) => {
    setAnswers((prev) => ({
      ...prev,
      windows: prev.windows.map((window, i) => (i === index ? { ...window, ...patch } : window)),
    }));
  };

  const setHallwayCount = (count: number) => {
    const nextCount = Math.max(0, Math.min(3, count));
    setAnswers((prev) => {
      const hallways = Array.from({ length: nextCount }, (_, index) => {
        return prev.hallways[index] ?? hallwayFactory(index);
      });
      return { ...prev, hallways };
    });
  };

  const updateHallway = (index: number, patch: Partial<HallwaySpec>) => {
    setAnswers((prev) => ({
      ...prev,
      hallways: prev.hallways.map((hallway, i) => (i === index ? { ...hallway, ...patch } : hallway)),
    }));
  };

  const setDoorCount = (count: number) => {
    const nextCount = Math.max(1, Math.min(10, count));
    setAnswers((prev) => {
      const doors = Array.from({ length: nextCount }, (_, index) => {
        if (prev.doors[index]) {
          return prev.doors[index]!;
        }
        return index === 0 ? doorFactory(index, "entrada") : doorFactory(index, "interior");
      });
      if (!doors.some((door) => door.kind === "entrada")) {
        doors[0] = { ...doors[0]!, kind: "entrada", wall: doors[0]!.wall ?? "sur", label: "Puerta de entrada" };
      }
      return { ...prev, doors };
    });
  };

  const updateDoor = (index: number, patch: Partial<DoorSpec>) => {
    setAnswers((prev) => ({
      ...prev,
      doors: prev.doors.map((door, i) => (i === index ? { ...door, ...patch } : door)),
    }));
  };

  return (
    <section className="floor-plan-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">AutoCAD automatizado</p>
          <h1>Plano técnico descriptivo</h1>
          <p className="page-lead">
            Cuestionario guiado que genera un dibujo DXF de AutoCAD a escala de arquitecto (1:50 o 1:100),
            con capas A-WALL, A-DOOR, A-GLAZ, cotas y memoria.
          </p>
        </div>
      </header>

      <ol className="fp-stepper" aria-label="Pasos del cuestionario">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
            <button type="button" onClick={() => index <= step && setStep(index)} disabled={index > step}>
              <span>{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <section className="panel fp-wizard-panel">
        <div className="panel-heading">
          <div>
            <h2>
              {step + 1}. {STEPS[step]}
            </h2>
            <p>{stepHelp(step)}</p>
          </div>
        </div>

        <div className="fp-step-body">
          {step === 0 ? (
            <div className="fp-choice-grid">
              {(
                [
                  ["urbana", "Urbana"],
                  ["rustica", "Rústica"],
                ] as const
              ).map(([value, label]) => (
                <ChoiceCard
                  key={value}
                  selected={answers.estateType === value}
                  title={label}
                  detail={value === "urbana" ? "Suelo urbano consolidado o solar de ciudad" : "Suelo rústico o periurbano"}
                  onClick={() => setAnswers((prev) => ({ ...prev, estateType: value as EstateType }))}
                />
              ))}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="fp-choice-grid">
              {(
                [
                  ["local", "Local", "Local comercial o profesional"],
                  ["vivienda_aislada", "Vivienda aislada", "Chalet o casa independiente"],
                  ["vivienda_adosada", "Vivienda no aislada", "Adosada o entre medianeras"],
                  ["piso", "Piso", "Vivienda en edificio plurifamiliar"],
                ] as const
              ).map(([value, title, detail]) => (
                <ChoiceCard
                  key={value}
                  selected={answers.dwellingKind === value}
                  title={title}
                  detail={detail}
                  onClick={() => setAnswers((prev) => ({ ...prev, dwellingKind: value as DwellingKind }))}
                />
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="fp-choice-grid">
              {(
                [
                  ["una_planta", "Una planta", "Toda la vivienda en un único nivel"],
                  ["duplex", "Dúplex", "Dos niveles con escalera interior"],
                ] as const
              ).map(([value, title, detail]) => (
                <ChoiceCard
                  key={value}
                  selected={answers.floorLevels === value}
                  title={title}
                  detail={detail}
                  onClick={() => setAnswers((prev) => ({ ...prev, floorLevels: value as FloorLevels }))}
                />
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <label className="fp-field">
              <span>
                <Ruler size={16} aria-hidden="true" /> Metros cuadrados de planta
              </span>
              <input
                type="number"
                min={20}
                max={600}
                step={1}
                value={answers.floorAreaM2}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    floorAreaM2: Number(event.target.value) || 0,
                  }))
                }
              />
              <small>Indica la superficie útil/construida de la planta a representar (20–600 m²).</small>
            </label>
          ) : null}

          {step === 4 ? (
            <div className="fp-stack">
              <label className="fp-field">
                <span>Número de baños</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={answers.bathrooms.length}
                  onChange={(event) => setBathroomCount(Number(event.target.value) || 1)}
                />
              </label>
              {answers.bathrooms.map((bath, index) => (
                <fieldset key={bath.id} className="fp-inline-options">
                  <legend>Baño {index + 1}</legend>
                  <label>
                    <input
                      type="radio"
                      name={`bath-fixture-${index}`}
                      checked={bath.fixture === "ducha"}
                      onChange={() => updateBathroomFixture(index, "ducha")}
                    />
                    Con ducha
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`bath-fixture-${index}`}
                      checked={bath.fixture === "banera"}
                      onChange={() => updateBathroomFixture(index, "banera")}
                    />
                    Con bañera
                  </label>
                </fieldset>
              ))}
            </div>
          ) : null}

          {step === 5 ? (
            <label className="fp-field">
              <span>Número de habitaciones (dormitorios)</span>
              <input
                type="number"
                min={0}
                max={8}
                value={answers.bedroomCount}
                onChange={(event) =>
                  setAnswers((prev) => ({
                    ...prev,
                    bedroomCount: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
          ) : null}

          {step === 6 ? (
            <div className="fp-choice-grid compact">
              {ORIENTATIONS.map((orientation) => (
                <ChoiceCard
                  key={orientation}
                  selected={answers.orientation === orientation}
                  title={orientation}
                  detail="Orientación principal de fachada / huecos"
                  onClick={() => setAnswers((prev) => ({ ...prev, orientation }))}
                />
              ))}
            </div>
          ) : null}

          {step === 7 ? (
            <div className="fp-stack">
              <label className="fp-field">
                <span>¿Hay ventanas? ¿Cuántas?</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={answers.windows.length}
                  onChange={(event) => setWindowCount(Number(event.target.value) || 0)}
                />
              </label>
              {answers.windows.map((window, index) => (
                <div key={window.id} className="fp-subcard">
                  <strong>Ventana {index + 1}</strong>
                  <label className="fp-field">
                    <span>Muro</span>
                    <select
                      value={window.wall}
                      onChange={(event) => updateWindow(index, { wall: event.target.value as WallSide })}
                    >
                      {WALLS.map((wall) => (
                        <option key={wall} value={wall}>
                          {wall}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fp-field">
                    <span>Estancia / ubicación</span>
                    <input
                      type="text"
                      value={window.roomHint ?? ""}
                      placeholder="ej. salón, dormitorio 1"
                      onChange={(event) => updateWindow(index, { roomHint: event.target.value })}
                    />
                  </label>
                  <label className="fp-field">
                    <span>Ancho (m)</span>
                    <input
                      type="number"
                      min={0.6}
                      max={3}
                      step={0.1}
                      value={window.widthM}
                      onChange={(event) => updateWindow(index, { widthM: Number(event.target.value) || 1.2 })}
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}

          {step === 8 ? (
            <div className="fp-stack">
              <label className="fp-field">
                <span>¿Hay pasillos? ¿Cuántos?</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={answers.hallways.length}
                  onChange={(event) => setHallwayCount(Number(event.target.value) || 0)}
                />
              </label>
              {answers.hallways.map((hallway, index) => (
                <div key={hallway.id} className="fp-subcard">
                  <strong>Pasillo {index + 1}</strong>
                  <label className="fp-field">
                    <span>Ubicación</span>
                    <select
                      value={hallway.location}
                      onChange={(event) =>
                        updateHallway(index, {
                          location: event.target.value as HallwaySpec["location"],
                        })
                      }
                    >
                      <option value="entrada">Entrada</option>
                      <option value="central">Central</option>
                      <option value="distribuidor">Distribuidor</option>
                      <option value="lateral">Lateral</option>
                    </select>
                  </label>
                  <label className="fp-field">
                    <span>Conecta con</span>
                    <input
                      type="text"
                      value={hallway.connects}
                      onChange={(event) => updateHallway(index, { connects: event.target.value })}
                      placeholder="ej. salón y dormitorios"
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}

          {step === 9 ? (
            <div className="fp-stack">
              <p className="fp-note">
                <DoorOpen size={16} aria-hidden="true" /> Incluye obligatoriamente la entrada a la vivienda.
              </p>
              <label className="fp-field">
                <span>Número de puertas</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={answers.doors.length}
                  onChange={(event) => setDoorCount(Number(event.target.value) || 1)}
                />
              </label>
              {answers.doors.map((door, index) => (
                <div key={door.id} className="fp-subcard">
                  <strong>{door.kind === "entrada" ? "Entrada a la vivienda" : `Puerta ${index + 1}`}</strong>
                  <label className="fp-field">
                    <span>Tipo</span>
                    <select
                      value={door.kind}
                      onChange={(event) =>
                        updateDoor(index, {
                          kind: event.target.value as DoorSpec["kind"],
                          label:
                            event.target.value === "entrada"
                              ? "Puerta de entrada"
                              : door.label || `Puerta ${index + 1}`,
                          wall: event.target.value === "entrada" ? door.wall ?? "sur" : door.wall,
                        })
                      }
                    >
                      <option value="entrada">Entrada</option>
                      <option value="interior">Interior</option>
                      <option value="terraza">Terraza</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </label>
                  <label className="fp-field">
                    <span>Muro</span>
                    <select
                      value={door.wall ?? "sur"}
                      onChange={(event) => updateDoor(index, { wall: event.target.value as WallSide })}
                    >
                      {WALLS.map((wall) => (
                        <option key={wall} value={wall}>
                          {wall}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fp-field">
                    <span>Ancho (m)</span>
                    <input
                      type="number"
                      min={0.7}
                      max={1.4}
                      step={0.05}
                      value={door.widthM}
                      onChange={(event) => updateDoor(index, { widthM: Number(event.target.value) || 0.8 })}
                    />
                  </label>
                  <label className="fp-field">
                    <span>Etiqueta</span>
                    <input
                      type="text"
                      value={door.label}
                      onChange={(event) => updateDoor(index, { label: event.target.value })}
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : null}

          {step === 10 && model ? (
            <div className="fp-result">
              <div className="fp-drawing-wrap">
                <div className="fp-cad-toolbar">
                  <p>
                    <DraftingCompass size={16} aria-hidden="true" />
                    Vista previa del plano. La entrega nativa es un <strong>DXF AutoCAD</strong> en metros
                    (INSUNITS=6), listo para abrir o xref.
                  </p>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => downloadFloorPlanDxf(model)}
                  >
                    <Download size={16} aria-hidden="true" />
                    Descargar {floorPlanDxfFilename(model)}
                  </button>
                </div>
                <FloorPlanDrawing model={model} />
              </div>
              <aside className="fp-memory">
                <h3>
                  <Building2 size={18} aria-hidden="true" /> Memoria descriptiva
                </h3>
                <ul>
                  {model.description.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <dl className="fp-summary">
                  <div>
                    <dt>Formato</dt>
                    <dd>DXF AC1024</dd>
                  </div>
                  <div>
                    <dt>Escala</dt>
                    <dd>{model.scale}</dd>
                  </div>
                  <div>
                    <dt>Emplantillado</dt>
                    <dd>
                      {model.widthM.toFixed(2)} × {model.depthM.toFixed(2)} m
                    </dd>
                  </div>
                  <div>
                    <dt>Estancias</dt>
                    <dd>{model.rooms.filter((room) => room.kind !== "terraza").length}</dd>
                  </div>
                  <div>
                    <dt>Capas CAD</dt>
                    <dd>A-WALL · A-FURN · A-FLOR-APPL · A-FLOR-SANR</dd>
                  </div>
                  <div>
                    <dt>Equipamiento</dt>
                    <dd>{model.fixtures.length} bloques</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="primary-action fp-download-full"
                  onClick={() => downloadFloorPlanDxf(model)}
                >
                  <Download size={16} aria-hidden="true" />
                  Exportar AutoCAD (.dxf)
                </button>
              </aside>
            </div>
          ) : null}
        </div>

        <div className="fp-wizard-actions">
          <button type="button" className="secondary-action" onClick={goBack} disabled={step === 0}>
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="primary-action" onClick={goNext} disabled={!canNext}>
              Siguiente
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                setAnswers(createDefaultAnswers());
                setStep(0);
              }}
            >
              Nuevo plano
            </button>
          )}
        </div>
      </section>
    </section>
  );
}

function stepHelp(step: number): string {
  const help = [
    "Indica si la finca es rústica o urbana.",
    "Selecciona si es local, vivienda aislada, no aislada o piso.",
    "¿La vivienda es de una planta o dúplex?",
    "Introduce los metros cuadrados de la planta a dibujar.",
    "Cuántos baños quieres y si van con ducha o bañera.",
    "Número de habitaciones / dormitorios.",
    "Orientación principal de la vivienda.",
    "Ventanas de la planta: cuántas y en qué muro.",
    "Pasillos: cuántos y dónde conectan.",
    "Puertas, con especial atención a la entrada a la vivienda.",
    "Plano AutoCAD automatizado: vista previa + descarga DXF a escala de arquitecto.",
  ];
  return help[step] ?? "";
}

function ChoiceCard({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={selected ? "fp-choice selected" : "fp-choice"} onClick={onClick}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}
