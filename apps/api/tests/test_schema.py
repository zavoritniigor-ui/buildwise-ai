from datetime import UTC, datetime
from decimal import Decimal

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from buildwise_api.db.models import (
    Availability,
    Base,
    DocumentType,
    Manufacturer,
    MaterialCategory,
    Product,
    ProductAttribute,
    Retailer,
    RetailOffer,
    SourceDocument,
    VerificationStatus,
)

NOW = datetime(2026, 11, 14, tzinfo=UTC)


@pytest.fixture
def product(session: Session) -> Product:
    product = Product(
        manufacturer=Manufacturer(name="Example Systems"),
        category_id=_category(session).id,
        name="Example waterproofing membrane",
        manufacturer_sku="EX-200",
        package_quantity=Decimal("5"),
        package_unit="m2",
    )
    session.add(product)
    session.flush()
    return product


def _category(session: Session) -> MaterialCategory:
    category = MaterialCategory(slug="waterproofing-membrane", name="Waterproofing membrane")
    session.add(category)
    session.flush()
    return category


def test_migrations_create_every_model_table(engine: Engine) -> None:
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())


def test_models_and_migrations_do_not_drift(engine: Engine, alembic_config: Config) -> None:
    command.check(alembic_config)


def test_new_product_defaults_to_unverified(product: Product) -> None:
    assert product.verification_status is VerificationStatus.UNVERIFIED


def test_manufacturer_sku_is_unique_per_manufacturer(session: Session, product: Product) -> None:
    session.add(
        Product(
            manufacturer_id=product.manufacturer_id,
            category_id=product.category_id,
            name="Duplicate",
            manufacturer_sku=product.manufacturer_sku,
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_human_verified_attribute_requires_source(session: Session, product: Product) -> None:
    session.add(
        ProductAttribute(
            product_id=product.id,
            key="max_service_temperature",
            value_num=Decimal("70"),
            unit="C",
            verification_status=VerificationStatus.HUMAN_VERIFIED,
        )
    )
    with pytest.raises(IntegrityError, match="verified_requires_source"):
        session.flush()


def test_human_verified_attribute_with_source_is_accepted(
    session: Session, product: Product
) -> None:
    document = SourceDocument(
        doc_type=DocumentType.TDS,
        title="Example membrane technical data sheet",
        url="https://example.com/tds.pdf",
    )
    session.add(document)
    session.flush()
    session.add(
        ProductAttribute(
            product_id=product.id,
            key="max_service_temperature",
            value_num=Decimal("70"),
            unit="C",
            source_document_id=document.id,
            source_page=2,
            verification_status=VerificationStatus.HUMAN_VERIFIED,
            verified_at=NOW,
        )
    )
    session.flush()


def test_attribute_needs_a_value(session: Session, product: Product) -> None:
    session.add(ProductAttribute(product_id=product.id, key="empty"))
    with pytest.raises(IntegrityError, match="value_present"):
        session.flush()


def _offer(product: Product, retailer: Retailer, **overrides: object) -> RetailOffer:
    fields: dict[str, object] = {
        "product_id": product.id,
        "retailer_id": retailer.id,
        "retailer_sku": "R-1",
        "data_source": "test",
        "last_checked_at": NOW,
    }
    return RetailOffer(**(fields | overrides))


@pytest.fixture
def retailer(session: Session) -> Retailer:
    retailer = Retailer(name="Example Hardware")
    session.add(retailer)
    session.flush()
    return retailer


def test_offer_price_may_be_unknown(session: Session, product: Product, retailer: Retailer) -> None:
    offer = _offer(product, retailer)
    session.add(offer)
    session.flush()
    assert offer.price is None
    assert offer.availability is Availability.UNKNOWN
    assert offer.currency == "CAD"


def test_offer_price_cannot_be_negative(
    session: Session, product: Product, retailer: Retailer
) -> None:
    session.add(_offer(product, retailer, price=Decimal("-1")))
    with pytest.raises(IntegrityError, match="price_non_negative"):
        session.flush()


def test_offer_requires_last_checked_timestamp(
    session: Session, product: Product, retailer: Retailer
) -> None:
    session.add(_offer(product, retailer, last_checked_at=None))
    with pytest.raises(IntegrityError):
        session.flush()


def test_chain_wide_offer_is_unique_per_retailer_sku(
    session: Session, product: Product, retailer: Retailer
) -> None:
    session.add_all([_offer(product, retailer), _offer(product, retailer)])
    with pytest.raises(IntegrityError):
        session.flush()


def test_deleting_product_removes_its_attributes_and_offers(
    session: Session, product: Product, retailer: Retailer
) -> None:
    session.add(_offer(product, retailer))
    session.add(ProductAttribute(product_id=product.id, key="colour", value_text="orange"))
    session.flush()
    session.delete(product)
    session.flush()
    assert session.query(RetailOffer).count() == 0
    assert session.query(ProductAttribute).count() == 0


def test_migration_can_be_reverted_and_reapplied(engine: Engine, alembic_config: Config) -> None:
    command.downgrade(alembic_config, "base")
    assert "product" not in inspect(engine).get_table_names()
    command.upgrade(alembic_config, "head")
    assert "product" in inspect(engine).get_table_names()
