"""Deterministic material compatibility engine.

Decides whether a material suits a set of job conditions by evaluating explicit
rules. There is no AI here and no guessing:

* COMPATIBLE   - every rule confirmed the material fits the conditions.
* INCOMPATIBLE - at least one rule found a confirmed mismatch.
* UNKNOWN      - no confirmed mismatch, but data needed for a conclusion is
                 missing. Missing data is never treated as compatible.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Protocol

type AttributeValue = str | Decimal | frozenset[str]
type Attributes = Mapping[str, AttributeValue]


class Verdict(StrEnum):
    COMPATIBLE = "compatible"
    INCOMPATIBLE = "incompatible"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class Finding:
    rule_id: str
    verdict: Verdict
    reason: str


@dataclass(frozen=True)
class Assessment:
    verdict: Verdict
    findings: tuple[Finding, ...]


class Rule(Protocol):
    @property
    def id(self) -> str: ...

    def evaluate(self, material: Attributes, conditions: Attributes) -> Finding: ...


def _text(attributes: Attributes, key: str) -> str | None:
    value = attributes.get(key)
    if value is None or isinstance(value, str):
        return value
    raise TypeError(f"{key!r} must be text, got {type(value).__name__}")


def _number(attributes: Attributes, key: str) -> Decimal | None:
    value = attributes.get(key)
    if value is None or isinstance(value, Decimal):
        return value
    raise TypeError(f"{key!r} must be a Decimal, got {type(value).__name__}")


def _options(attributes: Attributes, key: str) -> frozenset[str] | None:
    value = attributes.get(key)
    if value is None or isinstance(value, frozenset):
        return value
    raise TypeError(f"{key!r} must be a frozenset, got {type(value).__name__}")


@dataclass(frozen=True)
class MembershipRule:
    """The job condition must be one of the options the material allows.

    Example: the substrate on site must be among the material's approved
    substrates.
    """

    id: str
    material_attribute: str
    condition: str

    def evaluate(self, material: Attributes, conditions: Attributes) -> Finding:
        allowed = _options(material, self.material_attribute)
        actual = _text(conditions, self.condition)
        if allowed is None:
            return self._finding(
                Verdict.UNKNOWN, f"material has no data for {self.material_attribute!r}"
            )
        if actual is None:
            return self._finding(Verdict.UNKNOWN, f"job condition {self.condition!r} is not known")
        if actual in allowed:
            return self._finding(
                Verdict.COMPATIBLE, f"{self.condition} {actual!r} is allowed by the material"
            )
        return self._finding(
            Verdict.INCOMPATIBLE,
            f"{self.condition} {actual!r} is not among the allowed: {', '.join(sorted(allowed))}",
        )

    def _finding(self, verdict: Verdict, reason: str) -> Finding:
        return Finding(self.id, verdict, reason)


@dataclass(frozen=True)
class RangeRule:
    """The job condition must lie within the material's limits (inclusive).

    Example: the installation temperature must be between the material's
    minimum and maximum application temperatures. At least one bound is
    required; a rule may be one-sided.
    """

    id: str
    condition: str
    min_attribute: str | None = None
    max_attribute: str | None = None

    def __post_init__(self) -> None:
        if self.min_attribute is None and self.max_attribute is None:
            raise ValueError(f"rule {self.id!r} needs a minimum or a maximum attribute")

    def evaluate(self, material: Attributes, conditions: Attributes) -> Finding:
        actual = _number(conditions, self.condition)
        if actual is None:
            return self._finding(Verdict.UNKNOWN, f"job condition {self.condition!r} is not known")

        missing: list[str] = []
        for attribute, is_minimum in ((self.min_attribute, True), (self.max_attribute, False)):
            if attribute is None:
                continue
            limit = _number(material, attribute)
            if limit is None:
                missing.append(attribute)
            elif (actual < limit) if is_minimum else (actual > limit):
                side = "below the minimum" if is_minimum else "above the maximum"
                return self._finding(
                    Verdict.INCOMPATIBLE, f"{self.condition} {actual} is {side} {limit}"
                )

        if missing:
            return self._finding(
                Verdict.UNKNOWN, f"material has no data for {', '.join(map(repr, missing))}"
            )
        return self._finding(Verdict.COMPATIBLE, f"{self.condition} {actual} is within limits")

    def _finding(self, verdict: Verdict, reason: str) -> Finding:
        return Finding(self.id, verdict, reason)


def assess(material: Attributes, conditions: Attributes, rules: Sequence[Rule]) -> Assessment:
    """Evaluate every rule and combine the findings into one verdict.

    A confirmed mismatch wins over missing data, and missing data wins over
    confirmations. With no rules there is no evidence, so the verdict is UNKNOWN.
    """
    findings = tuple(rule.evaluate(material, conditions) for rule in rules)
    verdicts = {finding.verdict for finding in findings}
    if Verdict.INCOMPATIBLE in verdicts:
        verdict = Verdict.INCOMPATIBLE
    elif Verdict.UNKNOWN in verdicts or not findings:
        verdict = Verdict.UNKNOWN
    else:
        verdict = Verdict.COMPATIBLE
    return Assessment(verdict, findings)
