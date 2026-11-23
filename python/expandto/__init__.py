"""Outils Python d'Expand-to : génération de cartes et analyse d'équilibrage.

Les données de jeu (web/data/*.json) sont la source unique de vérité, partagée
entre le jeu (JavaScript) et ces outils (Python / Google Colab).
"""
from .data import load_data, DATA_DIR
from .mapgen import generate_map, Mulberry32

__all__ = ["load_data", "DATA_DIR", "generate_map", "Mulberry32"]
