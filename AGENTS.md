# AGENTS.md

Instructions for an AI agent working **inside this repository**. To *use* the recipes while
converting a Creatio project, see [skill/creatio-migration/SKILL.md](skill/creatio-migration/SKILL.md).

## What this repository is

Recipes for migrating Creatio **Classic UI (7.x)** client code to **Freedom UI (8.1+)**. Each
recipe takes one Classic UI technique and shows its Freedom UI equivalent side by side. The
Python MCP server in `mcp-server/` makes them searchable.

Nothing here compiles or runs. The `.js` files are templates: two `define(...)` calls in one
file, undeclared globals (`Terrasoft`, `Ext`, `sdk`) and placeholder GUIDs are all
intentional. Do not lint, format or "fix" them.

## The recipe format: one hard contract

Every recipe is a `.js` file under `Recipes/<Topic>/`, named `HowToMigrate<Thing>.js`. The file
name is indexed for search, so name it after the Classic UI concept a developer would search
for (`HowToMigrateLookupFilter`, `HowToMigrateSandboxMessages`).

The file has this structure. [Recipes/Attributes/HowToMigrateLookupFilter.js](Recipes/Attributes/HowToMigrateLookupFilter.js)
is the reference example.

```js
// --- How to migrate <thing> to Freedom UI -----------------------------------
// One paragraph: how Classic UI does it, and where it lives in Freedom UI.
//
// API MAP
//   <Classic UI API>          ->  <Freedom UI API>
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - behaviour that changes, or has no equivalent (say what to do instead)
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   what breaks without an error when the code is translated line by line
//
// Source: <url>                      (one or more; required)

// ===== CLASSIC UI (7.x) =====================================================
define("UsrMyEntity1Page", [], function() { ... });

// ===== FREEDOM UI (8.1+) ====================================================
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[...]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ { ... });
```

- The header is the `// --- Title ---` line plus the `//` lines after it, up to the first blank
  line. That is what search indexes and shows. **No blank line inside the header**; use `//`
  on its own line to separate paragraphs.
- Both code sections, with exactly those two marker lines, are required in every topic folder
  except `Strategy` and `Pitfalls`, which are reference text.
- Show the **same task** in both halves, so the reader can compare line by line.
- Freedom UI code targets **8.1+** (`viewModelConfigDiff`, `modelConfigDiff`). When something
  differs on 8.0 or on a specific 8.x version, say so in the header.
- Cite at least one `Source:` URL that actually supports the claims: academy.creatio.com, the
  JS API reference, the `@creatio-devkit/common` typings on npm, or a named community or
  CustomerFX article. A behaviour you only observed is written as "observed", never as fact.
  When there is no Freedom UI equivalent, say so plainly and show the closest working route.

## Conventions

- Tabs for indentation.
- Placeholders only, never names from a real project. Use `UsrMyEntity` for the master entity.
  Pages are `UsrMyEntity1Page` (Classic) and `UsrMyPage_FormPage` (Freedom). Details and lists
  are `UsrMyDetailEntity` and `UsrMyDetail`. A picked entity is `UsrRelatedEntity`. Generated
  Freedom attributes look like `PDS_Name_a1b2c3d`.
- GUIDs are invented and go in named constants. Never copy one from a real database.
- Cross-references to other recipes are written as `See: Recipes/<Topic>/<File>.js`.

## Checks

```bash
python tools/check_recipes.py
```

It must print **all checks passed**. It fails on any of these:

- a lost or malformed header;
- a missing CLASSIC or FREEDOM code section;
- a missing `Source:` line;
- space indentation;
- a GUID that looks real;
- a `See:` link to a missing file;
- a search regression in `tests/search_cases.tsv`.

For each new recipe, add a line to `tests/search_cases.tsv` with a query a developer would
type, usually the Classic UI API name.

## Do not

- Do not mix the generations inside one half. A `Terrasoft.*` call in the Freedom UI half, or
  an `sdk.*` call in the Classic half, is always wrong.
- Do not add Markdown copies of recipes. Search reads only the `.js` files.
- Do not edit `mcp-server/` as part of a content change.
