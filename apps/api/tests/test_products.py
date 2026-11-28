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
    item_slots = {p.slot for p in products.item_products}
    for slot in products.slots:
        if slot in item_slots:
            continue
        offered = [p for p in products.products if p.slot == slot]
        assert len(offered) >= 2, slot
        assert all(p.quantity.source is not None for p in offered)


def test_pipe_and_cable_brands_sell_in_their_data_sheet_packages() -> None:
    products = {p.id: p for p in load_products(DATA_DIR).item_products}
    for slot in ("nmd90-cable", "pex-pipe", "abs-pipe"):
        assert len([p for p in products.values() if p.slot == slot]) >= 2, slot

    def size(product: str, item: str) -> Decimal | None:
        package = products[product].items[item].package
        return package.size if package else None

    assert size("nexans-nmd90-canadex", "nmd90_cable") == Decimal(75)
    assert size("sharkbite-pex-b", "pex_pipe_1_2") == Decimal("30.48")
    assert size("ipex-abs-cell-core", "abs_pipe_3") == Decimal("3.66")
    # PEX-a listed to ASTM F1960 takes expansion rings, not crimp rings
    assert products["uponor-aquapex-white"].swaps == {"pex_crimp_ring": "pex_expansion_ring"}
    assert products["sharkbite-pex-b"].swaps == {}


def test_bathroom_fans_carry_their_hvi_ratings_and_duct_size() -> None:
    products = {p.id: p for p in load_products(DATA_DIR).item_products}
    panasonic = products["panasonic-fv0511vq1"].fan
    assert panasonic is not None and panasonic.duct == 100
    # 50 cfm setting: 53 cfm at 0.25 in. w.g., 0.4 sone (submittal p1)
    assert any(
        r.setting == 50 and r.in_wg == Decimal("0.25") and r.cfm == 53 for r in panasonic.ratings
    )
    qtx = products["broan-qtxeg080"]
    assert qtx.fan is not None and qtx.fan.duct == 150
    assert qtx.swaps["insulated_flex_duct_4"] == "insulated_flex_duct_6"
    cheap = products["broan-688"].fan
    assert cheap is not None and cheap.ratings[0].sones == Decimal("4.0")


def test_an_item_slot_cannot_mix_with_layer_products() -> None:
    item_product = {
        "id": "pipe-x",
        "slot": "paint",
        "brand": "B",
        "name": "N",
        "source": {"document": "d", "page": 1},
        "items": {"abs_pipe_3": {"package": {"size": 3.66, "kind": "length"}, "search": "pipe"}},
    }
    with pytest.raises(ValidationError, match="mixes"):
        ProductFile.model_validate(
            {
                "slots": {"paint": {"name": "Paint"}},
                "products": [_product("p1")],
                "item_products": [item_product],
            }
        )


def test_paint_and_membrane_rates_follow_their_data_sheets() -> None:
    by_id = {p.id: p for p in load_products(DATA_DIR).products}
    assert by_id["sico-evolution-867"].quantity.amount == Decimal("0.17")
    assert by_id["laticrete-hydro-ban"].quantity.amount == Decimal("0.83")
    assert by_id["custom-redgard-speedcoat"].quantity.amount == Decimal("0.19")
    assert by_id["mapei-aquadefense"].quantity.amount == Decimal("0.68")


def test_mortar_and_grout_rates_follow_mapei_data_sheets() -> None:
    by_id = {p.id: p for p in load_products(DATA_DIR).products}
    assert by_id["mapei-ultraflex-2"].quantity.amount == Decimal("3.26")
    assert by_id["mapei-ultraflex-lft"].quantity.amount == Decimal("2.87")
    assert by_id["mapei-keracolor-s"].quantity.amount == Decimal("0.32")
    assert by_id["mapei-keracolor-u"].quantity.amount == Decimal("0.23")
    grouts = [p.id for p in load_products(DATA_DIR).products if p.slot == "tile-grout"]
    assert grouts[0] == "custom-polyblend-plus"


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
