# creatio-freedom-migration

**63 recipes for migrating Creatio Classic UI (7.x) client code to Freedom UI (8.1+).** Each
recipe puts the Classic UI code next to its Freedom UI equivalent. It includes an API map,
names what does **not** carry over one-to-one, and describes the silent failure you get from
a line-by-line translation. An MCP server lets an AI assistant search the recipes.

## Why

Freedom UI is not Classic UI with a new syntax. Code that is ported mechanically usually
runs and then misbehaves without any error:

- `this.get("X")` was synchronous. `await request.$context.PDS_X_a1b2c3d` is async, and the
  attribute has a new, generated name.
- A Classic detail filtered itself by its master record. A Freedom UI list shows **every row
  of the table** unless `modelConfigDiff` declares `dependencies`.
- `Terrasoft.FilterGroup.add(key, filter)` throws on a duplicate key.
  `sdk.FilterGroup.add(filter, key)` takes its arguments in the reverse order and silently
  replaces the old filter. `addSchemaColumnFilterWithParameter` returns `void`, so using its
  result as a filter means no filter at all.
- Listeners released in `destroy()` pile up: cleanup belongs in the Pause handler.
- A new record already has an `Id`, so "no Id yet" no longer means "unsaved".

The recipes pin down the version that works and cite where each claim comes from:
academy.creatio.com, the JS API reference, the `@creatio-devkit/common` typings, and named
community articles. Behaviour that is only observed is labelled as such.

## Contents

```
Recipes/Strategy/    11   Planning, rewrite-or-keep decision tree, API cheat sheet, schema structure map,
                          version compatibility, page replacement, coexistence, generated names,
                          debugging, review checklists, what does not migrate with the code
Recipes/Example/      1   A complete record page migrated end to end
Recipes/Lifecycle/    8   init, save, validation, asyncValidate, onRender/DOM, destroy, new-record check,
                          mixins
Recipes/Attributes/   8   declaration, dependencies, enabled/visible/required, lookup filters,
                          dependent lookups, field read/write, localizable strings, business rules
Recipes/Data/         7   ESQ -> sdk.Model, filters, insert/update/delete, BatchQuery -> transactions,
                          ServiceHelper -> HttpClientService, system settings, slow async patterns
Recipes/Lists/        8   details -> lists, toolbar buttons, multi-select add, editable lists,
                          default values, files, detail <-> page messaging, approvals
Recipes/Sections/     5   section actions, filters, grid columns, mini page, modes and buttons
Recipes/UI/           8   buttons, tabs, dialogs, body mask, custom controls -> remote modules,
                          printables, dashboards and charts, feed and timeline
Recipes/Messaging/    6   sandbox messages, ServerChannel, processes, current user, rights, features
Recipes/Pitfalls/     1   Checklist of everything that breaks silently
tools/verify/             A test page that checks the "(observed)" claims on your instance
```

Where to start:

1. Read `Recipes/Strategy/HowToPlanClassicToFreedomMigration.js` and decide per schema with
   `Recipes/Strategy/RewriteOrKeepClassicDecisionTree.js`.
2. Read `Recipes/Example/HowToMigrateACompleteRecordPage.js` to see one whole page migrated.
3. While converting, use `Recipes/Strategy/ApiMappingReference.js` as the cheat sheet.
4. Review the result with `Recipes/Strategy/MigrationChecklists.js` and
   `Recipes/Pitfalls/MigrationPitfalls.js`.

**Versions.** Every recipe has an `Applies:` line naming the Creatio versions it is valid for.
Where a recipe needs a specific `@creatio-devkit/common` service, the line names the devkit
version too. Creatio does not publish which devkit version each Creatio release ships;
`Recipes/Strategy/VersionCompatibilityReference.js` explains how to check this on your
instance.

**Unverified behaviour.** Some claims are marked "(observed)" because no documentation states
them. `tools/verify/` has a Freedom UI test page that checks most of them on your own
instance. Use it on a test or dev instance only.

## Using it with an AI assistant

```bash
cd mcp-server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
claude mcp add creatio-migration -- <venv-python> <repo>/mcp-server/server.py
```

Then copy `skill/creatio-migration/` into `.claude/skills/` of the project you are migrating.
The skill tells the assistant to check the recipes before converting a Classic UI construct.
Setup for Cursor and Claude Desktop is in [mcp-server/README.md](mcp-server/README.md).

Search by the Classic UI API you are replacing. These all find the right recipe:
`lookupListConfig`, `sandbox.publish`, `getSectionActions`, `Terrasoft.BatchQuery`,
`isAddMode`, `FileDetailV2`.

```bash
python mcp-server/recipe_search.py "LookupMultiAddMixin"   # search from the command line, no install needed
```

## The recipes are templates

Before using any of the code, replace the schema and entity names (`UsrMyEntity`,
`UsrMyPage_FormPage`), the generated Freedom UI attribute names (`PDS_Name_a1b2c3d`), and
**every GUID**. The GUIDs are invented on purpose.

## Contributing

Read [AGENTS.md](AGENTS.md) for the recipe format, then run the checks:

```bash
python tools/check_recipes.py
```

The checks cover the header format, that both code halves are present, that a `Source:` line
exists, the indentation, the GUIDs, the cross-references and the search regressions. CI runs
them on every push.

## Credits

The idea of a recipe base that an AI assistant searches through an MCP server comes from
[artemivzhenko/creatio-knowledge-base](https://github.com/artemivzhenko/creatio-knowledge-base)
by Artem Ivzhenko. This repository contains no code from that project: the recipes, the
search engine and the checks here were written for it.

## License

[MIT](LICENSE). Creatio is a trademark of its owner; this project is not affiliated with it.
