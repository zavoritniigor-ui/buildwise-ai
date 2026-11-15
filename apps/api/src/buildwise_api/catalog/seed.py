"""Imports catalogue data files into the database, idempotently."""

import sys
from datetime import UTC, date, datetime, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.catalog import schema
from buildwise_api.catalog.validate import problems
from buildwise_api.db import models
from buildwise_api.db.session import make_engine


def _verified_at(day: date | None) -> datetime | None:
    return datetime.combine(day, time(), tzinfo=UTC) if day else None


def _one[T: models.Base](session: Session, model: type[T], **key: object) -> T | None:
    return session.scalars(select(model).filter_by(**key)).one_or_none()


def import_catalog(session: Session, catalog: schema.CatalogFile) -> None:
    manufacturer = _one(session, models.Manufacturer, name=catalog.manufacturer.name)
    if manufacturer is None:
        manufacturer = models.Manufacturer(name=catalog.manufacturer.name)
        session.add(manufacturer)
    manufacturer.website = str(catalog.manufacturer.website)
    session.flush()

    documents: dict[str, models.SourceDocument] = {}
    for doc in catalog.documents:
        row = _one(session, models.SourceDocument, url=str(doc.url), version=doc.version)
        if row is None:
            row = models.SourceDocument(url=str(doc.url), version=doc.version)
            session.add(row)
        row.manufacturer_id = manufacturer.id
        row.doc_type = doc.type
        row.title = doc.title
        row.content_sha256 = doc.sha256
        row.retrieved_at = _verified_at(doc.retrieved_on) or datetime.now(UTC)
        documents[doc.id] = row

    categories: dict[str, models.MaterialCategory] = {}
    for category in catalog.categories:
        row_c = _one(session, models.MaterialCategory, slug=category.slug)
        if row_c is None:
            row_c = models.MaterialCategory(slug=category.slug)
            session.add(row_c)
        row_c.name = category.name
        categories[category.slug] = row_c
    session.flush()

    assemblies: dict[str, models.Assembly] = {}
    for assembly in catalog.assemblies:
        row_a = _one(session, models.Assembly, slug=assembly.slug)
        if row_a is None:
            row_a = models.Assembly(slug=assembly.slug)
            session.add(row_a)
        row_a.name = assembly.name
        row_a.description = assembly.description
        row_a.manufacturer_id = manufacturer.id
        row_a.attributes.clear()
        session.flush()
        for attribute in assembly.attributes:
            row_a.attributes.append(_attribute_row(models.AssemblyAttribute, attribute, documents))
        assemblies[assembly.slug] = row_a
    session.flush()

    for rule in catalog.rules:
        row_r = _one(session, models.CompatibilityRule, slug=rule.slug)
        if row_r is None:
            row_r = models.CompatibilityRule(slug=rule.slug)
            session.add(row_r)
        row_r.category_id = categories[rule.category].id if rule.category else None
        row_r.assembly_id = assemblies[rule.assembly].id if rule.assembly else None
        row_r.alternative_group = rule.alternative.group if rule.alternative else None
        row_r.alternative = rule.alternative.number if rule.alternative else None
        row_r.kind = rule.kind
        row_r.condition = rule.condition
        row_r.material_attribute = rule.material_attribute
        row_r.min_attribute = rule.min_attribute
        row_r.max_attribute = rule.max_attribute
        row_r.description = rule.description
        row_r.source_document_id = documents[rule.source.document].id
        row_r.verification_status = rule.status

    for family in catalog.families:
        statuses = [a.status for a in family.attributes] + [
            d.status for d in family.derived_options
        ]
        all_verified = all(s is models.VerificationStatus.HUMAN_VERIFIED for s in statuses)
        for variant in family.variants:
            product = _one(
                session,
                models.Product,
                manufacturer_id=manufacturer.id,
                manufacturer_sku=variant.sku,
            )
            if product is None:
                product = models.Product(
                    manufacturer_id=manufacturer.id, manufacturer_sku=variant.sku
                )
                session.add(product)
            product.name = f"{family.name} {variant.sku}"
            product.model = family.name
            product.category_id = categories[family.category].id
            product.package_quantity = variant.package_quantity
            product.package_unit = variant.package_unit
            product.verification_status = (
                models.VerificationStatus.HUMAN_VERIFIED
                if all_verified
                else models.VerificationStatus.AI_EXTRACTED
            )
            product.attributes.clear()
            session.flush()
            for attribute in family.attributes:
                product.attributes.append(
                    _attribute_row(models.ProductAttribute, attribute, documents)
                )
            variants_source = documents[family.variants_source.document].id
            for dimension, size in variant.dimensions.items():
                product.attributes.append(
                    models.ProductAttribute(
                        key=dimension,
                        value_num=size,
                        unit="mm",
                        source_document_id=variants_source,
                        source_page=family.variants_source.page,
                        verification_status=models.VerificationStatus.AI_EXTRACTED,
                    )
                )
            for derived in family.derived_options:
                product.attributes.append(_derived_row(derived, variant, documents))
    session.flush()


def _attribute_row[A: (models.ProductAttribute, models.AssemblyAttribute)](
    model: type[A], attribute: schema.Attribute, documents: dict[str, models.SourceDocument]
) -> A:
    value = attribute.value
    return model(
        key=attribute.key,
        value_options=list(value) if isinstance(value, list) else None,
        value_num=value if isinstance(value, Decimal) else None,
        value_text=value if isinstance(value, str) else None,
        unit=attribute.unit,
        source_document_id=documents[attribute.source.document].id,
        source_page=attribute.source.page,
        verification_status=attribute.status,
        verified_at=_verified_at(attribute.verified_on),
    )


def _derived_row(
    derived: schema.DerivedOptions,
    variant: schema.Variant,
    documents: dict[str, models.SourceDocument],
) -> models.ProductAttribute:
    """Store derived options, citing the minimum that decided the outcome.

    The cited source is the highest minimum the variant meets: it is the most
    demanding requirement the variant was checked against.
    """
    qualifying = derived.options_for(variant)
    if not qualifying:
        raise ValueError(f"{variant.sku}: qualifies for no {derived.key} option")
    deciding = max(qualifying, key=lambda m: m.min)
    return models.ProductAttribute(
        key=derived.key,
        value_options=[m.option for m in qualifying],
        source_document_id=documents[deciding.source.document].id,
        source_page=deciding.source.page,
        verification_status=derived.status,
        verified_at=_verified_at(derived.verified_on),
    )


def seed(session: Session, data_dir: Path) -> None:
    vocabulary = schema.load_vocabulary(data_dir)
    for path, catalog in schema.load_catalog_files(data_dir).items():
        found = problems(catalog, vocabulary)
        if found:
            raise ValueError(f"{path.name}: " + "; ".join(found))
        import_catalog(session, catalog)


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../../data")
    with Session(make_engine()) as session, session.begin():
        seed(session, data_dir)


if __name__ == "__main__":
    main()
