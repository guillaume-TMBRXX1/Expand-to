"""Entraînement des paramètres de l'IA par recherche évolutive (1 + λ).

Chaque candidat joue le joueur 0 contre les IA par défaut dans le vrai moteur JavaScript
(tools/sim.mjs, via Node.js). Le score est le taux de victoire du joueur 0, départagé par son prestige moyen.
Le meilleur jeu de paramètres peut être écrit dans web/data/ai.json.

Usage (local ou Colab) :
    python -m expandto.train --generations 6 --population 6 --games 20
    python -m expandto.train --generations 6 --write   # remplace web/data/ai.json par le meilleur
"""
import argparse
import copy
import json
import random
import subprocess
import tempfile
from pathlib import Path

from .data import DATA_DIR

ROOT = DATA_DIR.parents[1]
TUNABLE_BUILD = ["foodNeed", "woodNeed", "stoneNeed", "wonderPrestige", "monumentPrestige", "popCap", "sawmill",
                 "forge", "manufactory", "outpost", "markethall", "quarter", "lab", "diversity", "goldReserve"]


def evaluate(params: dict, games: int, seed: int) -> dict:
    """Lance la simulation avec `params` pour le joueur 0 et renvoie le résumé JSON."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(params, f)
        path = f.name
    out = subprocess.run(["node", "tools/sim.mjs", str(games), str(seed), f"--ai={path}", "--json"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    Path(path).unlink(missing_ok=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def fitness(summary: dict) -> float:
    return summary["winRate0"] + summary["avgPrestige0"] / 10000


def mutate(params: dict, rng: random.Random, strength: float = 0.25) -> dict:
    child = copy.deepcopy(params)
    for key in rng.sample(TUNABLE_BUILD, k=4):
        child["build"][key] = round(max(0.0, child["build"][key] * rng.uniform(1 - strength, 1 + strength) + rng.uniform(-1, 1)), 2)
    profile = rng.choice(list(child["branchWeights"]))
    branch = rng.choice(list(child["branchWeights"][profile]))
    child["branchWeights"][profile][branch] = round(max(0.2, child["branchWeights"][profile][branch] * rng.uniform(0.8, 1.25)), 2)
    if rng.random() < 0.15:
        child["build"]["saveForWonders"] = 1 - child["build"]["saveForWonders"]
    return child


def train(generations: int = 5, population: int = 6, games: int = 20, seed: int = 7, verbose: bool = True) -> tuple[dict, list]:
    rng = random.Random(seed)
    base = json.loads((DATA_DIR / "ai.json").read_text(encoding="utf-8"))
    best, best_score = base, fitness(evaluate(base, games, seed))
    history = [{"generation": 0, "fitness": round(best_score, 4)}]
    if verbose:
        print(f"Génération 0 · paramètres actuels : {best_score:.3f}")
    for gen in range(1, generations + 1):
        for _ in range(population):
            cand = mutate(best, rng)
            score = fitness(evaluate(cand, games, seed + gen))
            if score > best_score:
                best, best_score = cand, score
        history.append({"generation": gen, "fitness": round(best_score, 4)})
        if verbose:
            print(f"Génération {gen} · meilleur : {best_score:.3f}")
    return best, history


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--generations", type=int, default=5)
    ap.add_argument("--population", type=int, default=6)
    ap.add_argument("--games", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--write", action="store_true", help="écrire le meilleur résultat dans web/data/ai.json")
    args = ap.parse_args()
    best, _ = train(args.generations, args.population, args.games, args.seed)
    if args.write:
        (DATA_DIR / "ai.json").write_text(json.dumps(best, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("web/data/ai.json mis à jour.")
    else:
        print(json.dumps(best["build"], ensure_ascii=False))


if __name__ == "__main__":
    main()
