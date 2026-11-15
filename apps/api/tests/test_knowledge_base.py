from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from buildwise_api.compatibility import Attributes, Verdict, assess
from buildwise_api.compatibility.repository import published_rules
from buildwise_api.db.models import (
    CompatibilityRule,
    DocumentType,
    MaterialCategory,
    Operation,
    RuleKind,
    SourceDocument,
    Stage,
    VerificationStatus,
)


@pytest.fixture
def category(session: Session) -> MaterialCategory:
    category = MaterialCategory(slug="membrane", name="Waterproofing membrane")
    session.add(category)
    session.flush()
    return category


@pytest.fixture
def document(session: Session) -> SourceDocument:
    document = SourceDocument(
        doc_type=DocumentType.INSTALLATION_MANUAL,
        title="Example installation handbook",
        url="https://example.com/handbook.pdf",
    )
    session.add(document)
    session.flush()
    return document


def _rule(category: MaterialCategory, slug: str, **fields: object) -> CompatibilityRule:
    defaults: dict[str, object] = {
        "slug": slug,
        "category_id": category.id,
        "kind": RuleKind.MEMBERSHIP,
        "condition": "substrate",
        "material_attribute": "allowed_substrates",
        "description": "Substrate must be approved for the membrane.",
    }
    return CompatibilityRule(**(defaults | fields))


def _verified(document: SourceDocument) -> dict[str, object]:
    return {
        "verification_status": VerificationStatus.HUMAN_VERIFIED,
        "source_document_id": document.id,
    }


def test_new_rule_is_unverified_and_not_published(
    session: Session, category: MaterialCategory
) -> None:
    rule = _rule(category, "substrate")
    session.add(rule)
    session.flush()
    assert rule.verification_status is VerificationStatus.UNVERIFIED
    assert published_rules(session, category.id) == []


def test_ai_extracted_rule_is_not_published(session: Session, category: MaterialCategory) -> None:
    session.add(_rule(category, "substrate", verification_status=VerificationStatus.AI_EXTRACTED))
    session.flush()
    assert published_rules(session, category.id) == []


def test_verified_rule_requires_source(session: Session, category: MaterialCategory) -> None:
    session.add(_rule(category, "substrate", verification_status=VerificationStatus.HUMAN_VERIFIED))
    with pytest.raises(IntegrityError, match="verified_requires_source"):
        session.flush()


def test_membership_rule_needs_material_attribute(
    session: Session, category: MaterialCategory
) -> None:
    session.add(_rule(category, "broken", material_attribute=None))
    with pytest.raises(IntegrityError, match="membership_shape"):
        session.flush()


def test_range_rule_needs_a_bound(session: Session, category: MaterialCategory) -> None:
    session.add(_rule(category, "broken", kind=RuleKind.RANGE, material_attribute=None))
    with pytest.raises(IntegrityError, match="range_shape"):
        session.flush()


def test_published_rules_drive_the_engine(
    session: Session, category: MaterialCategory, document: SourceDocument
) -> None:
    session.add_all(
        [
            _rule(category, "substrate", **_verified(document)),
            _rule(
                category,
                "install-temperature",
                kind=RuleKind.RANGE,
                condition="install_temperature_c",
                material_attribute=None,
                min_attribute="min_install_temperature_c",
                description="Install within the temperature limits.",
                **_verified(document),
            ),
            _rule(category, "draft-rule"),
        ]
    )
    session.flush()

    rules = published_rules(session, category.id)
    assert [rule.id for rule in rules] == ["install-temperature", "substrate"]

    # Illustrative values for tests only, not data from any manufacturer.
    material: Attributes = {
        "allowed_substrates": frozenset({"concrete"}),
        "min_install_temperature_c": Decimal("5"),
    }
    job: Attributes = {"substrate": "concrete", "install_temperature_c": Decimal("2")}
    assert assess(material, job, rules).verdict is Verdict.INCOMPATIBLE
    assert (
        assess(material, {**job, "install_temperature_c": Decimal("10")}, rules).verdict
        is Verdict.COMPATIBLE
    )


def test_rules_are_scoped_to_their_category(
    session: Session, category: MaterialCategory, document: SourceDocument
) -> None:
    other = MaterialCategory(slug="grout", name="Grout")
    session.add(other)
    session.flush()
    session.add(_rule(category, "substrate", **_verified(document)))
    session.flush()
    assert published_rules(session, other.id) == []


def test_operation_order_is_unique_within_a_stage(session: Session) -> None:
    session.add_all(
        [
            Operation(
                slug="apply-membrane", name="Apply membrane", stage=Stage.WATERPROOFING, sequence=1
            ),
            Operation(
                slug="seal-corners", name="Seal corners", stage=Stage.WATERPROOFING, sequence=1
            ),
        ]
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_operation_defaults_to_no_licence_requirement(session: Session) -> None:
    operation = Operation(slug="set-tile", name="Set tile", stage=Stage.TILING, sequence=1)
    session.add(operation)
    session.flush()
    assert operation.requires_licensed_professional is False
