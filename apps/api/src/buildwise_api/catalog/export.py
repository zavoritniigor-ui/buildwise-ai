"""Export the knowledge base as one JSON snapshot for the web app.

The web app has no server yet, so it evaluates the same rules in the browser.
The snapshot also carries the scenario cases with the verdicts the Python
engine reaches, so the web engine can be held to the same answers.

Usage: python -m buildwise_api.catalog.export ../../data ../web/src/generated/knowledge.json
"""

import json
import sys
from collections import defaultdict
from collections.abc import Iterable, Sequence
from decimal import Decimal
from pathlib import Path
from typing import Literal, Self

from pydantic import model_validator

from buildwise_api.catalog import schema
from buildwise_api.catalog.schema import load_catalog_files, load_vocabulary, read_yaml
from buildwise_api.compatibility.engine import (
    AnyOf,
    Attributes,
    AttributeValue,
    MembershipRule,
    Pending,
    RangeRule,
    Rule,
    assess,
)
from buildwise_api.db.models import RuleKind, VerificationStatus

type Json = None | bool | int | float | str | list[Json] | dict[str, Json]
type Trust = Literal["verified", "preview"]
"""verified: only facts a person approved count, as in the API.
preview: every fact that is not rejected counts, to show what the verdict
will be once the facts are reviewed."""

TRUST_LEVELS: tuple[Trust, ...] = ("verified", "preview")

LANGUAGES = ("uk", "ru", "fr")
"""Translations kept in data/i18n/<language>.yaml; English is the source."""


class Translations(schema._Strict):
    texts: dict[str, str]


class Case(schema._Strict):
    id: str
    title: str
    assembly: str | None = None
    sku: str | None = None
    from_scratch: bool = False
    job: dict[str, str | Decimal] = {}

    @model_validator(mode="after")
    def _one_target(self) -> Self:
        if (self.assembly is None) == (self.sku is None):
            raise ValueError(f"case {self.id!r} needs exactly one of assembly or sku")
        return self


class Scenario(schema._Strict):
    id: str
    title: str
    job: dict[str, str | Decimal]
    cases: list[Case]


def _counts(status: VerificationStatus, trust: Trust) -> bool:
    if status is VerificationStatus.REJECTED:
        return False
    return trust == "preview" or status is VerificationStatus.HUMAN_VERIFIED


def _engine_rule(rule: schema.Rule) -> Rule:
    if rule.kind is RuleKind.MEMBERSHIP:
        if rule.material_attribute is None:
            raise ValueError(f"membership rule {rule.slug!r} has no material attribute")
        return MembershipRule(rule.slug, rule.material_attribute, rule.condition)
    return RangeRule(rule.slug, rule.condition, rule.min_attribute, rule.max_attribute)


def engine_rules(rules: Iterable[schema.Rule], trust: Trust) -> list[Rule]:
    """The same grouping as compatibility.repository.published_rules."""
    result: list[Rule] = []
    groups: dict[str, list[schema.Rule]] = defaultdict(list)
    for rule in sorted(rules, key=lambda r: r.slug):
        if rule.status is VerificationStatus.REJECTED:
            continue
        if rule.alternative is not None:
            groups[rule.alternative.group].append(rule)
        elif _counts(rule.status, trust):
            result.append(_engine_rule(rule))
        else:
            result.append(Pending(rule.slug))
    for group, members in groups.items():
        if not all(_counts(m.status, trust) for m in members):
            result.append(Pending(group))
            continue
        alternatives: dict[int, list[Rule]] = defaultdict(list)
        for member in members:
            if member.alternative is None:
                raise ValueError(f"rule {member.slug!r} is in group {group!r} without a number")
            alternatives[member.alternative.number].append(_engine_rule(member))
        result.append(AnyOf(group, tuple(tuple(alternatives[n]) for n in sorted(alternatives))))
    return sorted(result, key=lambda rule: rule.id)


def _value(value: list[str] | Decimal | str) -> AttributeValue:
    return frozenset(value) if isinstance(value, list) else value


def material(attributes: Iterable[schema.Attribute], trust: Trust) -> Attributes:
    return {a.key: _value(a.value) for a in attributes if _counts(a.status, trust)}


def _derived(family: schema.Family, variant: schema.Variant) -> list[schema.Attribute]:
    """Options derived from a variant's size, cited by the deciding minimum."""
    found: list[schema.Attribute] = []
    for derived in family.derived_options:
        options = derived.options_for(variant)
        if options:
            found.append(
                schema.Attribute(
                    key=derived.key,
                    value=[m.option for m in options],
                    source=options[-1].source,
                    status=derived.status,
                    verified_by=derived.verified_by,
                    verified_on=derived.verified_on,
                )
            )
    return found


def _number(value: Decimal) -> int | float:
    return int(value) if value == value.to_integral_value() else float(value)


def _plain(value: object) -> Json:
    if isinstance(value, Decimal):
        return _number(value)
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return str(value)


def _source(source: schema.SourceRef) -> Json:
    return {"document": source.document, "page": source.page}


def _attribute(attribute: schema.Attribute) -> Json:
    out: dict[str, Json] = {
        "key": attribute.key,
        "value": _plain(attribute.value),
        "status": attribute.status.value,
        "source": _source(attribute.source),
    }
    if attribute.unit is not None:
        out["unit"] = attribute.unit
    if attribute.note is not None:
        out["note"] = attribute.note
    return out


def _rule(rule: schema.Rule) -> Json:
    out: dict[str, Json] = {
        "id": rule.slug,
        "kind": rule.kind.value,
        "condition": rule.condition,
        "status": rule.status.value,
        "description": rule.description,
        "source": _source(rule.source),
    }
    for key in ("material_attribute", "min_attribute", "max_attribute"):
        if getattr(rule, key) is not None:
            out[key] = getattr(rule, key)
    if rule.alternative is not None:
        out["alternative"] = {"group": rule.alternative.group, "number": rule.alternative.number}
    return out


def _layer(layer: schema.Layer) -> Json:
    out: dict[str, Json] = {"role": layer.role, "label": layer.label}
    if layer.material is not None:
        out["material"] = layer.material
    if layer.source is not None:
        out["source"] = _source(layer.source)
    if layer.quantity is not None:
        out["quantity"] = _quantity(layer.quantity)
    return out


def _quantity(quantity: schema.Quantity) -> Json:
    out: dict[str, Json] = {
        "per": quantity.per,
        "amount": _number(quantity.amount),
        "unit": quantity.unit,
        "waste": _number(quantity.waste),
        "basis": quantity.basis,
        "search": quantity.search,
    }
    if quantity.source is not None:
        out["source"] = _source(quantity.source)
    if quantity.package is not None:
        out["package"] = {"size": _number(quantity.package.size), "kind": quantity.package.kind}
    return out


def _buildup(buildup: schema.Buildup) -> Json:
    return {
        "id": buildup.id,
        "title": buildup.title,
        "summary": buildup.summary,
        "layers": [_layer(layer) for layer in buildup.layers],
    }


def _outcome(attributes: Attributes, job: dict[str, str | Decimal], rules: Sequence[Rule]) -> Json:
    result = assess(attributes, job, rules)
    return {"verdict": result.verdict.value, "missing": list(result.missing_conditions)}


def snapshot(data_dir: Path) -> Json:
    vocabulary = load_vocabulary(data_dir)
    catalogs = load_catalog_files(data_dir)

    documents: dict[str, Json] = {}
    categories: dict[str, dict[str, Json]] = {}
    rules_by_category: dict[str, list[schema.Rule]] = defaultdict(list)
    rules_by_assembly: dict[str, list[schema.Rule]] = defaultdict(list)
    assemblies: list[tuple[schema.Manufacturer, schema.Assembly]] = []
    families: list[tuple[schema.Manufacturer, schema.Family]] = []
    for catalog in catalogs.values():
        for doc in catalog.documents:
            documents[doc.id] = {"title": doc.title, "url": str(doc.url), "version": doc.version}
        for category in catalog.categories:
            categories[category.slug] = {"name": category.name}
        for rule in catalog.rules:
            if rule.category is not None:
                rules_by_category[rule.category].append(rule)
            elif rule.assembly is not None:
                rules_by_assembly[rule.assembly].append(rule)
        assemblies += [(catalog.manufacturer, a) for a in catalog.assemblies]
        families += [(catalog.manufacturer, f) for f in catalog.families]

    conditions: dict[str, Json] = {}
    option_vocabularies: set[str] = set()
    for scoped in [*rules_by_category.values(), *rules_by_assembly.values()]:
        for r in scoped:
            label = vocabulary.conditions[r.condition]
            options = (
                vocabulary.option_attributes[r.material_attribute]
                if r.material_attribute is not None
                else None
            )
            entry: dict[str, Json] = {"label": label.label}
            if label.unit is not None:
                entry["unit"] = label.unit
            if options is not None:
                entry["options"] = options
                option_vocabularies.add(options)
            if conditions.setdefault(r.condition, entry) != entry:
                raise ValueError(f"condition {r.condition!r} is used with different vocabularies")

    variants: dict[str, tuple[schema.Family, schema.Variant]] = {
        v.sku: (f, v) for _, f in families for v in f.variants
    }
    assembly_by_slug = {a.slug: a for _, a in assemblies}

    scenarios: list[Json] = []
    for path in sorted((data_dir / "scenarios").glob("*.yaml")):
        scenario = Scenario.model_validate(read_yaml(path))
        cases: list[Json] = []
        for case in scenario.cases:
            job = case.job if case.from_scratch else {**scenario.job, **case.job}
            expected: dict[str, Json] = {}
            for t in TRUST_LEVELS:
                if case.assembly is not None:
                    assembly = assembly_by_slug[case.assembly]
                    attrs = material(assembly.attributes, t)
                    rules = engine_rules(rules_by_assembly[case.assembly], t)
                else:
                    family, variant = variants[str(case.sku)]
                    attrs = material([*family.attributes, *_derived(family, variant)], t)
                    rules = engine_rules(rules_by_category[family.category], t)
                expected[t] = _outcome(attrs, job, rules)
            target: dict[str, Json] = (
                {"assembly": case.assembly} if case.assembly else {"sku": case.sku}
            )
            cases.append(
                {
                    "id": case.id,
                    "title": case.title,
                    **target,
                    "job": _plain(job),
                    "expected": expected,
                }
            )
        scenarios.append(
            {
                "id": scenario.id,
                "title": scenario.title,
                "job": _plain(scenario.job),
                "cases": cases,
            }
        )

    buildups = schema.load_buildups(data_dir)
    known_buildups = {b.id for b in buildups.buildups}
    for buildup in buildups.buildups:
        for layer in buildup.layers:
            cited = [layer.source, layer.quantity.source if layer.quantity else None]
            for ref in (r for r in cited if r is not None):
                if ref.document not in documents:
                    raise ValueError(
                        f"buildup {buildup.id!r} cites unknown document {ref.document!r}"
                    )
    for room, surfaces in buildups.surfaces.items():
        for surface, offered in surfaces.items():
            for bid in offered:
                if bid not in known_buildups:
                    raise ValueError(f"surface {room}.{surface} uses unknown buildup {bid!r}")

    items = schema.load_items(data_dir)

    return {
        "documents": documents,
        "conditions": dict(sorted(conditions.items())),
        "vocabulary": {
            name: dict(vocabulary.options(name)) for name in sorted(option_vocabularies)
        },
        "attribute_labels": dict(sorted(vocabulary.attributes.items())),
        "value_labels": dict(sorted(vocabulary.values.items())),
        "categories": {
            slug: {
                **c,
                "rules": [_rule(r) for r in sorted(rules_by_category[slug], key=lambda r: r.slug)],
            }
            for slug, c in sorted(categories.items())
        },
        "assemblies": [
            {
                "slug": a.slug,
                "name": a.name,
                "description": a.description,
                "manufacturer": {"name": manufacturer.name, "brand": manufacturer.brand},
                "attributes": [_attribute(x) for x in a.attributes],
                "rules": [
                    _rule(r) for r in sorted(rules_by_assembly[a.slug], key=lambda r: r.slug)
                ],
            }
            for manufacturer, a in assemblies
        ],
        "families": [
            {
                "name": f.name,
                "category": f.category,
                "manufacturer": {"name": manufacturer.name, "brand": manufacturer.brand},
                "attributes": [_attribute(x) for x in f.attributes],
                "variants_source": _source(f.variants_source),
                "variants": [
                    {
                        "sku": v.sku,
                        "dimensions": _plain(v.dimensions),
                        "attributes": [_attribute(x) for x in _derived(f, v)],
                    }
                    for v in f.variants
                ],
            }
            for manufacturer, f in families
        ],
        "scenarios": scenarios,
        "buildups": [_buildup(b) for b in buildups.buildups],
        "surfaceBuildups": {
            room: {surface: list(offered) for surface, offered in sorted(surfaces.items())}
            for room, surfaces in sorted(buildups.surfaces.items())
        },
        "items": [item.model_dump() for item in items.items],
    }


def source_texts(snap: dict[str, Json]) -> set[str]:
    """Every English text a person sees, so each can be translated."""
    texts: set[str] = set()

    def add(value: Json) -> None:
        if isinstance(value, str) and value:
            texts.add(value)

    for words in _dicts(snap["vocabulary"]):
        for label in words.values():
            add(label)
    for condition in _dicts(snap["conditions"]):
        add(condition["label"])
    for name in ("attribute_labels", "value_labels"):
        for label in _dict(snap[name]).values():
            add(label)
    for category in _dicts(snap["categories"]):
        add(category["name"])
        for rule in _list(category["rules"]):
            add(_dict(rule)["description"])
    for owner in [*_list(snap["assemblies"]), *_list(snap["families"])]:
        item = _dict(owner)
        if "slug" in item:
            add(item["name"])
            add(item["description"])
            for rule in _list(item["rules"]):
                add(_dict(rule)["description"])
        for attribute in _list(item["attributes"]):
            add(_dict(attribute).get("note"))
    for buildup in _list(snap["buildups"]):
        item = _dict(buildup)
        add(item["title"])
        add(item["summary"])
        for layer in _list(item["layers"]):
            layer_d = _dict(layer)
            add(layer_d["label"])
            add(layer_d.get("material"))
    for thing in _list(snap["items"]):
        add(_dict(thing)["name"])
        add(_dict(thing)["summary"])
    for scenario in _list(snap["scenarios"]):
        add(_dict(scenario)["title"])
        for case in _list(_dict(scenario)["cases"]):
            add(_dict(case)["title"])
    return texts


def _dict(value: Json) -> dict[str, Json]:
    if not isinstance(value, dict):
        raise TypeError("expected an object")
    return value


def _list(value: Json) -> list[Json]:
    if not isinstance(value, list):
        raise TypeError("expected a list")
    return value


def _dicts(value: Json) -> list[dict[str, Json]]:
    return [_dict(v) for v in _dict(value).values()]


def translation_gaps(data_dir: Path) -> dict[str, list[str]]:
    """English texts without a translation, per language."""
    snap = _dict(snapshot(data_dir))
    needed = source_texts(snap)
    gaps: dict[str, list[str]] = {}
    for language in LANGUAGES:
        known = load_translations(data_dir, language)
        gaps[language] = sorted(needed - known.keys())
    return gaps


def load_translations(data_dir: Path, language: str) -> dict[str, str]:
    path = data_dir / "i18n" / f"{language}.yaml"
    if not path.exists():
        return {}
    return Translations.model_validate(read_yaml(path)).texts


def render(data_dir: Path) -> str:
    snap = _dict(snapshot(data_dir))
    needed = source_texts(snap)
    snap["translations"] = {
        language: {
            text: translated
            for text, translated in sorted(load_translations(data_dir, language).items())
            if text in needed
        }
        for language in LANGUAGES
    }
    return json.dumps(snap, indent=2, ensure_ascii=False) + "\n"


def main(argv: Sequence[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2:
        raise SystemExit("usage: python -m buildwise_api.catalog.export DATA_DIR OUTPUT_JSON")
    data_dir, output = Path(args[0]), Path(args[1])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(data_dir), encoding="utf-8")


if __name__ == "__main__":
    main()
