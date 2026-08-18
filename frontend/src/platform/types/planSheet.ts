import type { Point2 } from "./envelope";

export type PlanSheetKind = "floor_plan" | "elevation" | "section" | "roof_plan";

export type PlanPrimitive =
  | {
      id: string;
      kind: "polyline";
      layer: string;
      points: Point2[];
      closed?: boolean;
      dashed?: boolean;
    }
  | {
      id: string;
      kind: "text";
      layer: string;
      at: Point2;
      text: string;
      height?: number;
      rotationDeg?: number;
    }
  | {
      id: string;
      kind: "dim";
      layer: string;
      a: Point2;
      b: Point2;
      offset: number;
      label: string;
    }
  | {
      id: string;
      kind: "symbol";
      layer: string;
      at: Point2;
      symbol: "door" | "window" | "north" | "section_mark";
      rotationDeg?: number;
      label?: string;
    };

export type PlanSheet = {
  id: string;
  kind: PlanSheetKind;
  title: string;
  scale: "1:100" | "1:50" | "1:200";
  storey_index?: number | null;
  model_id: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  primitives: PlanPrimitive[];
  notes: string[];
};

export type PlanSet = {
  plan_set_id: string;
  model_id: string;
  generated_at: string;
  sheets: PlanSheet[];
  disclaimer: string;
};
