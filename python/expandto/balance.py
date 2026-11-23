"""Analyses d'équilibrage à partir des fichiers de règles."""
from collections import defaultdict

from .data import load_data


def resource_value(data: dict, bundle: dict) -> float:
    """Valeur d'un panier de ressources (Or-équivalent). Science/Culture valent 1.5 Or par défaut."""
    res = data["resources"]
    return sum(v * (res[k]["tradeValue"] or 1.5) for k, v in bundle.items())


def building_payback(data: dict | None = None) -> list[dict]:
    """Nombre de tours pour rentabiliser chaque bâtiment (coût / rendement net)."""
    data = data or load_data()
    out = []
    for b in data["buildings"]:
        cost = resource_value(data, b["cost"])
        gain = resource_value(data, b["yields"]) - b.get("upkeep", 0)
        if b.get("process"):  # transformation : valeur ajoutée
            gain += resource_value(data, b["process"]["out"]) - resource_value(data, b["process"]["in"])
        if b.get("luxuryOnly"):  # comptoir : 1 ressource rare par tour
            gain += 3.5
        out.append({
            "id": b["id"], "nom": b["name"], "merveille": bool(b.get("wonder")),
            "cout": round(cost, 1), "gain_par_tour": round(gain, 1),
            "rentabilite_tours": round(b["turns"] + cost / gain, 1) if gain > 0 else None,
            "prestige": b.get("prestige", 0),
        })
    return sorted(out, key=lambda r: (r["merveille"], r["rentabilite_tours"] or 1e9))


def tech_tree_summary(data: dict | None = None) -> dict:
    """Coût cumulé de chaque branche et liste des dépendances croisées."""
    data = data or load_data()
    by_branch = defaultdict(int)
    cross = []
    techs = {t["id"]: t for t in data["techs"]}
    for t in data["techs"]:
        by_branch[t["branch"]] += t["cost"]
        for r in t["requires"]:
            if techs[r]["branch"] != t["branch"]:
                cross.append((t["id"], r))
    return {"cout_par_branche": dict(by_branch), "total": sum(by_branch.values()), "dependances_croisees": cross}


def science_curve(per_turn_start: float = 2.0, growth: float = 0.25, turns: int = 60) -> list[float]:
    """Modèle simple de science cumulée (croissance linéaire du rendement)."""
    total, out = 0.0, []
    for t in range(turns):
        total += per_turn_start + growth * t
        out.append(round(total, 1))
    return out


def turns_to_finish_tree(data: dict | None = None, **kw) -> int | None:
    data = data or load_data()
    need = tech_tree_summary(data)["total"]
    for i, v in enumerate(science_curve(**kw)):
        if v >= need:
            return i + 1
    return None
