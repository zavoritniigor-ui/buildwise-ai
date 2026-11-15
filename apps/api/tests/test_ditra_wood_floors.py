"""Tile floors over wood with Schluter DITRA (DITRA Installation Handbook, pages 4-6).

The bathroom floor outside the BW-001 shower is one of these assemblies.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility import Attributes, Verdict
from buildwise_api.compatibility.repository import assess_assembly
from buildwise_api.db.models import Assembly

# A common Quebec floor: 5/8 in T&G plywood on 2x10 joists at 16 in.
FLOOR: Attributes = {
    "subfloor": "plywood",
    "subfloor_edge": "tongue_and_groove",
    "subfloor_thickness_mm": Decimal("16"),
    "joist_type": "dimensional_lumber",
    "joist_spacing_mm": Decimal("406"),
    "tile_material": "porcelain",
    "tile_min_side_mm": Decimal("300"),
    "uncoupling_membrane": "ditra",
    "membrane_bonding_mortar": "modified_thinset",
    "tile_setting_mortar": "unmodified_thinset",
}

WOOD_DETAILS = ["d-w16-t", "d-w19-t", "d-w24-t", "d-w24-xl-t", "d-w-s"]


def _assess(session: Session, code: str, job: Attributes) -> Verdict:
    assembly = session.scalars(select(Assembly).filter_by(slug=f"schluter-{code}")).one()
    return assess_assembly(session, assembly, job).verdict


@pytest.mark.parametrize("code", WOOD_DETAILS)
def test_unreviewed_details_never_conclude(unreviewed: Session, code: str) -> None:
    assert _assess(unreviewed, code, FLOOR) is Verdict.UNKNOWN


def test_typical_floor_fits_only_the_406_detail(reviewed: Session) -> None:
    verdicts = {code: _assess(reviewed, code, FLOOR) for code in WOOD_DETAILS}
    assert verdicts == {
        "d-w16-t": Verdict.COMPATIBLE,
        "d-w19-t": Verdict.INCOMPATIBLE,  # needs a 19 mm subfloor
        "d-w24-t": Verdict.INCOMPATIBLE,  # needs engineered framing and underlayment
        "d-w24-xl-t": Verdict.INCOMPATIBLE,  # needs DITRA-XL and engineered framing
        "d-w-s": Verdict.INCOMPATIBLE,  # natural stone only
    }


@pytest.mark.parametrize(
    ("code", "change", "expected"),
    [
        ("d-w16-t", {"joist_spacing_mm": Decimal("488")}, Verdict.INCOMPATIBLE),
        ("d-w16-t", {"subfloor_edge": "square_edge"}, Verdict.INCOMPATIBLE),
        ("d-w16-t", {"tile_min_side_mm": Decimal("25")}, Verdict.INCOMPATIBLE),
        ("d-w16-t", {"membrane_bonding_mortar": "schluter_set"}, Verdict.INCOMPATIBLE),
        ("d-w16-t", {"tile_setting_mortar": "modified_thinset"}, Verdict.INCOMPATIBLE),
        ("d-w16-t", {"uncoupling_membrane": "ditra_xl"}, Verdict.COMPATIBLE),
        (
            "d-w19-t",
            {"subfloor_thickness_mm": Decimal("19"), "joist_spacing_mm": Decimal("488")},
            Verdict.COMPATIBLE,
        ),
        (
            "d-w24-xl-t",
            {
                "subfloor_thickness_mm": Decimal("19"),
                "joist_type": "engineered_i_joist",
                "joist_spacing_mm": Decimal("610"),
                "uncoupling_membrane": "ditra_xl",
            },
            Verdict.COMPATIBLE,
        ),
        (
            "d-w24-xl-t",
            {
                "subfloor_thickness_mm": Decimal("19"),
                "joist_type": "engineered_i_joist",
                "joist_spacing_mm": Decimal("610"),
            },
            Verdict.INCOMPATIBLE,
        ),
        (
            "d-w-s",
            {
                "subfloor_thickness_mm": Decimal("19"),
                "underlayment_thickness_mm": Decimal("10"),
                "tile_material": "natural_stone",
            },
            Verdict.COMPATIBLE,
        ),
        (
            "d-w-s",
            {"subfloor_thickness_mm": Decimal("19"), "tile_material": "natural_stone"},
            Verdict.UNKNOWN,
        ),
    ],
    ids=[
        "w16-joists-too-far",
        "w16-square-edge",
        "w16-mosaic-too-small",
        "w16-set-under-membrane",
        "w16-modified-over-membrane",
        "w16-ditra-xl",
        "w19-19mm-on-488",
        "w24-xl-on-i-joists",
        "w24-xl-needs-ditra-xl",
        "stone-double-layer",
        "stone-asks-for-underlayment",
    ],
)
def test_wood_floor_details(
    reviewed: Session, code: str, change: Attributes, expected: Verdict
) -> None:
    assert _assess(reviewed, code, {**FLOOR, **change}) is expected


def test_stone_on_single_layer_asks_about_underlayment(reviewed: Session) -> None:
    assembly = reviewed.scalars(select(Assembly).filter_by(slug="schluter-d-w-s")).one()
    job = {**FLOOR, "subfloor_thickness_mm": Decimal("19"), "tile_material": "natural_stone"}
    result = assess_assembly(reviewed, assembly, job)
    assert result.missing_conditions == ("underlayment_thickness_mm",)
