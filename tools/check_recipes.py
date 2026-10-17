"""
Checks every recipe and the search regression cases. Standard library only.

    python tools/check_recipes.py

Exit code 1 if anything is wrong. CI runs this on every push.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "mcp-server"))

from recipe_search import RecipeBook  # noqa: E402

REFERENCE_TOPICS = {"Strategy", "Pitfalls"}  # prose recipes: no code halves required
CLASSIC_MARK = "// ===== CLASSIC UI (7.x)"
FREEDOM_MARK = "// ===== FREEDOM UI (8.1+)"
# Ids that come from real Creatio databases rather than being invented.
STOCK_GUID = re.compile(r"-df11-|001d60e938c6|-f36b-1410-", re.I)
GUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
SEE = re.compile(r"\bRecipes/[\w/.-]+")


def check_recipe(r, issues: list[str]) -> None:
    rel = r.rel_path
    lines = r.text.splitlines()
    if r.topic not in REFERENCE_TOPICS:
        for mark in (CLASSIC_MARK, FREEDOM_MARK):
            if mark not in r.text:
                issues.append(f"{rel}: missing the '{mark} ...' section")
        if CLASSIC_MARK in r.text and FREEDOM_MARK in r.text:
            classic, freedom = r.text.split(FREEDOM_MARK, 1)
            classic = classic.split(CLASSIC_MARK, 1)[1]
            code = lambda s: "\n".join(l for l in s.splitlines() if not l.lstrip().startswith("//"))
            if re.search(r"\bsdk\.", code(classic)):
                issues.append(f"{rel}: sdk.* used in the Classic UI half")
            if re.search(r"\b(Terrasoft|Ext)\.", code(freedom)):
                issues.append(f"{rel}: Terrasoft.* / Ext.* used in the Freedom UI half")
    if not r.sources:
        issues.append(f"{rel}: no 'Source: <url>' line")
    spaced = [n for n, l in enumerate(lines, 1) if re.match(r"^ {2,}\S", l)]
    if spaced:
        issues.append(f"{rel}: indented with spaces, not tabs (lines {spaced[:5]})")
    for g in GUID.findall(r.text):
        if STOCK_GUID.search(g):
            issues.append(f"{rel}: {g} looks like a real Creatio record id")
    for ref in SEE.findall(r.text):
        ref = ref.rstrip(".,;:)")
        target = ROOT / ref
        if not (target.exists() or target.with_suffix(".js").exists()):
            issues.append(f"{rel}: link to missing {ref}")


def check_search(book: RecipeBook, issues: list[str]) -> None:
    cases = ROOT / "tests" / "search_cases.tsv"
    for n, line in enumerate(cases.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        query, expected = line.split("\t")
        top = book.search(query, limit=3)
        if expected == "-":
            about = [r.id for r, _ in top if book.is_about(r, query)]
            if about:
                issues.append(f'search_cases.tsv:{n}: "{query}" should find nothing relevant, got {about}')
        elif expected not in book.recipes:
            issues.append(f"search_cases.tsv:{n}: unknown recipe {expected}")
        elif expected not in [r.id for r, _ in top]:
            issues.append(f'search_cases.tsv:{n}: "{query}" -> {expected} not in top 3')


def main() -> int:
    book = RecipeBook(ROOT)
    issues = list(book.problems)
    for r in book.recipes.values():
        check_recipe(r, issues)
    check_search(book, issues)
    print(f"{len(book.recipes)} recipes checked")
    for i in issues:
        print("  - " + i)
    print("all checks passed" if not issues else f"{len(issues)} problem(s)")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
