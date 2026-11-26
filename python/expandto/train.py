"""Entraînement des paramètres de l'IA par recherche évolutive (1 + λ).

Chaque candidat joue le joueur 0 contre les IA par défaut dans le vrai moteur JavaScript
(tools/sim.mjs, via Node.js). Le score est le taux de victoire du joueur 0, départagé par son prestige moyen.
Le meilleur jeu de paramètres peut être écrit dans web/data/ai.json.

Deux objectifs : `strength` (par défaut) rend le joueur 0 plus fort que les IA actuelles ; `balance` applique
les paramètres à tous les joueurs et cherche le plus petit écart de victoires entre profils.

Usage (local ou Colab) :
    python -m expandto.train --generations 6 --population 6 --games 20
    python -m expandto.train --objective balance --generations 6 --games 60 --out equilibre.json
    python -m expandto.train --generations 6 --write   # remplace web/data/ai.json par le meilleur
    python -m expandto.train --start trained --jobs 4 --games 40 --generations 10 --write-trained
        # repart des paramètres du mode Difficile, évalue sur 4 cœurs, et réécrit seulement « trained »
"""
import argparse
import copy
import json
import random
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .data import DATA_DIR

ROOT = DATA_DIR.parents[1]
TUNABLE_BUILD = ["foodNeed", "woodNeed", "stoneNeed", "wonderPrestige", "monumentPrestige", "popCap", "sawmill",
                 "forge", "manufactory", "outpost", "markethall", "quarter", "lab", "diversity", "goldReserve",
                 "pathWonder", "pathMaterials", "unique"]


JOBS = 1  # lots de parties lancés en parallèle (option --jobs)


def evaluate(params: dict, games: int, seed: int, everyone: bool = False) -> dict:
    """Résumé de `games` parties ; découpées en JOBS lots parallèles (graines distinctes) puis fusionnées."""
    if JOBS <= 1 or games < 2 * JOBS:
        return evaluate_one(params, games, seed, everyone)
    sizes = [games // JOBS + (1 if k < games % JOBS else 0) for k in range(JOBS)]
    with ThreadPoolExecutor(JOBS) as pool:
        parts = list(pool.map(lambda k: evaluate_one(params, sizes[k], seed + 7919 * k, everyone), range(JOBS)))
    return merge(parts, sizes)


def merge(parts: list, sizes: list) -> dict:
    total = sum(sizes)
    out = {"games": total, "victoryTypes": {}, "profileWin": {}}
    for key in ("winRate0", "avgTurns", "avgPrestige0"):
        out[key] = sum(p[key] * n for p, n in zip(parts, sizes)) / total
    for p in parts:
        for k, v in p["victoryTypes"].items():
            out["victoryTypes"][k] = out["victoryTypes"].get(k, 0) + v
    profiles = {k for p in parts for k in p["profileWin"]}
    out["profileWin"] = {k: sum(p["profileWin"].get(k, 0) for p in parts) / sum(1 for p in parts if k in p["profileWin"]) for k in profiles}
    return out


def evaluate_one(params: dict, games: int, seed: int, everyone: bool = False) -> dict:
    """Lance la simulation avec `params` pour le joueur 0 (ou pour tous les joueurs) et renvoie le résumé JSON."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(params, f)
        path = f.name
    flag = f"--ai-all={path}" if everyone else f"--ai={path}"
    out = subprocess.run(["node", "tools/sim.mjs", str(games), str(seed), flag, "--json"],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    Path(path).unlink(missing_ok=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def fitness(summary: dict, objective: str = "strength") -> float:
    if objective == "balance":
        # Équilibre : petit écart entre le meilleur et le moins bon profil, et parties de 37 à 41 tours.
        rates = list(summary["profileWin"].values())
        spread = max(rates) - min(rates)
        turns = summary["avgTurns"]
        return -spread - 0.02 * max(0, 37 - turns, turns - 41)
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
    if rng.random() < 0.3:
        child["researchFocus"] = round(min(3.5, max(1.0, child.get("researchFocus", 1) * rng.uniform(0.85, 1.15))), 2)
    return child


def start_params(start: str = "defaults") -> dict:
    """Paramètres de départ : ceux par défaut, ou ceux du mode Difficile (« trained ») posés par-dessus."""
    base = json.loads((DATA_DIR / "ai.json").read_text(encoding="utf-8"))
    if start == "trained" and base.get("trained"):
        tr = base["trained"]
        for key in ("branchWeights", "build", "expansion"):
            if key in tr:
                base[key] = {**base.get(key, {}), **copy.deepcopy(tr[key])}
        if "researchFocus" in tr:
            base["researchFocus"] = tr["researchFocus"]
    return base


def train(generations: int = 5, population: int = 6, games: int = 20, seed: int = 7, verbose: bool = True, objective: str = "strength", start: str = "defaults") -> tuple[dict, list]:
    rng = random.Random(seed)
    base = start_params(start)
    everyone = objective == "balance"
    best, best_score = base, fitness(evaluate(base, games, seed, everyone), objective)
    history = [{"generation": 0, "fitness": round(best_score, 4)}]
    if verbose:
        print(f"Génération 0 · paramètres actuels : {best_score:.3f}")
    for gen in range(1, generations + 1):
        # Comparaison équitable : le meilleur actuel rejoue les mêmes cartes que les candidats de la génération.
        best_score = fitness(evaluate(best, games, seed + gen, everyone), objective)
        for _ in range(population):
            cand = mutate(best, rng)
            score = fitness(evaluate(cand, games, seed + gen, everyone), objective)
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
    ap.add_argument("--out", help="écrire le meilleur résultat dans ce fichier JSON")
    ap.add_argument("--objective", choices=["strength", "balance"], default="strength",
                    help="strength : joueur 0 plus fort que les IA actuelles ; balance : mêmes paramètres pour tous, profils équilibrés")
    ap.add_argument("--start", choices=["defaults", "trained"], default="defaults", help="point de départ de la recherche")
    ap.add_argument("--jobs", type=int, default=1, help="lots de parties évalués en parallèle (un par cœur)")
    ap.add_argument("--write-trained", action="store_true", help="écrire le meilleur résultat dans la clé « trained » de web/data/ai.json (mode Difficile)")
    args = ap.parse_args()
    global JOBS
    JOBS = max(1, args.jobs)
    best, history = train(args.generations, args.population, args.games, args.seed, objective=args.objective, start=args.start)
    if args.write_trained:
        ai = json.loads((DATA_DIR / "ai.json").read_text(encoding="utf-8"))
        ai["trained"] = {"_note": f"Paramètres issus de python -m expandto.train ({args.generations} générations × {args.population} candidats, {args.games} parties par évaluation), utilisés par les IA en difficulté Difficile.",
                         "branchWeights": best["branchWeights"], "build": best["build"], "researchFocus": best.get("researchFocus", 1)}
        (DATA_DIR / "ai.json").write_text(json.dumps(ai, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Clé « trained » de web/data/ai.json mise à jour.", json.dumps(history))
    elif args.write:
        (DATA_DIR / "ai.json").write_text(json.dumps(best, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("web/data/ai.json mis à jour.")
    elif args.out:
        Path(args.out).write_text(json.dumps(best, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Meilleurs paramètres écrits dans {args.out}.")
    else:
        print(json.dumps(best["build"], ensure_ascii=False))


if __name__ == "__main__":
    main()
