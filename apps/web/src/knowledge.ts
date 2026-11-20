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
  package?: { size: number; kind: "bag" | "roll" | "box" };
  /** the query opened in the retailers' own search */
  search: string;
}

export interface Layer {
  role: BuildupRole;
  label: string;
  material?: string;
  source?: SourceRef;
  quantity?: Quantity;
}

export interface Buildup {
  id: string;
  title: string;
  summary: string;
  layers: Layer[];
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
  /** room id -> surface -> buildup id */
  surfaceBuildups: Record<string, Record<string, string>>;
  /** English text to its translation, per language. */
  translations: Record<string, Record<string, string>>;
}

export const KNOWLEDGE = snapshot as Knowledge;

/** A link to the cited page of a manufacturer document. */
export function citationUrl(source: SourceRef, knowledge: Knowledge = KNOWLEDGE): string {
  const document = knowledge.documents[source.document];
  if (!document) throw new Error(`Unknown document ${source.document}`);
  return `${document.url}#page=${source.page}`;
}

/** The build-up ("sandwich") proposed for a surface of the demo house. */
export function buildupForSurface(
  room: string,
  surface: string,
  knowledge: Knowledge = KNOWLEDGE,
): Buildup | undefined {
  const id = knowledge.surfaceBuildups[room]?.[surface];
  return id ? knowledge.buildups.find((b) => b.id === id) : undefined;
}
