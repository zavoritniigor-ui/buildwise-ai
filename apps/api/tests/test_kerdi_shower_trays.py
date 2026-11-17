"""Schluter KERDI-SHOWER trays (Shower System data sheets 8.3 and 8.8)."""

from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from buildwise_api.catalog.schema import load_catalog_files
from buildwise_api.compatibility import Verdict
from buildwise_api.compatibility.repository import assess_product
from buildwise_api.db.models import Product

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
TRAYS = load_catalog_files(DATA_DIR)[DATA_DIR / "catalog" / "schluter-kerdi-shower-trays.yaml"]


def _product(session: Session, sku: str) -> Product:
    return session.scalars(select(Product).filter_by(manufacturer_sku=sku)).one()


def test_every_tray_size_from_the_item_table_is_present() -> None:
    counts = {family.name: len(family.variants) for family in TRAYS.families}
    assert counts == {
        "Schluter-KERDI-SHOWER-T": 5,
        "Schluter-KERDI-SHOWER-TS": 1,
        "Schluter-KERDI-SHOWER-TT": 6,
        "Schluter-KERDI-SHOWER-LT": 3,
        "Schluter-KERDI-SHOWER-LTS": 7,
        "Schluter-KERDI-SHOWER-R": 1,
    }


def test_bw001_shower_matches_one_thin_tray_exactly() -> None:
    """BW-001 is a 0.9 x 1.2 m curbless shower; the TT trays are for curbless use."""
    fits = [
        variant.sku
        for family in TRAYS.families
        for variant in family.variants
        if {variant.dimensions["width_mm"], variant.dimensions["length_mm"]}
        == {Decimal("910"), Decimal("1220")}
    ]
    assert fits == ["KST915/1220BF"]


@pytest.mark.parametrize(
    ("sku", "drain", "expected"),
    [
        ("KST915/1220BF", "kerdi_drain", Verdict.COMPATIBLE),
        ("KST915/1220BF", "kerdi_line", Verdict.INCOMPATIBLE),
        ("KSLT1220S", "kerdi_line", Verdict.COMPATIBLE),
        ("KSLT1220S", "kerdi_drain", Verdict.INCOMPATIBLE),
    ],
)
def test_tray_takes_only_its_drain_system(
    reviewed: Session, sku: str, drain: str, expected: Verdict
) -> None:
    result = assess_product(reviewed, _product(reviewed, sku), {"drain_system": drain})
    assert result.verdict is expected


def test_unreviewed_tray_never_concludes(unreviewed: Session) -> None:
    product = _product(unreviewed, "KST915/1220BF")
    result = assess_product(unreviewed, product, {"drain_system": "kerdi_drain"})
    assert result.verdict is Verdict.UNKNOWN
