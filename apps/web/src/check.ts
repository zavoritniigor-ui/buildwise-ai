/** Assess the knowledge base's assemblies and products against one job. */
import { type Assessment, type Trust, assess, buildRules, materialFrom } from "./engine";
import {
  type AssemblySpec,
  type Family,
  type Job,
  type Knowledge,
  type Variant,
  KNOWLEDGE,
} from "./knowledge";

export function checkAssembly(assembly: AssemblySpec, job: Job, trust: Trust): Assessment {
  return assess(materialFrom(assembly.attributes, trust), job, buildRules(assembly.rules, trust));
}

export function checkVariant(
  family: Family,
  variant: Variant,
  job: Job,
  trust: Trust,
  knowledge: Knowledge = KNOWLEDGE,
): Assessment {
  const category = knowledge.categories[family.category];
  if (!category) throw new Error(`Unknown category ${family.category}`);
  const material = materialFrom([...family.attributes, ...variant.attributes], trust);
  return assess(material, job, buildRules(category.rules, trust));
}

export function findVariant(
  sku: string,
  knowledge: Knowledge = KNOWLEDGE,
): { family: Family; variant: Variant } {
  for (const family of knowledge.families) {
    const variant = family.variants.find((v) => v.sku === sku);
    if (variant) return { family, variant };
  }
  throw new Error(`Unknown SKU ${sku}`);
}

export function findAssembly(slug: string, knowledge: Knowledge = KNOWLEDGE): AssemblySpec {
  const assembly = knowledge.assemblies.find((a) => a.slug === slug);
  if (!assembly) throw new Error(`Unknown assembly ${slug}`);
  return assembly;
}
