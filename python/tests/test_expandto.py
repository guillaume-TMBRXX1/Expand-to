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
    res = set(data["resources"])
    building_ids = {b["id"] for b in data["buildings"]}
    for b in data["buildings"]:
        assert set(b["cost"]) <= res, b["id"]
        for proc in (b.get("process") or {}).values():
            assert set(proc) <= res, b["id"]
        for rule in b.get("adjacency", []):
            near = rule.get("near", [])
            near = [near] if isinstance(near, str) else near
            assert set(near) <= building_ids | {"city", "wonder"}, b["id"]
            terrain = rule.get("terrain", [])
            terrain = [terrain] if isinstance(terrain, str) else terrain
            assert set(terrain) <= set(data["terrain"]), b["id"]
    for u in data["units"]:
        assert set(u["cost"]) <= res, u["id"]
        assert u.get("requiresBuilding") is None or u["requiresBuilding"] in building_ids, u["id"]
    for tier in data["rules"]["tiers"]:
        assert set(tier.get("needs", {})) <= res


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


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js requis")
def test_training_evaluates_candidates():
    from expandto.train import evaluate, mutate
    import random
    data = load_data()
    summary = evaluate(data["ai"], games=2, seed=3)
    assert 0 <= summary["winRate0"] <= 1 and summary["avgTurns"] > 0
    child = mutate(data["ai"], random.Random(1))
    assert child["build"].keys() == data["ai"]["build"].keys()
