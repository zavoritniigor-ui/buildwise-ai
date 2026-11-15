"""Consistency checks that a schema alone cannot express."""

from buildwise_api.catalog.schema import Attribute, CatalogFile, SourceRef, Vocabulary


def problems(catalog: CatalogFile, vocabulary: Vocabulary) -> list[str]:
    found: list[str] = []
    pages = {doc.id: doc.pages for doc in catalog.documents}
    categories = {category.slug for category in catalog.categories}

    def check_source(where: str, source: SourceRef) -> None:
        if source.document not in pages:
            found.append(f"{where}: unknown document {source.document!r}")
        elif source.page > pages[source.document]:
            found.append(f"{where}: page {source.page} beyond {pages[source.document]} pages")

    def check_attribute(where: str, attribute: Attribute) -> None:
        check_source(where, attribute.source)
        if attribute.unit is not None and attribute.unit not in vocabulary.units:
            found.append(f"{where}: unknown unit {attribute.unit!r}")
        vocab_name = vocabulary.option_attributes.get(attribute.key)
        if vocab_name is not None:
            if not isinstance(attribute.value, list):
                found.append(f"{where}: {attribute.key!r} must be a list of options")
                return
            allowed = vocabulary.options(vocab_name)
            for value in attribute.value:
                if value not in allowed:
                    found.append(f"{where}: {value!r} is not a known {vocab_name}")
            if len(set(attribute.value)) != len(attribute.value):
                found.append(f"{where}: duplicate options")
        elif isinstance(attribute.value, list):
            found.append(f"{where}: {attribute.key!r} has no vocabulary for its options")

    for rule in catalog.rules:
        where = f"rule {rule.slug}"
        check_source(where, rule.source)
        if rule.category not in categories:
            found.append(f"{where}: unknown category {rule.category!r}")
        if rule.material_attribute and rule.material_attribute not in vocabulary.option_attributes:
            found.append(f"{where}: {rule.material_attribute!r} has no vocabulary")

    skus: set[str] = set()
    for family in catalog.families:
        if family.category not in categories:
            found.append(f"{family.name}: unknown category {family.category!r}")
        check_source(f"{family.name} variants", family.variants_source)
        keys = [attribute.key for attribute in family.attributes]
        for key in {k for k in keys if keys.count(k) > 1}:
            found.append(f"{family.name}: duplicate attribute {key!r}")
        for attribute in family.attributes:
            check_attribute(f"{family.name}.{attribute.key}", attribute)
        for variant in family.variants:
            if variant.sku in skus:
                found.append(f"{family.name}: duplicate SKU {variant.sku!r}")
            skus.add(variant.sku)
            if variant.package_unit not in vocabulary.units:
                found.append(f"{variant.sku}: unknown unit {variant.package_unit!r}")
    return found
