"""Schluter KERDI-DRAIN and KERDI-LINE drains (Shower System data sheets 8.2, 8.7)."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.compatibility import Attributes, Verdict
from buildwise_api.compatibility.repository import assess_product
from buildwise_api.db.models import Product

# BW-001: thin tray, waste pipe straight below the drain, 2 in pipe.
BW001: Attributes = {
    "shower_base": "kerdi_shower_tt",
    "pipe_connection": "vertical",
    "waste_pipe_size": "nps_2",
}


def _assess(session: Session, sku: str, job: Attributes) -> Verdict:
    product = session.scalars(select(Product).filter_by(manufacturer_sku=sku)).one()
    return assess_product(session, product, job).verdict


@pytest.mark.parametrize(
    ("sku", "change", "expected"),
    [
        ("KD2/PVC/E", {}, Verdict.COMPATIBLE),
        ("KD2/PVC/E", {"pipe_connection": "horizontal"}, Verdict.INCOMPATIBLE),
        ("KD2/PVC/E", {"waste_pipe_size": "nps_3"}, Verdict.INCOMPATIBLE),
        ("KD3 FLK E", {"waste_pipe_size": "nps_3"}, Verdict.COMPATIBLE),
        ("KDH2 FLK ABS", {"pipe_connection": "horizontal"}, Verdict.COMPATIBLE),
        ("KDH2 FLK ABS", {}, Verdict.INCOMPATIBLE),
        (
            "KDH2 FLK ABS",
            {"pipe_connection": "horizontal", "shower_base": "portland_cement_mortar_bed"},
            Verdict.COMPATIBLE,
        ),
        ("KL1V 60 E 120", {}, Verdict.INCOMPATIBLE),
        ("KL1V 60 E 120", {"shower_base": "kerdi_shower_lts"}, Verdict.COMPATIBLE),
    ],
    ids=[
        "kit-in-thin-tray",
        "kit-cannot-go-sideways",
        "kit-is-2-inch-only",
        "steel-flange-3-inch",
        "drain-h-sideways",
        "drain-h-not-vertical",
        "drain-h-in-mortar-bed",
        "linear-drain-not-in-tt",
        "linear-drain-in-lts",
    ],
)
def test_drain_selection(
    reviewed: Session, sku: str, change: Attributes, expected: Verdict
) -> None:
    assert _assess(reviewed, sku, {**BW001, **change}) is expected


def test_drain_asks_how_the_pipe_arrives(reviewed: Session) -> None:
    product = reviewed.scalars(select(Product).filter_by(manufacturer_sku="KD2/PVC/E")).one()
    result = assess_product(reviewed, product, {"shower_base": "kerdi_shower_tt"})
    assert result.missing_conditions == ("pipe_connection", "waste_pipe_size")


def test_unreviewed_drain_never_concludes(unreviewed: Session) -> None:
    assert _assess(unreviewed, "KD2/PVC/E", BW001) is Verdict.UNKNOWN
