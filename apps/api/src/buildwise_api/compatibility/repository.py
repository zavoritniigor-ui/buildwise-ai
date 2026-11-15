"""Loads published compatibility rules from the knowledge base."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility.engine import (
    Assessment,
    Attributes,
    AttributeValue,
    MembershipRule,
    RangeRule,
    Rule,
    assess,
)
from buildwise_api.db.models import CompatibilityRule, Product, RuleKind, VerificationStatus


def to_engine_rule(row: CompatibilityRule) -> Rule:
    if row.kind is RuleKind.MEMBERSHIP:
        if row.material_attribute is None:
            raise ValueError(f"membership rule {row.slug!r} has no material attribute")
        return MembershipRule(row.slug, row.material_attribute, row.condition)
    return RangeRule(row.slug, row.condition, row.min_attribute, row.max_attribute)


def published_rules(session: Session, category_id: int) -> list[Rule]:
    """Rules for a material category that a human has verified against a source.

    Unverified, AI-extracted and rejected rules never reach the engine.
    """
    rows = session.scalars(
        select(CompatibilityRule)
        .where(
            CompatibilityRule.category_id == category_id,
            CompatibilityRule.verification_status == VerificationStatus.HUMAN_VERIFIED,
        )
        .order_by(CompatibilityRule.slug)
    )
    return [to_engine_rule(row) for row in rows]


def verified_attributes(product: Product) -> Attributes:
    """A product's characteristics that a human has verified against a source.

    Anything not yet verified is left out, so the engine reports it as unknown
    instead of trusting it.
    """
    attributes: dict[str, AttributeValue] = {}
    for attribute in product.attributes:
        if attribute.verification_status is not VerificationStatus.HUMAN_VERIFIED:
            continue
        if attribute.value_options is not None:
            attributes[attribute.key] = frozenset(attribute.value_options)
        elif attribute.value_num is not None:
            attributes[attribute.key] = attribute.value_num
        elif attribute.value_text is not None:
            attributes[attribute.key] = attribute.value_text
    return attributes


def assess_product(session: Session, product: Product, conditions: Attributes) -> Assessment:
    """Assess a catalogue product against job conditions using published rules."""
    rules = published_rules(session, product.category_id)
    return assess(verified_attributes(product), conditions, rules)
