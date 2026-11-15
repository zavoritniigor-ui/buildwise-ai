from decimal import Decimal
from pathlib import Path

from buildwise_api.catalog.schema import (
    DerivedOptions,
    Dimension,
    Minimum,
    SourceRef,
    Variant,
    load_catalog_files,
    load_vocabulary,
)
from buildwise_api.catalog.validate import problems
from buildwise_api.db.models import VerificationStatus

SOURCE = SourceRef(document="tds", page=1)
DERIVED = DerivedOptions(
    key="allowed_mountings",
    from_dimension="thickness_mm",
    status=VerificationStatus.AI_EXTRACTED,
    minimums=[
        Minimum(option="spot_bonded", min=Decimal("9"), source=SOURCE),
        Minimum(option="framing_406_oc", min=Decimal("12.5"), source=SOURCE),
    ],
)


def _variant(thickness: str | None) -> Variant:
    dimensions: dict[Dimension, Decimal] = {"thickness_mm": Decimal(thickness)} if thickness else {}
    return Variant(
        sku="X", package_quantity=Decimal(1), package_unit="count", dimensions=dimensions
    )


def test_minimum_is_inclusive() -> None:
    assert [m.option for m in DERIVED.options_for(_variant("12.5"))] == [
        "spot_bonded",
        "framing_406_oc",
    ]


def test_just_below_minimum_does_not_qualify() -> None:
    assert [m.option for m in DERIVED.options_for(_variant("12.4"))] == ["spot_bonded"]


def test_missing_dimension_qualifies_for_nothing() -> None:
    assert DERIVED.options_for(_variant(None)) == []


def test_variant_below_every_minimum_is_reported() -> None:
    data_dir = Path(__file__).resolve().parents[3] / "data"
    catalog = next(
        c
        for c in load_catalog_files(data_dir).values()
        if any(f.derived_options for f in c.families)
    )
    family = next(f for f in catalog.families if f.derived_options)
    thin = family.variants[0].model_copy(update={"dimensions": {"thickness_mm": Decimal("1")}})
    broken = catalog.model_copy(
        update={"families": [family.model_copy(update={"variants": [thin]})]}
    )
    assert any("qualifies for no" in p for p in problems(broken, load_vocabulary(data_dir)))
