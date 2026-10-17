// --- How to plan a Classic UI to Freedom UI migration -------------------------
// Reference text, no code. A Classic UI (7.x) page cannot be converted into a
// Freedom UI (8.1+) page by a tool: Academy's "move a Classic UI section"
// procedure creates a new Freedom UI app on the existing object and states that
// custom code and business rules must be recreated. Plan the work as a
// redesign of the client layer on top of an unchanged database and backend:
// inventory, classify (mechanical / redesign / keep Classic / move to the
// server), migrate page by page, test both shells.
//
// API MAP
//   Classic page schema (EditViewModelSchema)  ->  new Freedom UI page (AngularSchema), not an edit
//   diff / attributes / methods / messages     ->  viewConfigDiff / viewModelConfigDiff /
//                                                 handlers / requests
//   entity schemas, C# services, processes     ->  unchanged; shared by both UIs
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Synchronous this.get/this.set becomes awaited $context access; every
//     line of logic is touched, not only the API names.
//   - Mixins, sandbox messages between modules, DOM access and onRender have
//     no direct counterpart; they need a redesign.
//   - Freedom UI schema shapes differ between 8.0 and 8.1+; target 8.1+.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Line-by-line translation produces code that loads without errors and
//   does nothing: un-awaited reads, Classic keys in the Freedom view config,
//   8.0 sections on an 8.1 page, handlers that never call next.
//
// See: Recipes/Strategy/ApiMappingReference.js
// See: Recipes/Strategy/SchemaStructureMappingReference.js
// Applies: Creatio 8.1+ (8.0 schema shapes differ); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/app-management/move-a-classic-ui-section-to-freedom-ui
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview

// ===== 1. INVENTORY ==========================================================
//
// For every Classic section, page, detail and mini page in your packages,
// record:
//   - schema name and type (properties.json "SchemaType":
//     EditViewModelSchema = page, GridDetailViewModelSchema = detail,
//     ModuleViewModelSchema = section; a Freedom UI page is "AngularSchema");
//   - which stock schema it replaces (parent), and which package;
//   - methods overridden (init, onEntityInitialized, save, asyncValidate,
//     setValidationConfig, onRender, destroy, getActions, ...);
//   - attributes with dependencies / lookupListConfig;
//   - businessRules entries;
//   - messages (sandbox publish/subscribe) and who is on the other side;
//   - mixins and shared helper modules it requires;
//   - server calls: ESQ, ServiceHelper, ProcessModuleUtilities, ServerChannel;
//   - DOM / CSS dependencies ("css!..." modules, querySelector, observers).
// A grep for "Terrasoft.", "sandbox.", "this.callParent", "document." and
// "css!" over the package's client schemas gives a fast first map.

// ===== 2. CLASSIFY: WHAT MIGRATES MECHANICALLY ===============================
//
// Low risk - a direct counterpart exists and the recipe is a rewrite:
//   - field values: this.get/set -> await $context / assignment
//     See: Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//   - virtual attributes and bindings for visible / enabled / required
//     See: Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//     See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   - change dependencies -> attribute-change handlers
//     See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   - lookup filters, dependent lookups
//     See: Recipes/Attributes/HowToMigrateLookupFilter.js
//     See: Recipes/Attributes/HowToMigrateDependentLookup.js
//   - save interception, column validators, async validation
//     See: Recipes/Lifecycle/HowToMigrateSaveOverride.js
//     See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//     See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//   - ESQ / Insert / Update / Delete -> sdk.Model; ServiceHelper ->
//     sdk.HttpClientService; system settings -> sdk.SysSettingsService
//   - localizable strings (re-created on the new schema)
//     See: Recipes/Attributes/HowToMigrateLocalizableStrings.js

// ===== 3. CLASSIFY: WHAT MUST BE REDESIGNED ==================================
//
// No one-to-one counterpart - decide the target design first:
//   - start-up logic split between init and onEntityInitialized: the Freedom
//     init handler runs before the record loads
//     See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   - destroy() cleanup: pages are paused, not destroyed
//     See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   - onRender / DOM manipulation / CSS modules
//     See: Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js
//   - sandbox messages between page, details and sections: Freedom UI lists
//     live on the same page and share the view model; there is no
//     module-to-module message bus to port
//     See: Recipes/Messaging/HowToMigrateSandboxMessages.js
//   - mixins: no mixin mechanism; shared code becomes a Module schema with
//     plain functions, a custom request handled once, or a remote module
//   - Classic details: become lists (crt.DataGrid) with their own data source
//     See: Recipes/Lists/HowToMigrateDetailToList.js
//   - business rules: recreated in the Freedom UI designer
//     See: Recipes/Attributes/HowToMigrateBusinessRules.js
//   - custom controls (Terrasoft.Component subclasses): rewritten as web
//     components / remote module components
//     See: Recipes/UI/HowToMigrateCustomControl.js
//   - client-side business logic that must hold for every UI and integration
//     (calculations, consistency checks): move it to the server (entity event
//     listener, business process) instead of porting it twice.

// ===== 4. WHEN TO KEEP CLASSIC UI (FOR NOW) ==================================
//
//   - Sections and pages that rely on Classic-only stock modules (for example
//     the filter builder) or heavy DOM customisation, where the Freedom UI
//     redesign costs more than it returns.
//   - Areas used by a small group that can stay in a Classic workplace while
//     others move: Academy suggests you can leave the Classic UI section in
//     workplaces for certain roles.
//   - Integrations that open Classic URLs (Nui/ViewModule.aspx#...) and cannot
//     be changed yet.
// Keeping Classic is a per-section decision; the database and backend are
// shared, so both can run side by side.
// See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js

// ===== 5. ORDER OF WORK ======================================================
//
//   1. Move shared business logic to the server first (it then serves both
//      UIs during the transition).
//   2. Pick one section; create the Freedom UI app on the existing object
//      ("Link to an existing object"), or a Freedom UI page in your package.
//   3. Rebuild layout in the Freedom UI Designer (fields, tabs, lists). Let the
//      designer generate attribute and data source names; code against them.
//   4. Recreate business rules in the designer.
//   5. Port code: attributes and change handlers, then save/validation, then
//      lists and actions, then messaging.
//   6. Re-create localizable strings in every shipped culture.
//   7. Switch which page opens (UI Management > "Form page preferences" or the
//      workplace).
//      See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
//   8. Remove the Classic schema only after both shells have been switched for
//      all user groups.
// Recurring traps of every step: See: Recipes/Pitfalls/MigrationPitfalls.js

// ===== 6. 8.0 VS 8.1+ SCHEMA SHAPES ==========================================
//
//   Creatio 8.0                          Creatio 8.1 and later
//   viewModelConfig: { attributes: {} }  viewModelConfigDiff: [{ operation: "merge",
//                                          path: ["attributes"], values: {} }]
//   modelConfig: { dataSources: {} }     modelConfigDiff: [{ operation: "merge",
//                                          path: ["dataSources"], values: {} }]
//   viewConfigDiff, handlers, converters, validators: same in both.
// Academy says the 8.0 sections were replaced in 8.1; the wrong shape for the
// platform version is ignored without an error (observed). Check
// the marker comments of the generated page (/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/)
// before adding to it. Every recipe here targets 8.1+.

// ===== 7. TESTING ============================================================
//
//   - Open each migrated page in four states: new record, existing record,
//     copy, and after a save without closing. Load-time handler firing and
//     "is new" detection differ between them.
//   - Test with the slowest data: lists and details finishing after the main
//     record re-fire load events.
//   - Navigate away and back: paused pages keep timers and listeners alive.
//   - Test in BOTH shells if Classic sections can still open the new page.
//   - Test each culture: strings are per schema and do not carry over.
//   - Check rights: a hidden or read-only field is not protected on the
//     server; re-test the server-side checks you moved there.
//   - Keep the old Classic behaviour as the oracle: list the cases it handled
//     (including error messages) and replay them on the Freedom UI page.
