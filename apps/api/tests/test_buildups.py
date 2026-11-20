"""Surface build-ups and their per-surface quantities (data/buildups.yaml)."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from buildwise_api.catalog.schema import Quantity, load_buildups

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
        "floor": "wet-floor-wood",
        "walls": "tiled-wet-wall",
        "shower": "curbless-shower-floor",
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
