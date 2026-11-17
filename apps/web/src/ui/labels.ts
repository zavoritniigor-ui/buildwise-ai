import type { Verdict } from "../engine";
import type { AttributeValue, Knowledge } from "../knowledge";
import { KNOWLEDGE } from "../knowledge";

export const VERDICT_LABEL: Record<Verdict, string> = {
  compatible: "Fits",
  incompatible: "Does not fit",
  unknown: "Not enough information",
};

/** Job conditions grouped the way a renovator thinks about a bathroom. */
export const CONDITION_GROUPS: readonly { title: string; conditions: readonly string[] }[] = [
  { title: "Location", conditions: ["country"] },
  {
    title: "Floor structure",
    conditions: [
      "subfloor",
      "subfloor_edge",
      "subfloor_thickness_mm",
      "underlayment_thickness_mm",
      "joist_type",
      "joist_spacing_mm",
    ],
  },
  {
    title: "Shower",
    conditions: [
      "shower_base",
      "floor_waterproofing",
      "drain_system",
      "pipe_connection",
      "waste_pipe_size",
    ],
  },
  {
    title: "Floor tile",
    conditions: [
      "tile_material",
      "tile_min_side_mm",
      "uncoupling_membrane",
      "membrane_bonding_mortar",
      "tile_setting_mortar",
    ],
  },
  {
    title: "Walls",
    conditions: [
      "substrate",
      "application",
      "mounting",
      "bonding_mortar",
      "material_temperature_c",
    ],
  },
];

export function conditionLabel(name: string, knowledge: Knowledge = KNOWLEDGE): string {
  return knowledge.conditions[name]?.label ?? name;
}

/** Human words for an attribute or condition value, using the vocabulary. */
export function valueLabel(
  value: AttributeValue,
  vocabularyName: string | undefined,
  unit?: string,
  knowledge: Knowledge = KNOWLEDGE,
): string {
  const words = vocabularyName ? knowledge.vocabulary[vocabularyName] : undefined;
  const one = (v: string | number) => (typeof v === "string" ? (words?.[v] ?? v) : String(v));
  if (Array.isArray(value)) return (value as readonly string[]).map(one).join(", ");
  return unit
    ? `${one(value as string | number)} ${unit === "C" ? "°C" : unit}`
    : one(value as string | number);
}

/** snake_case attribute keys into a readable phrase. */
export function keyLabel(key: string): string {
  const words = key.replace(/_(mm|c|h|kpa)$/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
