# Verify the "(observed)" claims on a test instance

> **TEST / DEV INSTANCES ONLY. Never install this on production.**
> The page adds handlers to a record page, writes test values into page attributes,
> sends a harmless POST to a non-existent service, and exposes `window.UsrMigrationVerify`.
> Use a throw-away package and remove it afterwards.

`UsrMigrationVerify_FormPage.js` is a Freedom UI page schema (handlers, one validator and a
minimal `viewConfigDiff`). On a record page that has **a lookup field, a list and a few fields**
it logs what the platform actually does for the claims the recipes mark "(observed)":

```
[verify #N] <claim> -> <result>
```

`N` is the claim number in the table below. This folder is outside `Recipes/`, so search does
not index it and `tools/check_recipes.py` does not check it.

## 1. Install

1. Use a test instance and a test package. Note the Creatio version (the page also logs
   `coreVersion` as check #44).
2. Pick a Freedom UI form page with a lookup field, a list (former detail) and a few text
   fields - a small test app built in the No-Code Designer is ideal.
3. Configure the placeholders at the top of the file (`CONFIGURE`):
   - `LOOKUP_ATTR` - the attribute of the lookup field, e.g. `PDS_UsrCity_a1b2c3d`, and the
     key `"PDS_UsrVerifyLookup_List"` in `viewModelConfigDiff` -> `"<LOOKUP_ATTR>_List"`.
   - `LIST_ATTR` - the list's collection attribute (the grid's `"items"` without `$`).
   - `DIRTY_ATTR` - the attribute of a text field on the page.
   - `PRIMARY_DS` and the path `"PDS.CreatedOn"` if the page's data source is not `PDS`.
   - `parentName` of `UsrVerifyPanel` (`"SideAreaProfileContainer"`) and of the button
     (`"ActionButtonsContainer"`) if your page has no such containers. Read the names off the
     page's parent schema.
   - Take every name from the page's source; do not guess generated suffixes.
4. Put the code on the page, either way:
   - **A (simplest):** open the page schema of your test package in Configuration and merge
     the entries of `viewConfigDiff`, `viewModelConfigDiff`, `handlers` and `validators` into
     the existing arrays/objects. Copy the constants and helper functions into the `define`
     body above `return`. Keep the designer's own entries.
   - **B:** create a replacing schema of the test form page in the test package, paste the
     file and rename the `define("UsrMigrationVerify_FormPage", ...)` name to the replaced
     schema's name.
5. Save, then hard-refresh the browser (Ctrl+F5) so the new schema is loaded.

## 2. What to click

Open DevTools > Console and type `[verify` into the console filter. Keep "Preserve log" on.

| Step | Do this | Checks that log |
|---|---|---|
| 1 | Open an **existing** record of the page. Wait 3 s. Do not type anything yet: the page itself writes nothing on load, so the `#6` lines show only what the platform does. | 2, 3, 6, 12, 13, 19, 20, 21, 22, 23, 27, 33, 42, 44 |
| 2 | Run `UsrMigrationVerify.changeKey()`. Then run `UsrMigrationVerify.setLookupFilter("group")` and open the lookup dropdown; then `setLookupFilter("json")`, open it again; then `setLookupFilter("none")`, open it again. | 4, 5, 42 |
| 3 | Type `123` into "verify #26: value-bound" and "verify #26: control-bound", leave each field. | 26 |
| 4 | Type into "verify #7 ...". Is it editable? Has it a required asterisk? | 7 |
| 5 | Click the "Verify #43: dialog" button (its presence answers #41). Close with **Escape**. Repeat, close with **X**. Repeat, click **OK**. No button? Run `UsrMigrationVerify.dialog()`. | 41, 43 |
| 6 | Navigate to another section, then come back with the browser Back button. | 18, 22 |
| 7 | Close the page with its close button, then open another record. | 18, 22 |
| 8 | Click **New** / Add to create a record. Leave a required field empty and click Save. Fill it and Save again. | 17, 20, 24 |
| 9 | If the page offers Copy, copy a record. (What getPrimaryModelMode returns on a copy is undocumented.) | 20 |
| 10 | Open a list row in its own page, change something, save, close. Was the list's data source reloaded (a `#42` line with the list DS and `loadType`)? | 28 (via 42) |
| 11 | Select two list rows and run `UsrMigrationVerify.selection()`; then "select all" and run it again. | 36 |
| 12 | Run `UsrMigrationVerify.dirty()`, then close the page **without saving**. | 8 |
| 13 | Run `UsrMigrationVerify.csrf()`; in DevTools > Network open the `Ping` request and look for the `BPMCSRF` request header. | 15 |

## 3. Reading the results

- Each line names the claim and the actual value. Compare it with the claim; write
  "confirmed", "refuted" or the actual value into the Result column below, with the Creatio
  version (#44) and the date.
- A check that logs **nothing** is a result too: e.g. no `#19 event "finish-load-model-attributes"`
  line within 3 s means the event did not fire on this version (#19 also logs a summary at 3 s).
- `#18`: if `Pause` lines appear on navigation and no `Destroy` line appears, the claim
  "Destroy does not fire on ordinary navigation" is confirmed for that action.
- `#22`: on returning to the page, `resumeCount` grows while `initCount` does not.
- `#2`: `ModifiedOn (undeclared) = undefined` while `UsrVerifyCreatedOn` has a date confirms it.
- `#12`: "empty group" rows = "without filter" rows (> 0) confirms "empty group = no filter".
  The page only LOADS; it never runs update/delete with an empty filter.
- `#6`: read the `#6` lines from step 1 only (before `changeKey()` / `setLookupFilter()`, which
  are page writes). `true` at finish-load or at 3 s with nobody typing = confirmed.
- `#5`: an empty dropdown after `setLookupFilter("group")` = the FilterGroup was applied; a full
  list = ignored, then try `"json"`.
- `#26`: the validator line appears only for the control-bound input, and a value-bound edit
  produces no "received" line = confirmed.
- `#44` lists which devkit services exist at runtime - use it for
  `Recipes/Strategy/VersionCompatibilityReference.js`.

Remove the code from the page and delete the test package when you are done.

## 4. Claims and checks

**Results.** Run on Creatio 10.1.796.0 (CRM bundle trial), stock `Contacts_FormPage` replaced,
2026-10-24 (first run 2026-10-17). Every "Result" below holds for that one version only. The
browser extension's console tool can miss or deduplicate lines, so the results were collected
with a `console.log` hook that copied every `[verify` line into a window array.
Two findings broke the page before any check ran, and the page was fixed for them: a custom
validator without `{ "name": "message" }` in its `params` ("Property message is not defined in
validator params config", the page never opens), and a `crt.Input` bound with `"value"` and no
`"control"` (TypeError in `crtOnViewModelInit`, the page stays behind the loading mask).

Numbers follow the order of `grep -n observed` over the 50 recipes; several recipes stating
the same claim share one number. "-" = not checkable from a page (reason given).

| # | Claim (observed) | Recipe file(s) under Recipes/ | Check | Result |
|---|---|---|---|---|
| 1 | The 8.0 section shape (`viewModelConfig` / `modelConfig`) on 8.1+ is ignored without an error | Attributes/HowToMigrateAttributeDeclaration.js; Strategy/HowToPlanClassicToFreedomMigration.js | - optional, see section 5 | |
| 2 | A column read in code needs an attribute with `modelConfig.path`, or it is not loaded | Attributes/HowToMigrateAttributeDeclaration.js | #2 | Confirmed on 10.1.796: undeclared ModifiedOn = undefined, declared CreatedOn has a date (null at the first finish-load) |
| 3 | Classic keys (`dataValueType`, `type: VIRTUAL_COLUMN`) in a Freedom attribute are ignored, no error | Attributes/HowToMigrateAttributeDeclaration.js | #3 | Confirmed on 10.1.796: attribute reads "x", no error |
| 4 | The `"change"` key request carries no value; read the attribute with await | Attributes/HowToMigrateAttributeDependencies.js | #4 (step 2) | Confirmed on 10.1.796: request keys type, $context, scopes; request.value undefined; await gives the value |
| 5 | A filter attribute holding an `sdk.FilterGroup` works; else assign `filter.toJson()` | Attributes/HowToMigrateDependentLookup.js | #5 (step 2) | Confirmed on 10.1.796: both an sdk.FilterGroup instance and toJson() filter the list; null = full list |
| 6 | `HasUnsavedData` can turn true during load | Attributes/HowToMigrateDependentLookup.js; Lifecycle/HowToMigrateNewRecordDetection.js (community) | #6 | Differs on 10.1.796: true 3 ms after init for a NEW record; false during load of an existing record; virtual and filter attribute writes do not set it |
| 7 | `"enabled"` / `"isRequired"` kept in `viewConfigDiff` have no effect | Attributes/HowToMigrateEnabledVisibleRequired.js | #7 (step 4) | Confirmed on 10.1.796: "enabled": false ignored (field editable); isRequired shows no asterisk |
| 8 | Assigning a data-source attribute marks the page dirty (`HasUnsavedData`) | Attributes/HowToMigrateFieldValueReadWrite.js | #8 (step 12) | Confirmed on 10.1.796: assigning JobTitle sets it; restoring the original value does NOT reset it |
| 9 | `#ResourceString(X)#` is resolved once, not a runtime binding | Attributes/HowToMigrateLocalizableStrings.js | - needs schema resources, visual | |
| 10 | Wrong resource form or a Classic-only key renders empty / raw key | Attributes/HowToMigrateLocalizableStrings.js | - needs schema resources, visual | |
| 11 | A Classic BatchQuery is not a transaction: partial failure leaves rows written | Data/HowToMigrateBatchQuery.js | - Classic UI, not a Freedom page | |
| 12 | An empty FilterGroup means "every row" (update/delete) | Data/HowToMigrateBatchQuery.js; Data/HowToMigrateInsertUpdateDelete.js; Pitfalls/MigrationPitfalls.js | #12 (load as a safe proxy; no writes) | Confirmed on 10.1.796 (load only): empty group 5 rows = no filter 5 rows; writes not tested |
| 13 | A plain `"UsrType.Name"` attribute comes back under the dotted key, not the alias | Data/HowToMigrateEsqQueries.js | #13 | Confirmed on 10.1.796: key "Owner.Name"; {name, path} gives the alias (an extra "Photo" key also came back) |
| 14 | Sending an `Id` in the insert dto sets the new record's id | Data/HowToMigrateInsertUpdateDelete.js | - writes data; test on a sandbox entity | |
| 15 | HttpClientService adds the CSRF header (also for a Blob upload) | Data/HowToMigrateServiceHelperCalls.js; Lists/HowToMigrateFileDetail.js | #15 (step 13, Network tab) | Confirmed on 10.1.796 in the sense that a CSRF header is added: at fetch level it is named crt_csrf (BPMCSRF cookie exists); a 404 rejects the promise |
| 16 | A system setting the user may not read comes back empty, not as an error | Data/HowToMigrateSysSettings.js | - needs a user without read rights | |
| 17 | A failed field validator makes `await next.handle()` in the save handler resolve falsy | Lifecycle/HowToMigrateAsyncValidate.js | #17 (step 8) | Not tested as designed: a validator failing on a VIRTUAL attribute does not block save (next.handle resolved true); unverified for data-source fields |
| 18 | `crt.HandleViewModelDestroyRequest` does not fire on ordinary navigation; Pause does | Lifecycle/HowToMigrateDestroyAndCleanup.js; Messaging/HowToMigrateServerChannel.js; Pitfalls/MigrationPitfalls.js | #18 (steps 6-7) | Confirmed on 10.1.796: section navigation = Pause only, Back = Resume (same view model, state kept); close button = Pause then Destroy; no unsaved-changes prompt via the section menu |
| 19 | `events$` emits `"finish-load-model-attributes"` (reported from 8.1.3) | Lifecycle/HowToMigrateInitAndOnEntityInitialized.js; Strategy/ApiMappingReference.js; Pitfalls/MigrationPitfalls.js | #19 | Confirmed on 10.1.796, with a difference: fires several times on load ({"Id"} only, then {}, then ~35 keys) and again for lookup and list loads (9 within 3 s) |
| 20 | `getPrimaryModelMode()` returns `"create"` (new) / `"update"` (existing) | Lifecycle/HowToMigrateInitAndOnEntityInitialized.js; Lifecycle/HowToMigrateNewRecordDetection.js; Lists/HowToMigrateDetailPageMessaging.js | #20 (steps 1, 8, 9) | Differs on 10.1.796: "init" at init and early finish-loads; "update" / "create" only once the record data is loaded |
| 21 | The finish-load payload holds per-attribute true/false flags, only attributes on the page | Lifecycle/HowToMigrateInitAndOnEntityInitialized.js | #21 | Confirmed on 10.1.796 (flags, not values; all true); payload also carries lookup/list keys ("Owner_List.value", "AddressList.AddressListDS_AddressType"); "only on-page attributes" not checked |
| 22 | A view model is initialised once and resumed on return | Lifecycle/HowToMigrateInitAndOnEntityInitialized.js | #22 (step 6) | Confirmed on 10.1.796: init once, resumed on return; Resume also follows Init on the first open |
| 23 | `getPrimaryModelMode()` exists at runtime although it is in no devkit typings | Lifecycle/HowToMigrateInitAndOnEntityInitialized.js; Lifecycle/HowToMigrateNewRecordDetection.js | #23 | Confirmed on 10.1.796: typeof getPrimaryModelMode = function |
| 24 | After the first save of a new record the mode becomes `"update"` | Lifecycle/HowToMigrateNewRecordDetection.js | #24 (step 8) | Confirmed on 10.1.796: "create" before, "update" after the first save |
| 25 | A global stylesheet on internal Freedom class names works today, breaks on update | Lifecycle/HowToMigrateOnRenderAndDomAccess.js | - needs two platform versions | |
| 26 | An input bound with `"value"` is not validated and does not write edits back; `"control"` is | Lifecycle/HowToMigrateValidationConfig.js; Pitfalls/MigrationPitfalls.js | #26 (step 3) | Differs on 10.1.796: a crt.Input with "value" and no "control" breaks the whole page (TypeError in crtOnViewModelInit); control-bound inputs are validated on every keystroke |
| 27 | `"$Id"` in the generated add button resolves to the page record id | Lists/HowToMigrateDetailDefaultValues.js | #27 partial (logs `$context.Id`; inspect the generated button) | Partial on 10.1.796: $context.Id equals the record id; the generated button not inspected |
| 28 | A list is not always reloaded after a record page opened from it closes | Lists/HowToMigrateDetailPageMessaging.js | via #42 (step 10) | |
| 29 | `dependencies` shape as the designer generates it | Lists/HowToMigrateDetailToList.js | - read the generated schema | |
| 30 | A list's ExpansionPanel tools stay visible when collapsed | Lists/HowToMigrateDetailToolbarButtons.js | - visual | |
| 31 | `processParameters` on crt.RunBusinessProcessRequest works although undocumented | Lists/HowToMigrateDetailToolbarButtons.js; Messaging/HowToMigrateProcessLaunch.js; Pitfalls/MigrationPitfalls.js | - needs a test process | |
| 32 | Objects that came from Classic keep their `<Entity>File` table | Lists/HowToMigrateFileDetail.js | - check the object / list data source | |
| 33 | An unknown feature code reads as disabled | Messaging/HowToMigrateFeatureToggles.js | #33 | Confirmed on 10.1.796: unknown feature -> false |
| 34 | `executeProcessByName` waits until the end or a user task | Messaging/HowToMigrateProcessLaunch.js | - needs a test process | |
| 35 | A wrong (case-mismatched) process parameter code is ignored without an error | Messaging/HowToMigrateProcessLaunch.js; Pitfalls/MigrationPitfalls.js | - needs a test process | |
| 36 | SelectionState shape `{ type: "specific", selected }` / `{ type: "all", unselected }` | Sections/HowToMigrateSectionActions.js; Strategy/ApiMappingReference.js | #36 (step 11) | Partial on 10.1.796: null with no selection; the "specific" / "all" shapes not checked |
| 37 | A merge on `filterAttributes` replaces the whole array | Sections/HowToMigrateSectionFilters.js | - list page; compare the merged schema | |
| 38 | Custom code, business rules, lookups and localisation do not come along when a section is moved | Strategy/HowToReplaceClassicPageWithFreedomPage.js | - section move procedure | |
| 39 | A Base7xViewElement custom element can load a Classic module (community pattern) | Strategy/HowToRunClassicAndFreedomSideBySide.js | - needs that element | |
| 40 | A plain Module schema can be a dependency of both a Classic and a Freedom page | Strategy/HowToRunClassicAndFreedomSideBySide.js | - needs two pages | |
| 41 | `"ActionButtonsContainer"` exists in the stock form page | UI/HowToMigrateDiffButtons.js | #41 (step 5: button visible?) | Confirmed on 10.1.796: ActionButtonsContainer exists (the test button rendered there) |

Extra checks (not marked "observed" in the recipes, but needed to verify them):

| # | Claim | Recipe file(s) under Recipes/ | Check | Result |
|---|---|---|---|---|
| 42 | A lookup's list data source is `<lookup attr>_List_DS`; list and page data source names | Attributes/HowToMigrateLookupFilter.js | #42 | Confirmed on 10.1.796: `Owner_List_DS` (= `<attr>_List_DS`), only when the dropdown opens (loadType "reload"); at load only PageParameters and PDS; AddressListDS / CareerListDS ~3 s later |
| 43 | What crt.ShowDialogRequest / DialogService resolve to on Escape / X (undocumented) | UI/HowToMigrateDialogs.js | #43 (step 5) | On 10.1.796: Escape -> undefined, OK -> "UsrVerifyOk" (string), same for crt.ShowDialogRequest and DialogService.open; X not recorded |
| 44 | Platform version and which devkit services exist at runtime | Strategy/VersionCompatibilityReference.js | #44 | 10.1.796.0; DialogService, MessageChannelService, ProcessEngineService, TransactionFactoryService, SchemaModalService, FeatureService, RightsService present |

## 5. Optional: claim #1 (8.0 section shape)

Not part of the page, because a wrong section could break it. On a SEPARATE test page add,
next to `viewModelConfigDiff`, an 8.0-style section and read the attribute in the init handler:

```js
viewModelConfig: { attributes: { "UsrVerify80Attr": { "value": "from 8.0 section" } } },
// in crt.HandleViewModelInitRequest, after next:
console.log("[verify #1] 8.0 section ignored on 8.1+ ->", await request.$context.UsrVerify80Attr);
```

`undefined` and an opening page = the section was ignored without an error.
