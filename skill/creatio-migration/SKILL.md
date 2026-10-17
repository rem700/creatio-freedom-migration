---
name: creatio-migration
description: Look up the Classic UI to Freedom UI migration recipes before converting Creatio client code. Use whenever a task rewrites a Classic UI (7.x) page, detail, section or module as a Freedom UI (8.x) page, or asks for "the Freedom UI version" of Classic code (diff, methods, attributes, sandbox, Terrasoft.*).
---

# Creatio Classic UI → Freedom UI migration

The `creatio-migration` MCP server holds recipes that pair each Classic UI technique with its
Freedom UI equivalent. Each recipe has three parts: an API map, a list of what does NOT carry
over one-to-one, and the silent failure you get when the code is translated line by line.

## Before converting any Classic UI code

A mechanical rewrite usually runs without errors and then misbehaves without a sound. Some
examples:

- a list that shows every row of the table;
- a filter that is never applied;
- a listener that is attached again on every visit.

So do not translate from memory. For each Classic construct in the schema:

1. Call `search_recipes` with the Classic API name you are replacing, for example
   `lookupListConfig`, `sandbox.publish`, `ServiceHelper.callService`, `isAddMode` or
   `getSectionActions`.
2. Call `get_recipe` on the best hit and follow its Freedom UI half.
3. Re-read its "DOES NOT CARRY OVER" list. These are the places where the result needs a design
   decision, not a translation.

For a whole schema, start with `Recipes/Strategy/SchemaStructureMappingReference` and
`Recipes/Strategy/ApiMappingReference`. Finish with `Recipes/Pitfalls/MigrationPitfalls` as a
review checklist.

## Rules that always apply

- Freedom UI reads are asynchronous. Every `this.get(...)` becomes `await request.$context.X`,
  and the attribute name changes to the generated one (`PDS_Name_a1b2c3d`). Read the name off
  the real schema.
- The recipes target 8.1+, which uses the `*Diff` sections. On 8.0 the sections have a
  different shape.
- Never mix generations. `Terrasoft.*` in a Freedom UI schema, or `sdk.*` in a Classic one, is
  always wrong.
- If `search_recipes` adds a NOTE that no result is about the topic, there is no recipe for
  it. Say so, and check academy.creatio.com instead of adapting a loosely related recipe.
- `get_recipe` lists the sources each recipe cites. Wording such as "observed" or "check your
  schema" marks behaviour that is not documented, so test those points.
