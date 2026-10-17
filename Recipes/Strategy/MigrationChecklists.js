// --- Post-migration review checklists: record page, detail to list, section, mini page, module ---
// Reference text, no code. One checklist per kind of migrated schema, to run
// after a Classic UI (7.x) schema has been rebuilt in Freedom UI (8.1+) and
// before "Form page preferences" sends users to it. Every item is one line and
// can be checked by hand on a test record or by reading the schema; each points
// to the recipe that explains the fix. Most items guard against the silent
// failures listed in the pitfalls catalog: a migrated page that loads, saves
// and raises no error can still be wrong.
//
// API MAP
//   record page (UsrMyEntity1Page)         ->  RECORD PAGE checklist (UsrMyPage_FormPage)
//   detail (BaseGridDetailV2 + details)    ->  DETAIL -> LIST checklist (crt.DataGrid on the page)
//   section (BaseSectionV2)                ->  SECTION / LIST PAGE checklist (UsrMyEntity_ListPage)
//   mini page (<Entity>MiniPage)           ->  MINI PAGE checklist (UsrMyEntity_MiniPage)
//   module / Ext control                   ->  MODULE / CUSTOM CONTROL checklist (remote module /
//                                              registerViewElement)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic regression tests that drive the DOM by "<Schema><Element>-wrapperEl"
//     ids do not apply; re-test through the UI or the data.
//   - A checklist item that passes on one Freedom UI version may fail on
//     another (lookup load-once, finish-load-model-attributes): re-run after
//     each platform update.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Testing only with the developer's own user and a freshly created record
//   misses the most common silent bugs: data wiped on opening a saved record,
//   lists showing every row, columns undefined for users whose list profile
//   hides them, rights checks that always pass. Every list below therefore
//   tests BOTH a new record and an existing one, as a non-admin user.
//
// See: Recipes/Pitfalls/MigrationPitfalls.js
// See: Recipes/Example/HowToMigrateACompleteRecordPage.js
// Applies: Creatio 8.1+ (Freedom UI); Classic UI 7.x-8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/manage-the-form-pages-overview

// ===== HOW TO USE ============================================================
//
//   Test data: one NEW record, one SAVED record with every field filled, one
//   saved record with optional fields empty. Test user: a non-administrator
//   with the same roles as the real users. Browser: hard refresh after deploy.
//   "[ ]" items are pass/fail. Fix with the recipe on the See: line under the
//   group, then re-run the whole group.

// ===== RECORD PAGE (UsrMyEntity1Page -> UsrMyPage_FormPage) ==================
//
//   Schema shape
//   [ ] The schema uses 8.1+ sections (viewConfigDiff, viewModelConfigDiff, modelConfigDiff), no 8.0 viewModelConfig/modelConfig.
//   [ ] No Classic key survives: diff, attributes, methods, messages, mixins, businessRules, details.
//   [ ] Every handler ends with `return next?.handle(request)` or deliberately stops the chain (and says why).
//   [ ] No Terrasoft.* / Ext.* / this.sandbox in the Freedom schema; no sdk.* left in the Classic one.
//       See: Recipes/Strategy/SchemaStructureMappingReference.js
//
//   Names and values
//   [ ] Every attribute name in handlers matches the generated name in the schema (PDS_<Column>_<suffix>).
//       See: Recipes/Strategy/HowToFindGeneratedNamesInFreedomSchema.js
//   [ ] Every $context read and every Resources.Strings read is awaited (no "[object Promise]" in any message).
//       See: Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//   [ ] Every input binds "control", not "value" (validation errors appear under the field).
//       See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//   [ ] Every caption, label and message key exists in the NEW schema's resources, in every shipped culture.
//       See: Recipes/Attributes/HowToMigrateLocalizableStrings.js
//
//   Start-up and change logic
//   [ ] Opening a SAVED record changes no stored value (HasUnsavedData stays false; no "unsaved changes" prompt on close).
//       See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   [ ] Logic that needs record values runs after the record has loaded, not in the bare init handler.
//       See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   [ ] New-record detection uses getPrimaryModelMode(), not "Id is empty".
//       See: Recipes/Lifecycle/HowToMigrateNewRecordDetection.js
//   [ ] Fields that recalculate each other settle after one edit (no loop, no flicker).
//       See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//
//   Fields: lookups, required, visible, read-only
//   [ ] A filtered lookup offers only matching rows on the FIRST and on a SECOND open after the parent changes.
//       See: Recipes/Attributes/HowToMigrateDependentLookup.js
//   [ ] Changing the parent clears a child that no longer fits; reopening a saved record keeps the child.
//       See: Recipes/Attributes/HowToMigrateDependentLookup.js
//   [ ] A conditionally required field turns required AND back to optional when the condition flips both ways.
//       See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   [ ] A conditionally required field is required on opening a saved record that already meets the condition.
//       See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   [ ] "readonly"/"disabled" bindings are inverted where Classic bound "enabled" (field editable when it should be).
//       See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   [ ] No rule exists both as a Freedom UI business rule and in handler code.
//       See: Recipes/Attributes/HowToMigrateBusinessRules.js
//
//   Save and validation
//   [ ] Each field validator rejects a bad value with its message and accepts an empty or good one.
//       See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//   [ ] A failing save-time check blocks the save: the record is NOT in the database afterwards (check the list).
//       See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//   [ ] A passing save-time check lets the save through, and the after-save logic runs only on success.
//       See: Recipes/Lifecycle/HowToMigrateSaveOverride.js
//   [ ] Cross-field rules (date B after date A) are checked at save time, not in a single-field validator.
//       See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//
//   Buttons, dialogs, processes, services
//   [ ] Each button is disabled/hidden exactly when the Classic one was, for new and saved records.
//       See: Recipes/UI/HowToMigrateDiffButtons.js
//   [ ] Each confirmation dialog shows its text and buttons; "No", X and Escape do nothing.
//       See: Recipes/UI/HowToMigrateDialogs.js
//   [ ] A process started from the page receives its record id and inputs (check the process log parameters).
//       See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//   [ ] Starting a process on a NEW record saves the record first (saveAtProcessStart).
//       See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//   [ ] Service calls send the same body and handle a failed response (not only success).
//       See: Recipes/Data/HowToMigrateServiceHelperCalls.js
//   [ ] Every ESQ port uses sdk.Model with an awaited load and filters built before use (no chained add*).
//       See: Recipes/Data/HowToMigrateFilters.js
//   [ ] Body masks are hidden on success AND on failure.
//       See: Recipes/UI/HowToMigrateBodyMask.js
//
//   Rights, settings, lifecycle
//   [ ] Operation-rights checks deny for a user WITHOUT the right (an un-awaited check always passes).
//       See: Recipes/Messaging/HowToMigrateOperationRights.js
//   [ ] System setting and feature-toggle reads return values, not Promises.
//       See: Recipes/Data/HowToMigrateSysSettings.js
//   [ ] Server-channel subscriptions and timers stop when the user navigates away (pause), not only on close.
//       See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   [ ] No code reads or styles the DOM; state is shown through bindings or a custom element.
//       See: Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js
//   [ ] The default tab on open matches the Classic page for each record type.
//       See: Recipes/UI/HowToMigrateTabs.js
//
//   Switch-over
//   [ ] "Form page preferences" opens the new page from Classic sections, lookups and the communication panel.
//       See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
//   [ ] Rules that must also hold for users still on Classic run on the server, not only on the page.
//       See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js

// ===== DETAIL -> LIST (BaseGridDetailV2 -> crt.DataGrid) =====================
//
//   [ ] The list shows only rows of the open record (open two records with different rows).
//       See: Recipes/Lists/HowToMigrateDetailToList.js
//   [ ] modelConfigDiff `dependencies` is keyed by the DATA SOURCE name ("<Grid>DS"), and attributePath is the link column.
//       See: Recipes/Lists/HowToMigrateDetailToList.js
//   [ ] A new record shows an empty list, and rows added after the first save appear.
//       See: Recipes/Lists/HowToMigrateDetailToList.js
//   [ ] Every add route (list button, header button, handler) sets the master link and the old defaultValues.
//       See: Recipes/Lists/HowToMigrateDetailDefaultValues.js
//   [ ] A row added through a separate page shows in the list when that page closes (reload if not).
//       See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//   [ ] Every column a handler reads is declared as an attribute of the collection, shown or not.
//       See: Recipes/Sections/HowToMigrateGridColumns.js
//   [ ] Page <-> detail sandbox messages are gone; the page reads/writes attributes directly and the values match Classic.
//       See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//   [ ] Toolbar and row actions exist for every Classic tools-menu item and active-row action.
//       See: Recipes/Lists/HowToMigrateDetailToolbarButtons.js
//   [ ] An editable list saves edited rows with the page and blocks invalid rows.
//       See: Recipes/Lists/HowToMigrateEditableDetail.js
//   [ ] Multi-select add creates one row per picked record and none on cancel.
//       See: Recipes/Lists/HowToMigrateMultiSelectAdd.js
//   [ ] A file list uploads, downloads and deletes files on the right record.
//       See: Recipes/Lists/HowToMigrateFileDetail.js
//   [ ] After the page saves, the list reloads (was onSaved + updateDetail).
//       See: Recipes/Lifecycle/HowToMigrateSaveOverride.js

// ===== SECTION / LIST PAGE (BaseSectionV2 -> UsrMyEntity_ListPage) ===========
//
//   [ ] The list shows the columns users need; the old "for all users" profile is redone as the columns array.
//       See: Recipes/Sections/HowToMigrateGridColumns.js
//   [ ] Columns used by code but hidden in the grid are declared as attributes (test as a user who hides them).
//       See: Recipes/Sections/HowToMigrateGridColumns.js
//   [ ] Fixed/quick filters exist with the Classic defaults (period, owner, "only open").
//       See: Recipes/Sections/HowToMigrateSectionFilters.js
//   [ ] Generated filter attributes of the list page (folders, predefined filter) are kept, not overwritten.
//       See: Recipes/Sections/HowToMigrateSectionFilters.js
//   [ ] Each section action exists and does nothing with an EMPTY selection (no "all records" run).
//       See: Recipes/Sections/HowToMigrateSectionActions.js
//   [ ] "Select all" + action covers all filtered rows, not only the loaded page, when Classic did.
//       See: Recipes/Sections/HowToMigrateSectionActions.js
//   [ ] The add button opens the right page per record type, with the Classic default values.
//       See: Recipes/Sections/HowToMigrateSectionModesAndButtons.js
//   [ ] Removed or hidden Classic buttons are removed or hidden on the list page too.
//       See: Recipes/Sections/HowToMigrateSectionModesAndButtons.js
//   [ ] The list reloads after actions that change rows.
//       See: Recipes/Sections/HowToMigrateSectionActions.js
//   [ ] The section's record page is the Freedom one for every record type.
//       See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js

// ===== MINI PAGE (<Entity>MiniPage -> UsrMyEntity_MiniPage) ==================
//
//   [ ] The mini page is set as the object's "Page for adding records" and opens from the list's add button.
//       See: Recipes/Sections/HowToMigrateMiniPage.js
//   [ ] No Classic mini-page keys remain (isMiniPageModelItem, layoutName, parentName "MiniPage").
//       See: Recipes/Sections/HowToMigrateMiniPage.js
//   [ ] Every field renders (an insert into a missing parent shows nothing).
//       See: Recipes/Sections/HowToMigrateMiniPage.js
//   [ ] Opening for edit from code loads the given record (recordId in modelInitConfigs, not parameters).
//       See: Recipes/Sections/HowToMigrateMiniPage.js
//   [ ] Fields shown only in add mode are hidden on edit (getPrimaryModelMode-driven attribute).
//       See: Recipes/Lifecycle/HowToMigrateNewRecordDetection.js
//   [ ] Users who relied on the hover VIEW mode have an agreed replacement (row action or link).
//       See: Recipes/Sections/HowToMigrateMiniPage.js
//   [ ] Handlers, validators and required rules match the full page where the mini page shares them.
//       See: Recipes/Lifecycle/HowToMigrateValidationConfig.js

// ===== MODULE / CUSTOM CONTROL (Ext control, Module schema -> view element) ==
//
//   [ ] The element's `type` in viewConfigDiff matches @CrtViewElement / registerViewElement exactly (usr. prefix).
//       See: Recipes/UI/HowToMigrateCustomControl.js
//   [ ] The component is listed in @CrtModule({ viewElements }) (remote module) or its Module schema is in SCHEMA_DEPS.
//       See: Recipes/UI/HowToMigrateCustomControl.js
//   [ ] Every page-bound property is a @CrtInput (or in `inputs`) and changes when the bound attribute changes.
//       See: Recipes/UI/HowToMigrateCustomControl.js
//   [ ] No input is named readonly, disabled, hidden, title, id, name or value.
//       See: Recipes/UI/HowToMigrateCustomControl.js
//   [ ] Each output event reaches its usr.* handler on the page with the expected payload.
//       See: Recipes/UI/HowToMigrateCustomControl.js
//   [ ] Styles live inside the element; no global stylesheet targets stock Freedom UI classes.
//       See: Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js
//   [ ] Listeners, observers and timers are released in the element's teardown (ngOnDestroy / disconnectedCallback).
//       See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   [ ] Module-to-module sandbox messages are replaced by usr.* requests on one page or by the server channel.
//       See: Recipes/Messaging/HowToMigrateSandboxMessages.js
//   [ ] A Classic module still hosted on a Freedom page works, and its scope is written down as temporary.
//       See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
//   [ ] After deploy and a hard refresh the new bundle is served (no stale cached build).
//       See: Recipes/UI/HowToMigrateCustomControl.js
