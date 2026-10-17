"""
creatio-migration MCP server (stdio).

    python server.py

Tools: search_recipes, get_recipe, find_api, list_recipes, kb_overview.
All loading and ranking lives in recipe_search.py.
"""

from __future__ import annotations

from pathlib import Path

try:  # MCP Python SDK 2.x
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # 1.x
    from mcp.server.fastmcp import FastMCP as _Server

from recipe_search import RECIPES_DIR, RecipeBook, default_root

app = _Server(
    "creatio-migration",
    instructions=(
        "Recipes for converting Creatio Classic UI (7.x) client code to Freedom UI (8.1+). "
        "Each recipe shows the Classic UI code and its Freedom UI equivalent side by side, "
        "maps the APIs and lists what does not carry over one-to-one. Look a construct up "
        "here BEFORE converting it: a line-by-line rewrite usually runs and then fails "
        "silently. Search with the Classic UI API you are replacing (lookupListConfig, "
        "sandbox.publish, getSectionActions...), then read the recipe with get_recipe."
    ),
)

ROOT: Path = default_root()
_book: RecipeBook | None = None
_stamp: int | None = None


def _current_stamp() -> int:
    base = ROOT / RECIPES_DIR
    files = sorted(base.rglob("*.js")) if base.is_dir() else []
    return hash(tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in files))


def book() -> RecipeBook:
    """The loaded recipes, reloaded whenever a recipe file is added, removed or edited."""
    global _book, _stamp
    stamp = _current_stamp()
    if _book is None or stamp != _stamp:
        _book, _stamp = RecipeBook(ROOT), stamp
    return _book


@app.tool()
def kb_overview() -> str:
    """
    List the recipe topics and how many recipes each holds.

    Use it when you do not know what is covered. For a concrete Classic UI
    construct, call search_recipes directly.
    """
    b = book()
    rows = [f"{len(b.recipes)} migration recipes (Classic UI 7.x -> Freedom UI 8.1+):", ""]
    rows += [f"  {n:3}  {topic}" for topic, n in sorted(b.topics().items())]
    rows += ["", "Start with Strategy/ApiMappingReference; finish with Pitfalls/MigrationPitfalls."]
    return "\n".join(rows)


@app.tool()
def search_recipes(query: str, area: str = "", limit: int = 8) -> str:
    """
    Find migration recipes. Call this before converting any Classic UI code.

    query: the Classic UI API or construct being replaced ("lookupListConfig",
           "Terrasoft.BatchQuery", "isAddMode"), a task ("make a detail editable"),
           or a symptom ("list shows every record").
    area:  accepted for compatibility; this server has one area, "Migration".
    limit: number of results, 1-25 (default 8).
    """
    b = book()
    hits = b.search(query, limit=max(1, min(limit, 25)))
    if not hits:
        return f'Nothing matched "{query}". Try the Classic UI API name, or call kb_overview.'
    out = [f'{len(hits)} recipe(s) for "{query}":', ""]
    if not any(b.is_about(r, query) for r, _ in hits[:3]):
        out = ["NOTE: no result is really about this query - it only shares words with them.",
               "There is probably no recipe for it; check academy.creatio.com instead.", ""] + out
    for r, score in hits:
        out += [f"{r.id}   (score {score:.1f})", f"    {r.title}", f"    {r.summary()}", ""]
    out.append("Read one with get_recipe(<id>).")
    return "\n".join(out)


@app.tool()
def get_recipe(recipe_id: str) -> str:
    """
    Return one recipe in full: header (API map, what does not carry over, silent
    failures), then the Classic UI and Freedom UI code.

    recipe_id: an id from search_recipes, e.g. "Recipes/Attributes/HowToMigrateLookupFilter";
               a bare file name works when it is unique.

    The code is a template: replace entity/page names, generated attribute names
    (PDS_Name_a1b2c3d) and every GUID with the project's own.
    """
    r = book().get(recipe_id)
    if r is None:
        return f'No recipe "{recipe_id}". Use search_recipes to find the id.'
    cited = ", ".join(r.sources) if r.sources else "none - verify before relying on it"
    return (f"# {r.title}\nfile: {r.rel_path}\nsources: {cited}\n" + "=" * 72 + "\n" + r.text)


@app.tool()
def find_api(symbol: str, limit: int = 10) -> str:
    """
    List the recipes that mention an API name, most mentions first.

    symbol: e.g. "Terrasoft.ServerChannel", "crt.SaveRecordsRequest", "sdk.FilterGroup";
            a bare name ("ServerChannel") also matches the dotted form.
    """
    hits = book().find_symbol(symbol, limit=max(1, min(limit, 25)))
    if not hits:
        return f'No recipe mentions "{symbol}". Try search_recipes with a description.'
    rows = [f'Recipes mentioning "{symbol}":', ""]
    rows += [f"{r.id}   ({n}x)\n    {r.title}" for r, n in hits]
    return "\n".join(rows)


@app.tool()
def list_recipes(area: str = "", topic: str = "") -> str:
    """
    List recipe ids and titles, optionally for one topic folder
    (Strategy, Lifecycle, Attributes, Data, Lists, Sections, UI, Messaging, Pitfalls).
    `area` is accepted for compatibility and ignored.
    """
    items = sorted(
        (r for r in book().recipes.values() if not topic or r.topic.lower() == topic.lower()),
        key=lambda r: r.id,
    )
    if not items:
        return f'No recipes in topic "{topic}". Call kb_overview for the topics.'
    return "\n".join(f"{r.id}\n    {r.title}" for r in items)


def main() -> None:
    if not (ROOT / RECIPES_DIR).is_dir():
        raise SystemExit(f"No {RECIPES_DIR}/ folder under {ROOT}; set CREATIO_KB_ROOT.")
    app.run()


if __name__ == "__main__":
    main()
