"""Scenario BW-001: curbless shower in a Montreal bathroom on a wood floor.

The scenario comes from docs/concept.md, section 17. These tests run the real
importer, rule loader and engine against the Schluter shower assemblies.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility import Attributes, Verdict
from buildwise_api.compatibility.repository import assess_assembly
from buildwise_api.db.models import Assembly

# What the BW-001 brief tells us: a wood floor, in Quebec.
BRIEF: Attributes = {"subfloor": "plywood", "country": "CA"}

COMPLETE: Attributes = {
    **BRIEF,
    "subfloor_edge": "tongue_and_groove",
    "subfloor_thickness_mm": Decimal("16"),
    "joist_type": "dimensional_lumber",
    "joist_spacing_mm": Decimal("406"),
    "shower_base": "kerdi_shower_tt",
    "floor_waterproofing": "ditra_heat",
}


def _assembly(session: Session, slug: str) -> Assembly:
    return session.scalars(select(Assembly).filter_by(slug=slug)).one()


def test_unreviewed_knowledge_never_concludes(unreviewed: Session) -> None:
    result = assess_assembly(unreviewed, _assembly(unreviewed, "schluter-k-shcr"), COMPLETE)
    assert result.verdict is Verdict.UNKNOWN


def test_brief_alone_produces_clarifying_questions(reviewed: Session) -> None:
    result = assess_assembly(reviewed, _assembly(reviewed, "schluter-k-shcr"), BRIEF)
    assert result.verdict is Verdict.UNKNOWN
    assert result.missing_conditions == (
        "floor_waterproofing",
        "joist_spacing_mm",
        "joist_type",
        "shower_base",
        "subfloor_edge",
        "subfloor_thickness_mm",
    )


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({}, Verdict.COMPATIBLE),
        ({"joist_spacing_mm": Decimal("488")}, Verdict.INCOMPATIBLE),
        ({"country": "US"}, Verdict.INCOMPATIBLE),
        (
            {
                "country": "US",
                "subfloor_thickness_mm": Decimal("19"),
                "joist_spacing_mm": Decimal("488"),
            },
            Verdict.COMPATIBLE,
        ),
        ({"subfloor_thickness_mm": Decimal("15")}, Verdict.INCOMPATIBLE),
        ({"joist_type": "engineered_i_joist"}, Verdict.INCOMPATIBLE),
        ({"subfloor_edge": "square_edge"}, Verdict.INCOMPATIBLE),
        ({"subfloor": "concrete"}, Verdict.INCOMPATIBLE),
        ({"shower_base": "portland_cement_mortar_bed"}, Verdict.INCOMPATIBLE),
    ],
    ids=[
        "canadian-16mm-on-406",
        "16mm-on-488",
        "16mm-outside-canada",
        "19mm-on-488",
        "15mm-too-thin",
        "i-joists",
        "square-edge-panels",
        "concrete",
        "mortar-bed",
    ],
)
def test_recessed_curbless_over_wood(
    reviewed: Session, change: Attributes, expected: Verdict
) -> None:
    result = assess_assembly(
        reviewed, _assembly(reviewed, "schluter-k-shcr"), {**COMPLETE, **change}
    )
    assert result.verdict is expected


def test_mortar_bed_is_allowed_in_the_non_recessed_assembly(reviewed: Session) -> None:
    job: Attributes = {
        "subfloor": "plywood",
        "shower_base": "portland_cement_mortar_bed",
        "floor_waterproofing": "kerdi",
    }
    result = assess_assembly(reviewed, _assembly(reviewed, "schluter-k-shbf"), job)
    assert result.verdict is Verdict.COMPATIBLE


def test_failed_stiffness_check_explains_both_options(reviewed: Session) -> None:
    job = {**COMPLETE, "joist_spacing_mm": Decimal("488")}
    result = assess_assembly(reviewed, _assembly(reviewed, "schluter-k-shcr"), job)
    finding = next(f for f in result.findings if f.rule_id == "k-shcr-subfloor-stiffness")
    assert "alternative 1" in finding.reason
    assert "alternative 2" in finding.reason
