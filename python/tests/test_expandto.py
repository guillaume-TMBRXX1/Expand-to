import json
import shutil
import subprocess
from pathlib import Path

import pytest

from expandto import generate_map, load_data
from expandto.balance import building_payback, tech_tree_summary

ROOT = Path(__file__).resolve().parents[2]


def test_data_is_consistent():
    data = load_data()
    tech_ids = {t["id"] for t in data["techs"]}
    for t in data["techs"]:
        assert set(t["requires"]) <= tech_ids, t["id"]
    for b in data["buildings"]:
        assert b.get("tech") is None or b["tech"] in tech_ids, b["id"]
        assert set(b["terrain"]) <= set(data["terrain"]), b["id"]
    for p in data["profiles"]:
        assert set(p["mods"].get("startTechs", [])) <= tech_ids, p["id"]


def test_balance_helpers():
    rows = building_payback()
    assert all(r["rentabilite_tours"] for r in rows)
    assert tech_tree_summary()["total"] > 0


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js requis pour comparer avec le jeu")
def test_mapgen_matches_javascript():
    js = (
        "import { generateMap } from './web/src/core/mapgen.js';"
        "console.log(JSON.stringify(generateMap(4242, 36, 26).tiles.map(t => t.type)));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    js_types = json.loads(out.stdout)
    py_types = [t["type"] for row in generate_map(4242) for t in row]
    assert py_types == js_types
