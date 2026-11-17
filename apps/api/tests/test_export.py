"""The web snapshot must match the knowledge base it was exported from."""

import json
from pathlib import Path

from buildwise_api.catalog.export import render

ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "apps" / "web" / "src" / "generated" / "knowledge.json"


def test_web_snapshot_is_up_to_date() -> None:
    expected = render(ROOT / "data")
    assert SNAPSHOT.read_text(encoding="utf-8") == expected, (
        "Regenerate it: cd apps/api && uv run python -m buildwise_api.catalog.export "
        "../../data ../web/src/generated/knowledge.json"
    )


def test_preview_matches_the_database_engine_for_bw001() -> None:
    """The same answers as tests/test_scenario_bw001.py, which runs on the database."""

    cases = {
        case["id"]: case["expected"]
        for scenario in json.loads(render(ROOT / "data"))["scenarios"]
        for case in scenario["cases"]
    }
    assert cases["recessed-shower"]["preview"]["verdict"] == "compatible"
    assert cases["recessed-shower-wide-joists"]["preview"]["verdict"] == "incompatible"
    assert cases["brief-only"]["preview"]["missing"] == [
        "floor_waterproofing",
        "joist_spacing_mm",
        "joist_type",
        "shower_base",
        "subfloor_edge",
        "subfloor_thickness_mm",
    ]
    assert all(case["verified"]["verdict"] == "unknown" for case in cases.values())
