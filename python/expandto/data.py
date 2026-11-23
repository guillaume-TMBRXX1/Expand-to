import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "web" / "data"
FILES = ("terrain", "resources", "buildings", "units", "techs", "profiles", "rules")


def load_data(data_dir: Path = DATA_DIR) -> dict:
    """Charge tous les fichiers JSON de règles dans un dictionnaire."""
    return {name: json.loads((Path(data_dir) / f"{name}.json").read_text(encoding="utf-8")) for name in FILES}
