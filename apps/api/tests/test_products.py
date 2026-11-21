"""Products sold in Canada that fill a build-up layer (data/products.yaml)."""

from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from buildwise_api.catalog.schema import ProductFile, load_products

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def _product(pid: str, slot: str = "paint", basis: str = "manufacturer") -> dict[str, object]:
    quantity: dict[str, object] = {
        "per": "area",
        "amount": 0.2,
        "unit": "L",
        "basis": basis,
        "search": "paint x",
    }
    if basis == "manufacturer":
        quantity["source"] = {"document": "d", "page": 1}
    return {"id": pid, "slot": slot, "brand": "B", "name": "N", "quantity": quantity}


def test_every_slot_offers_several_products_with_cited_rates() -> None:
    products = load_products(DATA_DIR)
    for slot in products.slots:
        offered = [p for p in products.products if p.slot == slot]
        assert len(offered) >= 2, slot
        assert all(p.quantity.source is not None for p in offered)


def test_paint_and_membrane_rates_follow_their_data_sheets() -> None:
    by_id = {p.id: p for p in load_products(DATA_DIR).products}
    assert by_id["sico-evolution-867"].quantity.amount == Decimal("0.17")
    assert by_id["laticrete-hydro-ban"].quantity.amount == Decimal("0.83")
    assert by_id["custom-redgard-speedcoat"].quantity.amount == Decimal("0.19")


def test_a_product_needs_a_cited_rate() -> None:
    with pytest.raises(ValidationError, match="cited"):
        ProductFile.model_validate(
            {"slots": {"paint": {"name": "Paint"}}, "products": [_product("a", basis="estimate")]}
        )


def test_a_slot_must_exist_and_offer_a_product() -> None:
    with pytest.raises(ValidationError, match="unknown slot"):
        ProductFile.model_validate({"slots": {}, "products": [_product("a")]})
    with pytest.raises(ValidationError, match="no product"):
        ProductFile.model_validate(
            {"slots": {"paint": {"name": "P"}, "glue": {"name": "G"}}, "products": [_product("a")]}
        )
