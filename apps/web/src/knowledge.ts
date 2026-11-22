/**
 * The knowledge base snapshot exported by the API package
 * (`python -m buildwise_api.catalog.export`). It is generated, never edited by
 * hand; a Python test fails when it is out of date.
 */
import snapshot from "./generated/knowledge.json";

export type Status = "unverified" | "ai_extracted" | "human_verified" | "rejected";
export type AttributeValue = string | number | readonly string[];

export interface SourceRef {
  document: string;
  page: number;
}

export interface Attribute {
  key: string;
  value: AttributeValue;
  status: Status;
  source: SourceRef;
  unit?: string;
  note?: string;
}

export interface RuleSpec {
  id: string;
  kind: "membership" | "range";
  condition: string;
  status: Status;
  description: string;
  source: SourceRef;
  material_attribute?: string;
  min_attribute?: string;
  max_attribute?: string;
  alternative?: { group: string; number: number };
}

export interface Condition {
  label: string;
  unit?: string;
  options?: string;
}

export interface Manufacturer {
  name: string;
  /** The name shoppers search for in stores. */
  brand: string;
}

export interface AssemblySpec {
  slug: string;
  name: string;
  description: string;
  manufacturer: Manufacturer;
  attributes: Attribute[];
  rules: RuleSpec[];
}

export interface Variant {
  sku: string;
  dimensions: Record<string, number>;
  attributes: Attribute[];
}

export interface Family {
  name: string;
  category: string;
  manufacturer: Manufacturer;
  attributes: Attribute[];
  variants_source: SourceRef;
  variants: Variant[];
}

export type JobValue = string | number;
export type Job = Record<string, JobValue>;

export interface Outcome {
  verdict: "compatible" | "incompatible" | "unknown";
  missing: string[];
}

export interface ScenarioCase {
  id: string;
  title: string;
  assembly?: string;
  sku?: string;
  job: Job;
  expected: { verified: Outcome; preview: Outcome };
}

export interface Scenario {
  id: string;
  title: string;
  job: Job;
  cases: ScenarioCase[];
}

export type BuildupRole =
  | "structure"
  | "substrate"
  | "underlayment"
  | "membrane"
  | "drain"
  | "mortar"
  | "covering"
  | "grout"
  | "finish";

export interface Package {
  size: number;
  kind: "bag" | "roll" | "box" | "pail" | "can" | "sheet" | "coil" | "length";
}

export interface Quantity {
  /** area: per m² of the surface; perimeter: per metre of floor/wall joint; each: a fixed count */
  per: "area" | "perimeter" | "each";
  amount: number;
  unit: "kg" | "m2" | "m" | "L" | "pcs";
  /** extra fraction for cuts and overlaps */
  waste: number;
  /** manufacturer: cited rate; geometry: the surface itself; estimate: common practice */
  basis: "manufacturer" | "geometry" | "estimate";
  source?: SourceRef;
  package?: Package;
  /** the query opened in the retailers' own search */
  search: string;
}

export interface Layer {
  role: BuildupRole;
  label: string;
  material?: string;
  source?: SourceRef;
  quantity?: Quantity;
  /** a product slot: the person may swap this layer's product */
  slot?: string;
}

/** A product sold in Canada that can fill a slot, with its own cited rate. */
export interface Product {
  id: string;
  slot: string;
  brand: string;
  name: string;
  quantity: Quantity;
}

export interface Buildup {
  id: string;
  title: string;
  summary: string;
  layers: Layer[];
}

export type ItemCategory =
  | "cabinetry"
  | "plumbing"
  | "electrical"
  | "lighting"
  | "heating"
  | "ventilation"
  | "door"
  | "window"
  | "hardware"
  | "trim";

/** Something in the house a person can click and go and buy (data/items.yaml). */
export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  /** each: counted in pieces; length: bought by the metre. */
  measure: "each" | "length";
  /** What to check before buying. */
  summary: string;
  /** The query opened in the retailers' own search. */
  search: string;
  /** a product slot: the person may pick the brand that supplies it */
  slot?: string;
}

/** A brand that supplies items of the house, such as pipe or cable. */
export interface ItemProduct {
  id: string;
  slot: string;
  brand: string;
  name: string;
  /** the data-sheet page that gives the packages */
  source: SourceRef;
  /** per item id: how this product sells it */
  items: Record<string, { package: Package; search: string }>;
  /** items this product needs in place of others, such as its own fitting rings */
  swaps: Record<string, string>;
}

export interface Knowledge {
  documents: Record<string, { title: string; url: string; version: string }>;
  conditions: Record<string, Condition>;
  vocabulary: Record<string, Record<string, string>>;
  categories: Record<string, { name: string; rules: RuleSpec[] }>;
  assemblies: AssemblySpec[];
  families: Family[];
  scenarios: Scenario[];
  attribute_labels: Record<string, string>;
  value_labels: Record<string, string>;
  buildups: Buildup[];
  /** room id -> surface -> build-ups offered as technologies; the first is the default */
  surfaceBuildups: Record<string, Record<string, string[]>>;
  items: Item[];
  slots: Record<string, { name: string }>;
  products: Product[];
  itemProducts: ItemProduct[];
  /** English text to its translation, per language. */
  translations: Record<string, Record<string, string>>;
}

export const KNOWLEDGE = snapshot as unknown as Knowledge;

/** A link to the cited page of a manufacturer document. */
export function citationUrl(source: SourceRef, knowledge: Knowledge = KNOWLEDGE): string {
  const document = knowledge.documents[source.document];
  if (!document) throw new Error(`Unknown document ${source.document}`);
  return `${document.url}#page=${source.page}`;
}

/** The build-ups ("sandwiches") a surface of the demo house offers, as
 * technologies to choose from; the first is the default. */
export function buildupsForSurface(
  room: string,
  surface: string,
  knowledge: Knowledge = KNOWLEDGE,
): Buildup[] {
  const ids = knowledge.surfaceBuildups[room]?.[surface] ?? [];
  return ids.flatMap((id) => knowledge.buildups.filter((b) => b.id === id));
}

/** The build-up proposed for a surface: the chosen one, else the default. */
export function buildupForSurface(
  room: string,
  surface: string,
  chosen?: string,
  knowledge: Knowledge = KNOWLEDGE,
): Buildup | undefined {
  const options = buildupsForSurface(room, surface, knowledge);
  return options.find((b) => b.id === chosen) ?? options[0];
}

/** An item of the house by id, or undefined when the knowledge base lacks it. */
export function findItem(id: string, knowledge: Knowledge = KNOWLEDGE): Item | undefined {
  return knowledge.items.find((item) => item.id === id);
}

/** The products that can fill a slot; the first is the default. */
export function productsForSlot(slot: string, knowledge: Knowledge = KNOWLEDGE): Product[] {
  return knowledge.products.filter((p) => p.slot === slot);
}

/** The chosen product per slot; a slot left out keeps its default. */
export type ProductPicks = Readonly<Record<string, string>>;

/** The build-up with each slot layer filled by the picked product. */
export function applyProducts(
  buildup: Buildup,
  picks: ProductPicks = {},
  knowledge: Knowledge = KNOWLEDGE,
): Buildup {
  return {
    ...buildup,
    layers: buildup.layers.map((layer) => {
      const id = layer.slot ? picks[layer.slot] : undefined;
      const product = id ? knowledge.products.find((p) => p.id === id) : undefined;
      if (!product || product.slot !== layer.slot) return layer;
      return {
        ...layer,
        material: `${product.brand} ${product.name}`,
        source: product.quantity.source,
        quantity: product.quantity,
      };
    }),
  };
}

/** The slots the layers of these build-ups offer, in order. */
export function slotsOf(buildups: readonly Buildup[]): string[] {
  return [...new Set(buildups.flatMap((b) => b.layers.flatMap((l) => (l.slot ? [l.slot] : []))))];
}

/** The brands that can supply an item slot; the first is the default. */
export function itemProductsForSlot(slot: string, knowledge: Knowledge = KNOWLEDGE): ItemProduct[] {
  return knowledge.itemProducts.filter((p) => p.slot === slot);
}

/** The brand chosen for an item slot, else the slot's default. */
export function chosenItemProduct(
  slot: string,
  picks: ProductPicks = {},
  knowledge: Knowledge = KNOWLEDGE,
): ItemProduct | undefined {
  const offered = itemProductsForSlot(slot, knowledge);
  return offered.find((p) => p.id === picks[slot]) ?? offered[0];
}

/** How an item is bought with the chosen brand: the product, its package and
 * how many packages cover the amount. Undefined for items without a slot. */
export function itemPurchase(
  id: string,
  amount: number,
  picks: ProductPicks = {},
  knowledge: Knowledge = KNOWLEDGE,
): { product: ItemProduct; package: Package; search: string; packages: number } | undefined {
  const slot = findItem(id, knowledge)?.slot;
  const product = slot ? chosenItemProduct(slot, picks, knowledge) : undefined;
  const sold = product?.items[id];
  if (!product || !sold) return undefined;
  const packages = Math.max(1, Math.ceil(amount / sold.package.size - 1e-9));
  return { product, package: sold.package, search: sold.search, packages };
}

/** The items again, with those the chosen brands replace swapped for theirs
 * (Uponor PEX-a takes ProPEX expansion rings in place of crimp rings). */
export function swapItems(
  amounts: Iterable<readonly [string, number]>,
  picks: ProductPicks = {},
  knowledge: Knowledge = KNOWLEDGE,
): Map<string, number> {
  const swaps = new Map<string, string>();
  for (const slot of new Set(knowledge.itemProducts.map((p) => p.slot))) {
    const product = chosenItemProduct(slot, picks, knowledge);
    for (const [from, to] of Object.entries(product?.swaps ?? {})) swaps.set(from, to);
  }
  const out = new Map<string, number>();
  for (const [id, n] of amounts) {
    const to = swaps.get(id) ?? id;
    out.set(to, (out.get(to) ?? 0) + n);
  }
  return out;
}

/** The item slots these items offer, in order. */
export function itemSlotsOf(ids: Iterable<string>, knowledge: Knowledge = KNOWLEDGE): string[] {
  return [...new Set([...ids].flatMap((id) => findItem(id, knowledge)?.slot ?? []))];
}
