"""
Recipe loading and search for creatio-freedom-migration.

Standard library only, so it can be used and tested without the MCP SDK:

    python recipe_search.py                    # summary of the loaded recipes
    python recipe_search.py "lookupListConfig"  # search from the command line

A recipe is a .js file under Recipes/<Topic>/. Its header is a comment block
that starts with a title line `// --- <title> ---` and runs until the first
line that is not a `//` comment.
"""

from __future__ import annotations

import html
import math
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

RECIPES_DIR = "Recipes"
AREA = "Migration"

# ---------------------------------------------------------------- text ----

_WORD = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*")
_CAMEL_PART = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")

IGNORED = frozenset(
    "a an and are as at be by can do does for from how i in into is it its me my "
    "of on or so that the then this to use using want was we what when where "
    "which with you your should would will need make".split()
)

# Words whose presence in a header says little about the topic. They still
# count for ranking, but not for deciding whether a recipe is ABOUT a query.
WEAK = frozenset(
    "add app classic code create creatio data deploy field fields freedom get migrat "
    "new page pages record records set ui value values work".split()
)

ENDINGS = ("ations", "ation", "ables", "able", "ments", "ment", "ings", "ing",
           "ies", "es", "ed", "s")


def normalize(word: str) -> str:
    """Lower-case and strip common English endings ("filters" -> "filter")."""
    w = word.lower()
    if len(w) < 4 or not w.isalpha():
        return w
    for end in ENDINGS:
        if w.endswith(end) and len(w) - len(end) >= 3:
            if end == "s" and w.endswith("ss"):
                break
            w = w[: -len(end)] + ("y" if end == "ies" else "")
            break
    if len(w) >= 4 and w.endswith("e"):
        w = w[:-1]
    return w


def words(text: str) -> list[str]:
    """
    Search terms of a text. An API name yields itself, its dotted parts and its
    camelCase parts: "Terrasoft.BatchQuery" -> terrasoft.batchquery, terrasoft,
    batchquery, batch, query.
    """
    out: list[str] = []
    for token in _WORD.findall(text):
        token = token.strip("$")
        if not token:
            continue
        pieces = token.split(".")
        if len(pieces) > 1:
            out.append(token.lower())
        for piece in pieces:
            out.append(piece.lower())
            parts = _CAMEL_PART.findall(piece)
            if len(parts) > 1:
                out.extend(p.lower() for p in parts)
    return [normalize(w) for w in out if len(w) > 1 and w not in IGNORED]


# Query words developers use that the recipes phrase differently. Applied to
# the query only.
RELATED = {
    "mandatory": ["required"], "popup": ["dialog", "modal"], "modal": ["dialog"],
    "confirm": ["dialog", "confirmation"], "toast": ["notification"],
    "attachment": ["file"], "permission": ["rights"], "translation": ["localizable"],
    "grid": ["list"], "detail": ["list"], "spinner": ["mask"], "loader": ["mask"],
    "websocket": ["channel", "message"], "push": ["channel"],
    "nightly": ["schedule"], "toggle": ["feature"],
}
_RELATED = {normalize(k): [normalize(v) for v in vs] for k, vs in RELATED.items()}

# ------------------------------------------------------------- recipes ----

_TITLE = re.compile(r"^\s*//\s*-{3,}\s*(.*?)\s*-*\s*$")
_COMMENT = re.compile(r"^\s*//\s?(.*)$")
_SOURCE = re.compile(r"\bSources?:\s*(https?://\S+)", re.I)


@dataclass
class Recipe:
    id: str          # "Recipes/Lists/HowToMigrateDetailToList"
    topic: str       # "Lists"
    path: Path
    title: str
    header: str
    text: str
    sources: list[str]
    area: str = AREA
    title_terms: Counter = field(default_factory=Counter, repr=False)
    header_terms: Counter = field(default_factory=Counter, repr=False)
    body_terms: Counter = field(default_factory=Counter, repr=False)

    @property
    def rel_path(self) -> str:
        return self.id + self.path.suffix

    def summary(self, limit: int = 280) -> str:
        flat = " ".join(self.header.split())
        return flat if len(flat) <= limit else flat[: limit - 3] + "..."


def parse_header(text: str) -> tuple[str, str]:
    """Returns (title, header body). An empty title means no header was found."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = _TITLE.match(line)
        if not m or not m.group(1):
            continue
        body = []
        for nxt in lines[i + 1:]:
            c = _COMMENT.match(nxt)
            if c is None:
                break
            body.append(c.group(1).rstrip())
        return m.group(1).strip(), html.unescape("\n".join(body).strip())
    return "", ""


def file_title(stem: str) -> str:
    parts = _CAMEL_PART.findall(stem)
    return " ".join(parts).capitalize() if parts else stem


class RecipeBook:
    """All recipes under <root>/Recipes, with a BM25 ranking over three fields."""

    FIELD_WEIGHT = {"title": 3.0, "header": 1.2, "body": 0.35}
    K1, B = 1.2, 0.6

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.recipes: dict[str, Recipe] = {}
        self.problems: list[str] = []
        self._load()

    # loading ------------------------------------------------------------

    def _load(self) -> None:
        base = self.root / RECIPES_DIR
        for path in sorted(base.rglob("*.js")) if base.is_dir() else []:
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                self.problems.append(f"{path}: unreadable ({exc})")
                continue
            title, header = parse_header(text)
            if not title:
                self.problems.append(f"{path}: no '// --- title ---' header")
                title = file_title(path.stem)
            rid = path.relative_to(self.root).with_suffix("").as_posix()
            topic = path.parent.relative_to(base).as_posix()
            r = Recipe(rid, "" if topic == "." else topic, path, title, header, text,
                       list(dict.fromkeys(u.rstrip(".,;)") for u in _SOURCE.findall(text))))
            r.title_terms = Counter(words(title) + words(file_title(path.stem)))
            r.header_terms = Counter(words(header))
            r.body_terms = Counter(words(text))
            self.recipes[rid] = r
        self._stats()

    def _stats(self) -> None:
        self.doc_freq: Counter = Counter()
        for r in self.recipes.values():
            self.doc_freq.update(set(r.title_terms) | set(r.header_terms) | set(r.body_terms))
        n = max(len(self.recipes), 1)
        self.avg_len = {
            f: sum(sum(getattr(r, f + "_terms").values()) for r in self.recipes.values()) / n or 1.0
            for f in self.FIELD_WEIGHT
        }

    # searching ----------------------------------------------------------

    def _idf(self, term: str) -> float:
        n = len(self.recipes)
        df = self.doc_freq.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def _term_score(self, r: Recipe, term: str) -> float:
        total = 0.0
        for f, weight in self.FIELD_WEIGHT.items():
            counts = getattr(r, f + "_terms")
            tf = counts.get(term, 0)
            if tf:
                length = sum(counts.values())
                norm = 1 - self.B + self.B * length / self.avg_len[f]
                total += weight * tf * (self.K1 + 1) / (tf + self.K1 * norm)
        return total * self._idf(term)

    def search(self, query: str, limit: int = 8) -> list[tuple[Recipe, float]]:
        terms = list(dict.fromkeys(words(query)))
        if not terms:
            return []
        ranked = []
        for r in self.recipes.values():
            score, hit = 0.0, 0
            for t in terms:
                s = self._term_score(r, t)
                s += 0.5 * sum(self._term_score(r, x) for x in _RELATED.get(t, ()))
                if s:
                    hit += 1
                    score += s
            if hit:
                # Recipes that match only part of a multi-word query sink.
                score *= 0.4 + 0.6 * hit / len(terms)
                ranked.append((r, score))
        ranked.sort(key=lambda p: (-p[1], p[0].id))
        return ranked[:limit]

    def is_about(self, r: Recipe, query: str) -> bool:
        """
        Whether the recipe's title and header cover the query - not just one
        generic word of it. Used to tell the caller when nothing really matched.
        """
        terms = [t for t in dict.fromkeys(words(query)) if t not in WEAK]
        if not terms:
            return True
        known = set(r.title_terms) | set(r.header_terms)
        covered = sum(1 for t in terms if t in known or any(x in known for x in _RELATED.get(t, ())))
        needed = max(1, math.ceil(len(terms) / 2), 2 if len(terms) >= 3 else 1)
        return covered >= needed

    def find_symbol(self, symbol: str, limit: int = 10) -> list[tuple[Recipe, int]]:
        """Recipes whose text mentions an API name; a bare name matches dotted ones."""
        name = symbol.strip()
        if not name:
            return []
        pattern = re.compile(r"(?<![\w.])(?:[\w$]+\.)*" + re.escape(name) + r"(?!\w)")
        hits = [(r, len(pattern.findall(r.text))) for r in self.recipes.values()]
        hits = [h for h in hits if h[1]]
        hits.sort(key=lambda p: (-p[1], p[0].id))
        return hits[:limit]

    def get(self, ref: str) -> Recipe | None:
        ref = ref.strip().strip("/")
        ref = ref[:-3] if ref.endswith(".js") else ref
        if ref in self.recipes:
            return self.recipes[ref]
        tail = [r for r in self.recipes.values() if r.id.endswith("/" + ref)]
        return tail[0] if len(tail) == 1 else None

    def topics(self) -> Counter:
        return Counter(r.topic or "(root)" for r in self.recipes.values())


def default_root() -> Path:
    env = os.environ.get("CREATIO_KB_ROOT")
    return Path(env).expanduser().resolve() if env else Path(__file__).resolve().parents[1]


if __name__ == "__main__":
    book = RecipeBook(default_root())
    if len(sys.argv) > 1:
        q = " ".join(sys.argv[1:])
        for r, s in book.search(q, limit=10):
            print(f"{s:7.2f}  {r.id}\n         {r.title}")
    else:
        print(f"{len(book.recipes)} recipes in {book.root / RECIPES_DIR}")
        for topic, n in sorted(book.topics().items()):
            print(f"  {n:3}  {topic}")
        for p in book.problems:
            print("  problem:", p)
