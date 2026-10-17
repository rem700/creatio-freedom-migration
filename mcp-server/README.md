# creatio-migration MCP server

This server gives an AI assistant search access to the migration recipes over MCP. The
assistant can look up how to convert one Classic UI technique without loading every
recipe into its context.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_recipes(query, area?, limit?)` | Ranked search. The query can be the Classic UI API you are replacing (`lookupListConfig`, `sandbox.publish`), a task, or a symptom. |
| `get_recipe(recipe_id)` | Returns the full recipe: the sources it cites, the header (API map, what does not carry over, silent failures), then the Classic UI and Freedom UI code. |
| `find_api(symbol, limit?)` | Lists the recipes that mention an API name, such as `Terrasoft.BatchQuery`, `crt.SaveRecordRequest` or `sdk.FilterGroup`. |
| `list_recipes(area?, topic?)` | Lists recipe ids and titles. Topics: `Strategy`, `Lifecycle`, `Attributes`, `Data`, `Lists`, `Sections`, `UI`, `Messaging`, `Pitfalls`. |
| `kb_overview()` | Shows the topics and how many recipes each has. |

How search works:

- Ranking is BM25 over three weighted fields (title, header, code), with light stemming
  and a small synonym map.
- No API keys, network access or embedding service are needed.
- When none of the top results is actually about the query, the server says so.

## Install and register

```bash
cd mcp-server
python -m venv .venv
.venv/Scripts/activate        # Windows; source .venv/bin/activate elsewhere
pip install -e .
claude mcp add creatio-migration -- <venv-python> <repo>/mcp-server/server.py
```

The following JSON is the same for Cursor (`.cursor/mcp.json`) and Claude Desktop
(`claude_desktop_config.json`):

```json
{ "mcpServers": { "creatio-migration": { "command": "<venv-python>", "args": ["<repo>/mcp-server/server.py"] } } }
```

The server expects the recipes in the parent folder of `mcp-server/`. To keep them
elsewhere, set the `CREATIO_KB_ROOT` environment variable to that folder.

## Check without a client

`recipe_search.py` uses only the Python standard library:

```bash
python recipe_search.py                       # loaded recipes per topic
python recipe_search.py "lookupListConfig"    # try a query
python ../tools/check_recipes.py              # all repository checks
```
