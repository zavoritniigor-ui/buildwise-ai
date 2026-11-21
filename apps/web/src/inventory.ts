/**
 * What a room, or the whole house, needs: every fixture and device counted,
 * doors and windows once each, and baseboard and cabinets by the metre. All of
 * it is read from the same data the 3D model is built from (fixtures.json and
 * layout.json), so the list matches what a person sees and clicks.
 */
import fixtures from "./house/fixtures.json";
import {
  OPENINGS,
  type RoomId,
  baseboardRuns,
  findRoom,
  openingItems,
  roomOpenings,
  surfaceArea,
  surfacePerimeter,
} from "./house/model";
import { type Item, type ItemCategory, KNOWLEDGE, buildupForSurface, findItem } from "./knowledge";
import { type PurchaseLine, mergePurchases, purchaseList } from "./quantities";

export interface InventoryLine {
  item: Item;
  /** Pieces for items counted each; metres for items bought by length. */
  amount: number;
}

interface Part {
  item?: string;
  size: number[];
  unit?: boolean;
  length?: boolean;
}

const CATEGORY_ORDER: readonly ItemCategory[] = [
  "door",
  "window",
  "trim",
  "cabinetry",
  "plumbing",
  "electrical",
  "lighting",
  "heating",
  "ventilation",
  "hardware",
];

export function inventory(rooms: readonly RoomId[]): InventoryLine[] {
  const amounts = new Map<string, number>();
  const add = (id: string, n: number) => amounts.set(id, (amounts.get(id) ?? 0) + n);
  const measure = (id: string) => findItem(id)?.measure ?? "each";

  for (const place of fixtures.placements) {
    if (!rooms.includes(place.room as RoomId)) continue;
    const piece = fixtures.pieces[place.piece as keyof typeof fixtures.pieces];
    const parts = piece.parts as Part[];
    const byItem = new Map<string, Part[]>();
    for (const part of parts) {
      const id = part.item ?? piece.item;
      byItem.set(id, [...(byItem.get(id) ?? []), part]);
    }
    for (const [id, group] of byItem) {
      if (measure(id) === "length") {
        add(
          id,
          group.filter((p) => p.length).reduce((sum, p) => sum + (p.size[0] ?? 0), 0),
        );
      } else {
        const units = group.filter((p) => p.unit).length;
        add(id, units || 1);
      }
    }
  }

  const openings = new Set(rooms.flatMap((r) => roomOpenings(findRoom(r))));
  for (const opening of OPENINGS) {
    if (openings.has(opening)) for (const id of openingItems(opening)) add(id, 1);
  }

  for (const room of rooms) {
    const length = baseboardRuns(findRoom(room)).reduce((sum, r) => sum + (r.to - r.from), 0);
    if (length > 0) add("baseboard", length);
  }

  return [...amounts]
    .map(([id, amount]) => {
      const item = KNOWLEDGE.items.find((i) => i.id === id);
      if (!item) throw new Error(`Unknown item ${id}`);
      const rounded = item.measure === "length" ? Math.round(amount * 100) / 100 : amount;
      return { item, amount: rounded };
    })
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.item.category) - CATEGORY_ORDER.indexOf(b.item.category) ||
        a.item.name.localeCompare(b.item.name),
    );
}

/**
 * The materials for every surface of the rooms, each with the build-up the
 * person chose for it (or the default), added up across surfaces.
 */
export function surfacePurchases(
  rooms: readonly RoomId[],
  choices: Readonly<Record<string, string>> = {},
): PurchaseLine[] {
  const lists: PurchaseLine[][] = [];
  for (const id of rooms) {
    const room = findRoom(id);
    for (const surface of room.surfaces) {
      const buildup = buildupForSurface(id, surface, choices[`${id}.${surface}`]);
      if (!buildup) continue;
      lists.push(
        purchaseList(buildup, {
          area: surfaceArea(room, surface),
          perimeter: surfacePerimeter(room, surface),
        }),
      );
    }
  }
  return mergePurchases(lists);
}
