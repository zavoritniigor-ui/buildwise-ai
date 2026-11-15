"""Loads published compatibility rules from the knowledge base."""

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility.engine import (
    AnyOf,
    Assessment,
    Attributes,
    AttributeValue,
    MembershipRule,
    Pending,
    RangeRule,
    Rule,
    assess,
)
from buildwise_api.db.models import (
    Assembly,
    AssemblyAttribute,
    CompatibilityRule,
    Product,
    ProductAttribute,
    RuleKind,
    VerificationStatus,
)


def to_engine_rule(row: CompatibilityRule) -> Rule:
    if row.kind is RuleKind.MEMBERSHIP:
        if row.material_attribute is None:
            raise ValueError(f"membership rule {row.slug!r} has no material attribute")
        return MembershipRule(row.slug, row.material_attribute, row.condition)
    return RangeRule(row.slug, row.condition, row.min_attribute, row.max_attribute)


def published_rules(
    session: Session, *, category_id: int | None = None, assembly_id: int | None = None
) -> list[Rule]:
    """The rules that apply to one material category or one assembly.

    * A human-verified rule is evaluated normally.
    * Any other rule that is not rejected becomes Pending and yields UNKNOWN,
      so a requirement nobody has checked can never be skipped.
    * Rules sharing an alternative group become one AnyOf rule, or one Pending
      rule if any of their parts is not yet verified.
    """
    if (category_id is None) == (assembly_id is None):
        raise ValueError("give exactly one of category_id or assembly_id")
    scope = (
        CompatibilityRule.category_id == category_id
        if category_id is not None
        else CompatibilityRule.assembly_id == assembly_id
    )
    rows = session.scalars(
        select(CompatibilityRule)
        .where(scope, CompatibilityRule.verification_status != VerificationStatus.REJECTED)
        .order_by(CompatibilityRule.slug)
    )
    rules: list[Rule] = []
    groups: dict[str, list[CompatibilityRule]] = defaultdict(list)
    for row in rows:
        if row.alternative_group is not None:
            groups[row.alternative_group].append(row)
        elif row.verification_status is VerificationStatus.HUMAN_VERIFIED:
            rules.append(to_engine_rule(row))
        else:
            rules.append(Pending(row.slug))
    for group, members in groups.items():
        rules.append(_group_rule(group, members))
    return sorted(rules, key=lambda rule: rule.id)


def _group_rule(group: str, members: list[CompatibilityRule]) -> Rule:
    if any(m.verification_status is not VerificationStatus.HUMAN_VERIFIED for m in members):
        return Pending(group)
    alternatives: dict[int, list[Rule]] = defaultdict(list)
    for member in members:
        if member.alternative is None:
            raise ValueError(f"rule {member.slug!r} is in group {group!r} without a number")
        alternatives[member.alternative].append(to_engine_rule(member))
    if len(alternatives) < 2:
        raise ValueError(f"alternative group {group!r} has fewer than two alternatives")
    return AnyOf(group, tuple(tuple(alternatives[n]) for n in sorted(alternatives)))


def attribute_values(attributes: Iterable[ProductAttribute | AssemblyAttribute]) -> Attributes:
    """Convert stored characteristics into engine values, keeping their type."""
    values: dict[str, AttributeValue] = {}
    for attribute in attributes:
        if attribute.value_options is not None:
            values[attribute.key] = frozenset(attribute.value_options)
        elif attribute.value_num is not None:
            values[attribute.key] = attribute.value_num
        elif attribute.value_text is not None:
            values[attribute.key] = attribute.value_text
    return values


def verified_attributes(product: Product) -> Attributes:
    """A product's characteristics that a human has verified against a source.

    Anything not yet verified is left out, so the engine reports it as unknown
    instead of trusting it.
    """
    return attribute_values(
        a for a in product.attributes if a.verification_status is VerificationStatus.HUMAN_VERIFIED
    )


def assess_product(session: Session, product: Product, conditions: Attributes) -> Assessment:
    """Assess a catalogue product against job conditions using published rules."""
    rules = published_rules(session, category_id=product.category_id)
    return assess(verified_attributes(product), conditions, rules)


def verified_assembly_attributes(assembly: Assembly) -> Attributes:
    return attribute_values(
        a for a in assembly.attributes if a.verification_status is VerificationStatus.HUMAN_VERIFIED
    )


def assess_assembly(session: Session, assembly: Assembly, conditions: Attributes) -> Assessment:
    """Check job conditions against an assembly's verified requirements."""
    rules = published_rules(session, assembly_id=assembly.id)
    return assess(verified_assembly_attributes(assembly), conditions, rules)
