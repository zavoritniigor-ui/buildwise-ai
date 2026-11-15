"""Loads published compatibility rules from the knowledge base."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility.engine import MembershipRule, RangeRule, Rule
from buildwise_api.db.models import CompatibilityRule, RuleKind, VerificationStatus


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
