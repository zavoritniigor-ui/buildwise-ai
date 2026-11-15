from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from buildwise_api.compatibility import Attributes, Verdict
from buildwise_api.compatibility.repository import assess_product, verified_attributes
from buildwise_api.db.models import (
    CompatibilityRule,
    DocumentType,
    Manufacturer,
    MaterialCategory,
    Product,
    ProductAttribute,
    RuleKind,
    SourceDocument,
    VerificationStatus,
)

VERIFIED = VerificationStatus.HUMAN_VERIFIED
JOB: Attributes = {"substrate": "concrete", "install_temperature_c": Decimal("20")}


@pytest.fixture
def document(session: Session) -> SourceDocument:
    document = SourceDocument(
        doc_type=DocumentType.TDS, title="Example data sheet", url="https://example.com/tds.pdf"
    )
    session.add(document)
    session.flush()
    return document


@pytest.fixture
def product(session: Session, document: SourceDocument) -> Product:
    """A membrane with two published rules. Values are illustrative, not real data."""
    category = MaterialCategory(slug="membrane", name="Waterproofing membrane")
    session.add(category)
    session.flush()
    session.add_all(
        [
            CompatibilityRule(
                slug="substrate",
                category_id=category.id,
                kind=RuleKind.MEMBERSHIP,
                condition="substrate",
                material_attribute="allowed_substrates",
                description="Substrate must be approved.",
                source_document_id=document.id,
                verification_status=VERIFIED,
            ),
            CompatibilityRule(
                slug="install-temperature",
                category_id=category.id,
                kind=RuleKind.RANGE,
                condition="install_temperature_c",
                min_attribute="min_install_temperature_c",
                description="Install above the minimum temperature.",
                source_document_id=document.id,
                verification_status=VERIFIED,
            ),
        ]
    )
    product = Product(
        manufacturer=Manufacturer(name="Example Systems"),
        category_id=category.id,
        name="Example membrane",
        manufacturer_sku="EX-1",
    )
    session.add(product)
    session.flush()
    return product


def _add(
    session: Session,
    product: Product,
    document: SourceDocument,
    key: str,
    status: VerificationStatus = VERIFIED,
    **value: object,
) -> None:
    product.attributes.append(
        ProductAttribute(
            key=key, source_document_id=document.id, verification_status=status, **value
        )
    )
    session.flush()


def test_verified_product_is_compatible(
    session: Session, product: Product, document: SourceDocument
) -> None:
    _add(session, product, document, "allowed_substrates", value_options=["concrete", "plywood"])
    _add(session, product, document, "min_install_temperature_c", value_num=Decimal("5"))
    assert assess_product(session, product, JOB).verdict is Verdict.COMPATIBLE


def test_wrong_substrate_is_incompatible(
    session: Session, product: Product, document: SourceDocument
) -> None:
    _add(session, product, document, "allowed_substrates", value_options=["plywood"])
    _add(session, product, document, "min_install_temperature_c", value_num=Decimal("5"))
    assert assess_product(session, product, JOB).verdict is Verdict.INCOMPATIBLE


def test_unverified_attribute_is_ignored_and_gives_unknown(
    session: Session, product: Product, document: SourceDocument
) -> None:
    _add(
        session,
        product,
        document,
        "allowed_substrates",
        status=VerificationStatus.AI_EXTRACTED,
        value_options=["concrete"],
    )
    _add(session, product, document, "min_install_temperature_c", value_num=Decimal("5"))
    assert "allowed_substrates" not in verified_attributes(product)
    assert assess_product(session, product, JOB).verdict is Verdict.UNKNOWN


def test_product_without_data_is_unknown(session: Session, product: Product) -> None:
    assert assess_product(session, product, JOB).verdict is Verdict.UNKNOWN


def test_attribute_values_keep_their_type(
    session: Session, product: Product, document: SourceDocument
) -> None:
    _add(session, product, document, "allowed_substrates", value_options=["concrete"])
    _add(session, product, document, "min_install_temperature_c", value_num=Decimal("5"))
    _add(session, product, document, "colour", value_text="orange")
    assert verified_attributes(product) == {
        "allowed_substrates": frozenset({"concrete"}),
        "min_install_temperature_c": Decimal("5"),
        "colour": "orange",
    }


def test_attribute_holds_exactly_one_kind_of_value(
    session: Session, product: Product, document: SourceDocument
) -> None:
    with pytest.raises(IntegrityError, match="value_present"):
        _add(session, product, document, "mixed", value_text="a", value_num=Decimal("1"))


def test_attribute_options_cannot_be_empty(
    session: Session, product: Product, document: SourceDocument
) -> None:
    with pytest.raises(IntegrityError, match="options_not_empty"):
        _add(session, product, document, "allowed_substrates", value_options=[])
