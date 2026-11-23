"""Portage exact de web/src/core/mapgen.js : même graine => même carte que dans le navigateur."""
import math

MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & MASK


class Mulberry32:
    def __init__(self, seed: int):
        self.a = seed & MASK

    def next(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & MASK
        t = self.a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296


def _value_noise(rng, w, h, cell):
    gw, gh = math.ceil(w / cell) + 2, math.ceil(h / cell) + 2
    grid = [rng.next() for _ in range(gw * gh)]

    def smooth(t):
        return t * t * (3 - 2 * t)

    def sample(x, y):
        gx, gy = x / cell, y / cell
        x0, y0 = math.floor(gx), math.floor(gy)
        tx, ty = smooth(gx - x0), smooth(gy - y0)
        v = lambda i, j: grid[(j % gh) * gw + (i % gw)]
        a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx
        b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx
        return a * (1 - ty) + b * ty

    return sample


def _fbm(rng, w, h, octaves, base_cell):
    layers = [_value_noise(rng, w, h, max(1.5, base_cell / 2 ** o)) for o in range(octaves)]

    def sample(x, y):
        total, amp, norm = 0.0, 1.0, 0.0
        for n in layers:
            total += n(x, y) * amp
            norm += amp
            amp *= 0.5
        return total / norm

    return sample


def classify(e: float, m: float) -> str:
    if e < 0.3:
        return "deep"
    if e < 0.38:
        return "water"
    if e < 0.42:
        return "sand"
    if e < 0.64:
        return "forest" if m > 0.56 else "grass" if m > 0.42 else "plains"
    if e < 0.75:
        return "forest" if m > 0.62 else "hills"
    if e < 0.86:
        return "mountain"
    return "snow"


MAP_TYPES = {
    "continent": {"cell": 9, "gain": 1.25, "bias": -0.1, "fall0": 0.55},
    "pangaea": {"cell": 11, "gain": 1.15, "bias": 0.0, "fall0": 0.7},
    "archipelago": {"cell": 5, "gain": 1.35, "bias": -0.16, "fall0": 0.62},
}


def generate_map(seed: int, width: int = 36, height: int = 26, map_type: str = "continent") -> list[list[dict]]:
    """Retourne une grille [y][x] de cases {x, y, e, m, type}."""
    T = MAP_TYPES.get(map_type, MAP_TYPES["continent"])
    rng = Mulberry32(seed)
    elev = _fbm(rng, width, height, 4, T["cell"])
    moist = _fbm(rng, width, height, 3, 7)
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            nx, ny = (x / (width - 1)) * 2 - 1, (y / (height - 1)) * 2 - 1
            d = max(abs(nx), abs(ny) * 1.05)
            falloff = min(1, max(0, (d - T["fall0"]) / (1 - T["fall0"])))
            e = elev(x, y) * T["gain"] + T["bias"]
            e = e * (1 - falloff * 0.9) - falloff * 0.15
            e = min(1, max(0, e))
            m = moist(x, y)
            row.append({"x": x, "y": y, "e": e, "m": m, "type": classify(e, m)})
        rows.append(row)
    tiles = [t for row in rows for t in row]
    _assign_regions(rng, tiles, width, height)
    _carve_rivers(rng, tiles, width, height)
    return rows


REGIONS = ["north", "temperate", "fertile", "arid", "coast"]


def region_of(tile_type: str, lat: float, m: float) -> str:
    if tile_type in ("deep", "water", "sand"):
        return "coast"
    if lat < 0.24:
        return "north"
    if lat > 0.76:
        return "arid"
    return "fertile" if m > 0.5 else "temperate"


def _assign_regions(rng, tiles, width, height):
    jitter = _fbm(rng, width, height, 2, 6)
    land = [t["y"] for t in tiles if t["type"] not in ("deep", "water")]
    y0, y1 = (min(land), max(land)) if land else (height, 0)
    span = max(1, y1 - y0)
    for t in tiles:
        lat = (t["y"] - y0) / span + (jitter(t["x"], t["y"]) - 0.5) * 0.3
        t["region"] = region_of(t["type"], lat, t["m"])


_D4 = [(0, -1), (1, 0), (0, 1), (-1, 0)]


def _carve_rivers(rng, tiles, width, height):
    def at(x, y):
        return tiles[y * width + x] if 0 <= x < width and 0 <= y < height else None

    def water(t):
        return t["type"] in ("deep", "water")

    count = math.floor((width * height) / 190 + 0.5)  # Math.round de JavaScript (arrondi de 0,5 vers le haut)
    sources = [t for t in tiles if t["type"] in ("hills", "mountain") and t["e"] > 0.66]
    n = tries = 0
    while n < count and tries < count * 8 and sources:
        tries += 1
        src = sources[math.floor(rng.next() * len(sources))]
        if src.get("river") or any((v := at(src["x"] + dx, src["y"] + dy)) and v.get("river") for dx, dy in _D4):
            continue
        path, cur, ok = [src], src, False
        for _ in range(40):
            best = None
            for dx, dy in _D4:
                v = at(cur["x"] + dx, cur["y"] + dy)
                if v is None or any(v is q for q in path):
                    continue
                if best is None or v["e"] < best["e"]:
                    best = v
            if best is None:
                break
            if water(best) or best.get("river"):
                path.append(best)
                ok = True
                break
            if best["e"] > cur["e"] + 0.02:
                break
            path.append(best)
            cur = best
        if not ok or len(path) < 4:
            continue
        for k in range(len(path) - 1):
            t = path[k]
            if water(t):
                break
            t["river"] = True
            nx = path[k + 1]
            t["riverTo"] = nx["y"] * width + nx["x"]
        n += 1
    for t in tiles:
        if t.get("river") and t["type"] == "mountain":
            t["type"] = "hills"
