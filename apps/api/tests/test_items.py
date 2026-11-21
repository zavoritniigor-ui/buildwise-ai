"""The things in the example house a person can click and buy (data/items.yaml)."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from buildwise_api.catalog.schema import ItemFile, load_items

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_items_load_with_unique_ids() -> None:
    items = load_items(DATA_DIR).items
    assert len(items) == len({item.id for item in items})
    assert {
        "toilet",
        "interior_door",
        "window",
        "kitchen_sink",
        "duplex_receptacle",
        "baseboard",
    } <= {item.id for item in items}


def test_duplicate_item_ids_are_rejected() -> None:
    item = {
        "id": "toilet",
        "name": "Toilet",
        "category": "plumbing",
        "summary": "s",
        "search": "toilet",
    }
    with pytest.raises(ValidationError, match="duplicate"):
        ItemFile.model_validate({"items": [item, item]})


def test_an_item_needs_a_known_category() -> None:
    item = {"id": "x", "name": "X", "category": "toy", "summary": "s", "search": "xx"}
    with pytest.raises(ValidationError):
        ItemFile.model_validate({"items": [item]})
