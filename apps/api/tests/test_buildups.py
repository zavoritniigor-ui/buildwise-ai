"""Surface build-ups and their per-surface quantities (data/buildups.yaml)."""

from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from buildwise_api.catalog.schema import BuildupFile, Quantity, load_buildups

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_a_manufacturer_rate_must_cite_its_page() -> None:
    with pytest.raises(ValidationError, match="cite"):
        Quantity.model_validate(
            {"per": "area", "amount": 2, "unit": "kg", "basis": "manufacturer", "search": "x y"}
        )


def test_every_surface_of_the_demo_house_has_a_build_up() -> None:
    buildups = load_buildups(DATA_DIR)
    assert set(buildups.surfaces) == {"living", "kitchen", "bedroom", "hallway", "bathroom"}
    assert buildups.surfaces["bathroom"] == {
        "floor": ["wet-floor-wood", "wet-floor-cement-board"],
        "walls": ["tiled-wet-wall", "tiled-wall-cement-board", "painted-moisture-wall"],
        "shower": ["curbless-shower-floor"],
        "ceiling": ["painted-moisture-ceiling"],
    }


def test_ditra_mortar_rates_come_from_the_handbook() -> None:
    """DITRA handbook p. 19: one 22.68 kg bag bonds 10.7 m² of DITRA and sets
    3.7 m² of tile on it (the conservative end of 3.7-4.6 m²)."""
    wet = next(b for b in load_buildups(DATA_DIR).buildups if b.id == "wet-floor-wood")
    rates = [
        layer.quantity
        for layer in wet.layers
        if layer.quantity is not None and layer.quantity.basis == "manufacturer"
    ]
    assert [(float(q.amount), q.source.page if q.source else None) for q in rates] == [
        (2.12, 19),
        (6.13, 19),
    ]
    for q in rates:
        assert q.package is not None and float(q.package.size) == 22.68


def _rate(buildup_id: str, search: str) -> Quantity:
    buildup = next(b for b in load_buildups(DATA_DIR).buildups if b.id == buildup_id)
    found = [layer.quantity for layer in buildup.layers if layer.quantity]
    return next(q for q in found if q.search == search)


def test_liquid_membrane_and_paint_rates_come_from_their_data_sheets() -> None:
    redgard = _rate("tiled-wall-cement-board", "RedGard waterproofing membrane")
    assert redgard.basis == "manufacturer"
    assert redgard.source is not None and redgard.source.document == "redgard-sell-sheet"
    # 3.78 L covers 5.1 m2 as a waterproof membrane
    assert redgard.amount == Decimal("0.74")
    assert redgard.package is not None and redgard.package.size == Decimal("3.78")
    paint = _rate("painted-moisture-ceiling", "Benjamin Moore Aura Bath and Spa")
    # two coats at 32.5 m2 per 3.79 L
    assert paint.amount == Decimal("0.23")
    assert paint.source is not None and paint.source.page == 1


def test_gypsum_finishing_rates_come_from_the_cgc_handbook() -> None:
    for search, amount in (
        ("drywall joint tape", "1.13"),
        ("Sheetrock all purpose lite joint compound", "0.36"),
    ):
        rate = _rate("painted-moisture-wall", search)
        assert rate.amount == Decimal(amount)
        assert rate.source is not None
        assert (rate.source.document, rate.source.page) == ("cgc-handbook-ch03", 3)
    compound = _rate("painted-wall", "Sheetrock all purpose lite joint compound")
    assert compound.package is not None
    assert (compound.package.size, compound.package.kind) == (Decimal("17"), "pail")


def test_gypsum_board_is_counted_in_4x8_sheets() -> None:
    board = _rate("painted-wall", "Sheetrock drywall 1/2 4x8")
    assert board.package is not None and board.package.kind == "sheet"
    # 1220 x 2440 mm
    assert board.package.size == Decimal("2.97")


def test_wall_paint_rate_comes_from_regal_select() -> None:
    paint = _rate("painted-wall", "Benjamin Moore Regal Select")
    assert paint.basis == "manufacturer"
    # two coats at 37.1 m2 per 3.79 L
    assert paint.amount == Decimal("0.21")


def test_a_surface_must_offer_distinct_build_ups() -> None:
    with pytest.raises(ValidationError, match="distinct"):
        BuildupFile.model_validate(
            {
                "buildups": [
                    {
                        "id": "a",
                        "title": "A",
                        "summary": "s",
                        "layers": [{"role": "structure", "label": "Joists"}],
                    }
                ],
                "surfaces": {"bathroom": {"floor": ["a", "a"]}},
            }
        )
