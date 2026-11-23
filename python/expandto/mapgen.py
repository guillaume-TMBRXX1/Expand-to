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


def generate_map(seed: int, width: int = 36, height: int = 26) -> list[list[dict]]:
    """Retourne une grille [y][x] de cases {x, y, e, m, type}."""
    rng = Mulberry32(seed)
    elev = _fbm(rng, width, height, 4, 9)
    moist = _fbm(rng, width, height, 3, 7)
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            nx, ny = (x / (width - 1)) * 2 - 1, (y / (height - 1)) * 2 - 1
            d = max(abs(nx), abs(ny) * 1.05)
            falloff = min(1, max(0, (d - 0.55) / 0.45))
            e = elev(x, y) * 1.25 - 0.1
            e = e * (1 - falloff * 0.9) - falloff * 0.15
            e = min(1, max(0, e))
            m = moist(x, y)
            row.append({"x": x, "y": y, "e": e, "m": m, "type": classify(e, m)})
        rows.append(row)
    return rows
