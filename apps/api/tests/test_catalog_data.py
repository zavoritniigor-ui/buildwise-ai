"""Data tests: the catalogue files in the repository must be consistent.

These protect the knowledge base the same way unit tests protect code.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from buildwise_api.catalog import schema
from buildwise_api.catalog.seed import seed
from buildwise_api.catalog.validate import problems
from buildwise_api.compatibility import Attributes, Verdict, assess
from buildwise_api.compatibility.repository import (
    assess_product,
    attribute_values,
    to_engine_rule,
)
from buildwise_api.db.models import (
    CompatibilityRule,
    Product,
    ProductAttribute,
    VerificationStatus,
)

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
CATALOG = schema.load_catalog_files(DATA_DIR)
VOCABULARY = schema.load_vocabulary(DATA_DIR)


def test_catalog_files_exist() -> None:
    assert CATALOG


@pytest.mark.parametrize("path", list(CATALOG), ids=lambda p: p.name)
def test_catalog_file_is_consistent(path: Path) -> None:
    assert problems(CATALOG[path], VOCABULARY) == []


def test_verification_needs_reviewer_and_date() -> None:
    with pytest.raises(ValidationError, match="verified_by"):
        schema.Attribute(
            key="thickness",
            value=Decimal("8"),
            source=schema.SourceRef(document="d", page=1),
            status=VerificationStatus.HUMAN_VERIFIED,
        )


def test_unknown_substrate_is_reported() -> None:
    catalog = next(iter(CATALOG.values()))
    family = catalog.families[0]
    bad = family.attributes[0].model_copy(update={"value": ["marble_slab"]})
    broken = catalog.model_copy(
        update={"families": [family.model_copy(update={"attributes": [bad]})]}
    )
    assert any("marble_slab" in p for p in problems(broken, VOCABULARY))


def test_seed_is_idempotent(session: Session) -> None:
    seed(session, DATA_DIR)
    counts = (
        session.scalar(select(func.count()).select_from(Product)),
        session.scalar(select(func.count()).select_from(ProductAttribute)),
    )
    seed(session, DATA_DIR)
    assert counts == (
        session.scalar(select(func.count()).select_from(Product)),
        session.scalar(select(func.count()).select_from(ProductAttribute)),
    )
    assert counts[0] == sum(len(f.variants) for c in CATALOG.values() for f in c.families)


def test_unreviewed_data_never_yields_compatible(session: Session) -> None:
    seed(session, DATA_DIR)
    kerdi = session.scalars(select(Product).filter_by(manufacturer_sku="KERDI 200/5M")).one()
    job: Attributes = {
        "substrate": "cement_backer_unit",
        "application": "shower_wall",
        "bonding_mortar": "schluter_all_set",
        "material_temperature_c": Decimal("20"),
    }
    assert assess_product(session, kerdi, job).verdict is Verdict.UNKNOWN


def _as_if_verified(session: Session, sku: str) -> tuple[Attributes, list[CompatibilityRule]]:
    """Technology regression check: what the data says once a person approves it."""
    seed(session, DATA_DIR)
    product = session.scalars(select(Product).filter_by(manufacturer_sku=sku)).one()
    rules = session.scalars(select(CompatibilityRule).filter_by(category_id=product.category_id))
    return attribute_values(product.attributes), list(rules)


def _verdict(session: Session, sku: str, job: Attributes) -> Verdict:
    material, rows = _as_if_verified(session, sku)
    return assess(material, job, [to_engine_rule(r) for r in rows]).verdict


SHOWER_WALL: Attributes = {
    "substrate": "cement_backer_unit",
    "application": "shower_wall",
    "bonding_mortar": "schluter_all_set",
    "material_temperature_c": Decimal("20"),
}


def test_kerdi_rules_cover_four_conditions(session: Session) -> None:
    _, rules = _as_if_verified(session, "KERDI 200/5M")
    assert sorted(r.condition for r in rules) == [
        "application",
        "bonding_mortar",
        "material_temperature_c",
        "substrate",
    ]


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({}, Verdict.COMPATIBLE),
        ({"substrate": "plywood"}, Verdict.INCOMPATIBLE),
        ({"substrate": "osb"}, Verdict.INCOMPATIBLE),
        ({"bonding_mortar": "modified_thinset"}, Verdict.INCOMPATIBLE),
        ({"material_temperature_c": Decimal("2")}, Verdict.INCOMPATIBLE),
        ({"material_temperature_c": Decimal("36")}, Verdict.INCOMPATIBLE),
    ],
    ids=["shower-wall", "plywood", "osb", "modified-thinset", "too-cold", "too-hot"],
)
def test_kerdi_technology_regression(
    session: Session, change: Attributes, expected: Verdict
) -> None:
    assert _verdict(session, "KERDI 200/5M", {**SHOWER_WALL, **change}) is expected


PANEL_WALL: Attributes = {
    "application": "shower_wall",
    "bonding_mortar": "schluter_all_set",
}


@pytest.mark.parametrize(
    ("sku", "mounting", "expected"),
    [
        ("KB 5 1220 2440", "fully_embedded", Verdict.COMPATIBLE),
        ("KB 5 1220 2440", "spot_bonded", Verdict.INCOMPATIBLE),
        ("KB 9 1220 2440", "spot_bonded", Verdict.COMPATIBLE),
        ("KB 9 1220 2440", "framing_406_oc", Verdict.INCOMPATIBLE),
        ("KB 12 1220 2440", "framing_406_oc", Verdict.COMPATIBLE),
        ("KB 12 1220 2440", "framing_610_oc", Verdict.INCOMPATIBLE),
        ("KB 15 1220 2440", "framing_610_oc", Verdict.INCOMPATIBLE),
        ("KB 19 625 2440", "framing_610_oc", Verdict.COMPATIBLE),
        ("KB 25 625 2440", "countertop", Verdict.INCOMPATIBLE),
        ("KB 38 625 2440", "countertop", Verdict.COMPATIBLE),
        ("KB 38 625 2440", "partition_wall", Verdict.INCOMPATIBLE),
        ("KB 50 625 2440", "partition_wall", Verdict.COMPATIBLE),
    ],
)
def test_kerdi_board_thickness_for_mounting(
    session: Session, sku: str, mounting: str, expected: Verdict
) -> None:
    assert _verdict(session, sku, {**PANEL_WALL, "mounting": mounting}) is expected


def test_kerdi_board_is_not_for_exterior_walls(session: Session) -> None:
    job: Attributes = {**PANEL_WALL, "mounting": "framing_406_oc", "application": "exterior_wall"}
    assert _verdict(session, "KB 12 1220 2440", job) is Verdict.INCOMPATIBLE


def test_derived_option_cites_the_deciding_minimum(session: Session) -> None:
    seed(session, DATA_DIR)
    panel = session.scalars(select(Product).filter_by(manufacturer_sku="KB 9 1220 2440")).one()
    mountings = next(a for a in panel.attributes if a.key == "allowed_mountings")
    assert mountings.value_options == ["fully_embedded", "spot_bonded"]
    assert mountings.source_page == 2
