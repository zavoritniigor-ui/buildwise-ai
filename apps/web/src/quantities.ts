/**
 * Deterministic material quantities for a surface: the layer's rate times the
 * surface's area, joint length or count, plus the waste allowance. No AI and
 * no guessing: every number comes from the build-up data.
 */
import type { Buildup, Quantity } from "./knowledge";

export interface Measure {
  /** surface area in m² */
  area: number;
  /** floor/wall joint length in m */
  perimeter: number;
}

export interface Need {
  total: number;
  /** whole packages to buy, when the material is sold in packages */
  packages?: number;
}

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.ceil(value * f - 1e-9) / f;
};

export function need(quantity: Quantity, measure: Measure): Need {
  const base =
    quantity.per === "area" ? measure.area : quantity.per === "perimeter" ? measure.perimeter : 1;
  const raw = quantity.amount * base * (1 + quantity.waste);
  const total =
    quantity.unit === "pcs" ? Math.ceil(raw - 1e-9) : round(raw, quantity.unit === "m2" ? 2 : 1);
  return quantity.package
    ? { total, packages: Math.ceil(raw / quantity.package.size - 1e-9) }
    : { total };
}

export interface PurchaseLine {
  /** the material name if the layer names one, else the layer description */
  name: string;
  quantity: Quantity;
  need: Need;
}

/** One line per layer that has a quantity, merging layers that buy the same thing. */
export function purchaseList(buildup: Buildup, measure: Measure): PurchaseLine[] {
  const lines = new Map<string, PurchaseLine>();
  for (const layer of buildup.layers) {
    if (!layer.quantity) continue;
    const key = `${layer.quantity.search}|${layer.quantity.unit}|${layer.quantity.per}`;
    const current = lines.get(key);
    if (current) {
      const merged: Quantity = {
        ...current.quantity,
        amount: current.quantity.amount + layer.quantity.amount,
      };
      lines.set(key, { ...current, quantity: merged, need: need(merged, measure) });
    } else {
      lines.set(key, {
        name: layer.material ?? layer.label,
        quantity: layer.quantity,
        need: need(layer.quantity, measure),
      });
    }
  }
  return [...lines.values()];
}
