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

    for rule in catalog.rules:
        row_r = _one(session, models.CompatibilityRule, slug=rule.slug)
        if row_r is None:
            row_r = models.CompatibilityRule(slug=rule.slug)
            session.add(row_r)
        row_r.category_id = categories[rule.category].id
        row_r.kind = rule.kind
        row_r.condition = rule.condition
        row_r.material_attribute = rule.material_attribute
        row_r.min_attribute = rule.min_attribute
        row_r.max_attribute = rule.max_attribute
        row_r.description = rule.description
        row_r.source_document_id = documents[rule.source.document].id
        row_r.verification_status = rule.status

    for family in catalog.families:
        all_verified = all(
            a.status is models.VerificationStatus.HUMAN_VERIFIED for a in family.attributes
        )
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
                product.attributes.append(_attribute_row(attribute, documents))
            if variant.width_mm is not None:
                product.attributes.append(
                    models.ProductAttribute(
                        key="width",
                        value_num=variant.width_mm,
                        unit="mm",
                        source_document_id=documents[family.variants_source.document].id,
                        source_page=family.variants_source.page,
                        verification_status=models.VerificationStatus.AI_EXTRACTED,
                    )
                )
    session.flush()


def _attribute_row(
    attribute: schema.Attribute, documents: dict[str, models.SourceDocument]
) -> models.ProductAttribute:
    value = attribute.value
    return models.ProductAttribute(
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
