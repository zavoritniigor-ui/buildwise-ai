from decimal import Decimal

import pytest

from buildwise_api.compatibility import (
    AnyOf,
    Attributes,
    MembershipRule,
    RangeRule,
    Rule,
    Verdict,
    assess,
)

SUBSTRATE = MembershipRule("substrate", "allowed_substrates", "substrate")
TEMPERATURE = RangeRule(
    "install-temperature",
    "install_temperature_c",
    min_attribute="min_install_temperature_c",
    max_attribute="max_install_temperature_c",
)
RULES: list[Rule] = [SUBSTRATE, TEMPERATURE]

# Illustrative values for tests only, not data from any manufacturer.
MEMBRANE: Attributes = {
    "allowed_substrates": frozenset({"cement_board", "concrete"}),
    "min_install_temperature_c": Decimal("5"),
    "max_install_temperature_c": Decimal("35"),
}
JOB: Attributes = {"substrate": "concrete", "install_temperature_c": Decimal("20")}


def test_compatible_when_every_rule_is_confirmed() -> None:
    result = assess(MEMBRANE, JOB, RULES)
    assert result.verdict is Verdict.COMPATIBLE
    assert [f.verdict for f in result.findings] == [Verdict.COMPATIBLE] * 2


def test_incompatible_when_substrate_is_not_allowed() -> None:
    result = assess(MEMBRANE, {**JOB, "substrate": "plywood"}, RULES)
    assert result.verdict is Verdict.INCOMPATIBLE
    assert "plywood" in result.findings[0].reason
    assert "cement_board, concrete" in result.findings[0].reason


@pytest.mark.parametrize(
    ("temperature", "expected"),
    [
        ("4.9", Verdict.INCOMPATIBLE),
        ("5", Verdict.COMPATIBLE),
        ("35", Verdict.COMPATIBLE),
        ("35.1", Verdict.INCOMPATIBLE),
    ],
)
def test_range_limits_are_inclusive(temperature: str, expected: Verdict) -> None:
    job = {**JOB, "install_temperature_c": Decimal(temperature)}
    assert TEMPERATURE.evaluate(MEMBRANE, job).verdict is expected


def test_missing_material_data_is_unknown_not_compatible() -> None:
    material = {k: v for k, v in MEMBRANE.items() if k != "allowed_substrates"}
    result = assess(material, JOB, RULES)
    assert result.verdict is Verdict.UNKNOWN
    assert "allowed_substrates" in result.findings[0].reason


def test_missing_job_condition_is_unknown() -> None:
    result = assess(MEMBRANE, {"substrate": "concrete"}, RULES)
    assert result.verdict is Verdict.UNKNOWN
    assert "install_temperature_c" in result.findings[1].reason


def test_one_missing_bound_is_unknown() -> None:
    material = {k: v for k, v in MEMBRANE.items() if k != "max_install_temperature_c"}
    assert TEMPERATURE.evaluate(material, JOB).verdict is Verdict.UNKNOWN


def test_confirmed_violation_wins_over_a_missing_bound() -> None:
    material = {k: v for k, v in MEMBRANE.items() if k != "max_install_temperature_c"}
    job = {**JOB, "install_temperature_c": Decimal("-10")}
    assert TEMPERATURE.evaluate(material, job).verdict is Verdict.INCOMPATIBLE


def test_incompatible_wins_over_unknown() -> None:
    result = assess(MEMBRANE, {"substrate": "plywood"}, RULES)
    assert [f.verdict for f in result.findings] == [Verdict.INCOMPATIBLE, Verdict.UNKNOWN]
    assert result.verdict is Verdict.INCOMPATIBLE


def test_no_rules_means_no_evidence() -> None:
    assert assess(MEMBRANE, JOB, []).verdict is Verdict.UNKNOWN


def test_one_sided_range_rule() -> None:
    rule = RangeRule("min-thickness", "thickness_mm", min_attribute="min_thickness_mm")
    material: Attributes = {"min_thickness_mm": Decimal("3")}
    assert rule.evaluate(material, {"thickness_mm": Decimal("3")}).verdict is Verdict.COMPATIBLE
    assert rule.evaluate(material, {"thickness_mm": Decimal("2")}).verdict is Verdict.INCOMPATIBLE


def test_range_rule_requires_a_bound() -> None:
    with pytest.raises(ValueError, match="minimum or a maximum"):
        RangeRule("broken", "thickness_mm")


def test_wrongly_typed_data_fails_loudly() -> None:
    with pytest.raises(TypeError, match="allowed_substrates"):
        SUBSTRATE.evaluate({"allowed_substrates": "concrete"}, JOB)
    with pytest.raises(TypeError, match="install_temperature_c"):
        TEMPERATURE.evaluate(MEMBRANE, {"install_temperature_c": "20"})


def test_every_finding_names_its_rule() -> None:
    result = assess(MEMBRANE, JOB, RULES)
    assert [f.rule_id for f in result.findings] == ["substrate", "install-temperature"]


def test_missing_conditions_become_questions() -> None:
    result = assess(MEMBRANE, {}, RULES)
    assert result.missing_conditions == ("install_temperature_c", "substrate")


def test_missing_material_data_is_not_a_question_for_the_user() -> None:
    material = {k: v for k, v in MEMBRANE.items() if k != "allowed_substrates"}
    assert assess(material, JOB, RULES).missing_conditions == ()


def test_no_questions_once_a_mismatch_is_confirmed() -> None:
    result = assess(MEMBRANE, {"substrate": "plywood"}, [SUBSTRATE])
    assert result.missing_conditions == ()


# Two ways to comply: a thick subfloor on wide joists, or a thinner one on close joists.
SUBFLOOR = AnyOf(
    "subfloor-stiffness",
    (
        (
            RangeRule("thick", "subfloor_mm", min_attribute="thick_min_mm"),
            RangeRule("wide", "joist_spacing_mm", max_attribute="wide_max_mm"),
        ),
        (
            RangeRule("thin", "subfloor_mm", min_attribute="thin_min_mm"),
            RangeRule("close", "joist_spacing_mm", max_attribute="close_max_mm"),
        ),
    ),
)
ASSEMBLY: Attributes = {
    "thick_min_mm": Decimal("19"),
    "wide_max_mm": Decimal("488"),
    "thin_min_mm": Decimal("16"),
    "close_max_mm": Decimal("406"),
}


@pytest.mark.parametrize(
    ("subfloor", "joists", "expected"),
    [
        ("19", "488", Verdict.COMPATIBLE),
        ("16", "406", Verdict.COMPATIBLE),
        ("16", "488", Verdict.INCOMPATIBLE),
        ("15", "300", Verdict.INCOMPATIBLE),
        ("19", "600", Verdict.INCOMPATIBLE),
    ],
)
def test_any_of_alternatives(subfloor: str, joists: str, expected: Verdict) -> None:
    job = {"subfloor_mm": Decimal(subfloor), "joist_spacing_mm": Decimal(joists)}
    assert SUBFLOOR.evaluate(ASSEMBLY, job).verdict is expected


def test_any_of_explains_every_failed_alternative() -> None:
    job = {"subfloor_mm": Decimal("16"), "joist_spacing_mm": Decimal("488")}
    reason = SUBFLOOR.evaluate(ASSEMBLY, job).reason
    assert "alternative 1" in reason
    assert "alternative 2" in reason


def test_any_of_asks_only_what_can_still_decide() -> None:
    finding = SUBFLOOR.evaluate(ASSEMBLY, {"subfloor_mm": Decimal("16")})
    assert finding.verdict is Verdict.UNKNOWN
    assert finding.missing_conditions == {"joist_spacing_mm"}


def test_any_of_is_met_without_unrelated_data() -> None:
    finding = SUBFLOOR.evaluate(
        ASSEMBLY, {"subfloor_mm": Decimal("19"), "joist_spacing_mm": Decimal("400")}
    )
    assert finding.verdict is Verdict.COMPATIBLE


def test_any_of_needs_two_alternatives() -> None:
    with pytest.raises(ValueError, match="two non-empty"):
        AnyOf("one", ((SUBSTRATE,),))
