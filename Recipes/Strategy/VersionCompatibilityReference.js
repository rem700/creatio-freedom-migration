// --- Version compatibility reference: which Creatio and devkit version a Freedom UI feature needs ---
// Reference text, no code. Collects every version requirement the recipes in
// this repository depend on: the Creatio 8.0 vs 8.1+ schema shapes, lookup
// behaviour that changed in 8.0.10 and 8.1.1, events reported from 8.1.3, and
// the first @creatio-devkit/common (devkit) version that ships each sdk.*
// service, taken from the package CHANGELOG and the published typings.
// Creatio does not document which devkit version a given Creatio release
// runs; check it on the instance (feature detection, below) instead of
// guessing from version numbers.
//
// API MAP
//   viewModelConfig / modelConfig (8.0)      ->  viewModelConfigDiff / modelConfigDiff (8.1+)
//   sdk.DialogService                        ->  devkit 0.814.0+
//   sdk.MessageChannelService                ->  devkit 0.820.0+
//   sdk.ProcessEngineService                 ->  devkit 0.823.0+
//   sdk.TransactionFactoryService            ->  devkit 0.831.0+
//   registerOnCollectionChangeCallback       ->  devkit 0.832.0+
//   Creatio version <-> devkit version       ->  NOT documented; feature-detect on the instance
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic UI code runs on every 7.x and 8.x instance; a Freedom UI page
//     depends on the platform build AND on the devkit build the platform
//     ships. A recipe line "Applies: Creatio 8.1+ (needs ... 0.831.0+)" means
//     both conditions.
//   - The devkit you install with npm for a remote module is the version you
//     COMPILE against; the page at runtime gets the services of the devkit the
//     instance itself serves. A newer local package does not add services to
//     an older instance.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Code written against newer typings runs on an older instance until it
//   reaches `new sdk.TransactionFactoryService()` (or another missing service)
//   and throws a TypeError ("... is not a constructor") inside the handler;
//   unless the handler catches and reports it, the user sees a button that
//   does nothing. Schema sections of the wrong generation
//   (8.0 objects on 8.1+, or the reverse) are ignored without an error
//   (observed).
//
// See: Recipes/Strategy/SchemaStructureMappingReference.js
// Applies: Creatio 8.0+ and @creatio-devkit/common 0.803.0–0.1000.3 (as checked); Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (CHANGELOG.md of 0.1000.3; published typings of 0.803.0-0.1000.3; publish dates from the npm registry)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://customerfx.com/article/dynamically-filtering-a-lookup-on-a-creatio-freedom-ui-page/ (8.0.10 load-once; 8.1.1 workaround; comments Feb-May 2024)
// Source: https://community.creatio.com/questions/correct-way-unsubscribe-requestcontextevents-crthandleviewmodelinitrequest
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/remote-module/implement-a-remote-module/overview (devkit install/update, no version mapping)

// ===== 1. CREATIO PLATFORM VERSIONS ==========================================
//
//   Version   What changes for migrated code                    Source / status
//   8.0       viewModelConfig { attributes } and modelConfig     Academy 8.1 overview: the
//             { dataSources } are whole OBJECTS.                 8.0 sections were replaced
//   8.1+      viewModelConfigDiff / modelConfigDiff: ARRAYS of   in 8.1. Wrong shape for the
//             merge operations. Every recipe here targets 8.1+.  version: ignored (observed)
//   8.0.10    Lookup filtering on Freedom UI pages arrives; a    CustomerFX article (2023);
//             lookup list requests its data only ONCE, so a      still seen on 8.1.0 and after
//             filter that depends on another field may apply     8.1.x (comments Feb / May
//             to the first open only.                            2024). Fix version unknown.
//   8.0.10    crt.NotificationRequest (toast)                    community-documented only
//   8.1.1     The Object.assign / newFilter.items workaround     CustomerFX author, comment of
//             in a crt.LoadDataRequest lookup filter is not      27 Feb 2024
//             needed: assign the FilterGroup to
//             request.parameters directly.
//   8.1.3     request.$context.events$ "finish-load-model-       community thread; first
//             attributes" event reported from this version.      version UNVERIFIED; fires
//                                                                on 10.1.796 (tools/verify)
//   8.3.2     The same event fires again when a list finishes    community thread; on 10.1.796
//             loading.                                           also for lookup and list
//                                                                loads, several times during
//                                                                record load (tools/verify)
//   ?         getPrimaryModelMode() ("create" / "update";        in no devkit typings and on
//             "init" while the page loads)                       no Academy page; exists on
//                                                                10.1.796 (tools/verify)
//   10.1.796  coreVersion "10.1.796.0". DialogService,           tools/verify on a CRM bundle
//             MessageChannelService, ProcessEngineService,       trial, 2026-10-24
//             TransactionFactoryService, SchemaModalService,
//             FeatureService, RightsService all exist at
//             runtime. Two ports break the page here: a crt.Input
//             without "control" and a validator without a
//             "message" param (see Pitfalls/MigrationPitfalls).
//
//   Recipes: Recipes/Pitfalls/MigrationPitfalls.js,
//   Recipes/Strategy/SchemaStructureMappingReference.js,
//   Recipes/Attributes/HowToMigrateLookupFilter.js,
//   Recipes/Attributes/HowToMigrateDependentLookup.js,
//   Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js,
//   Recipes/Lifecycle/HowToMigrateNewRecordDetection.js

// ===== 2. @creatio-devkit/common: FIRST VERSION PER FEATURE ===================
//
// "CHANGELOG" = stated in CHANGELOG.md of 0.1000.3. "typings" = checked in the
// published .d.ts of 0.803.0, 0.806.0, 0.808.0, 0.810.0 - 0.815.0, 0.820.0,
// 0.822.0, 0.823.0, 0.830.0 - 0.834.0 and 0.1000.3 (first version listed is
// the first CHECKED version that has it). npm publish date in brackets.
//
//   Feature                                   First   Evidence             Recipe
//   HttpClientService, MaskService,           0.803.0 CHANGELOG (first     Data/HowToMigrateServiceHelperCalls
//   FeatureService, RightsService,            [2022-07-22] entry)           Messaging/HowToMigrateFeatureToggles
//   SysSettingsService, SysValuesService,                                  Messaging/HowToMigrateOperationRights
//   CrtViewElement, registerViewElement,                                   Messaging/HowToMigrateCurrentUser
//   Model, FilterGroup, HandlerChainService                                UI/HowToMigrateCustomControl
//   CrtRequestHandler / CrtValidator,         0.804.0 CHANGELOG            UI/HowToMigrateCustomControl
//   CrtInject (remote module handlers)        [2022-09-08]
//   FilterGroup.addSchemaColumnBetween-       0.808.0 CHANGELOG            Data/HowToMigrateFilters
//   FilterWithParameters, CrtConverter        [2023-04-19]
//   SysValues.coreVersion                     0.810.0 typings (absent      (feature detection, below)
//                                             [2023-09-20] in 0.808.0)
//   BaseFilter.toJson()                       0.811.1 CHANGELOG            Attributes/HowToMigrateDependentLookup
//                                             [2024-01-15]
//   ModelInitConfig, ModelDefaultValue,       0.812.0 CHANGELOG (the       Lists/HowToMigrateDetailDefaultValues
//   ModelInPageAction, ViewModelCollection    [2024-02-22] Model* names are
//                                             in older typings; ViewModel-
//                                             Collection typed from 0.813.0)
//   Model.load `options` (loadOptions         0.813.0 CHANGELOG            Data/HowToMigrateEsqQueries
//   deprecated), LicenseService               [2024-05-21]
//   DialogService,                            0.814.0 CHANGELOG +          UI/HowToMigrateDialogs
//   HandleViewModelAttributeChangeRequest     [2024-07-17] typings         Attributes/HowToMigrateAttributeDependencies
//   (type)
//   MessageChannelService, Subscription       0.820.0 CHANGELOG +          Messaging/HowToMigrateServerChannel
//                                             [2024-10-31] typings         Messaging/HowToMigrateSandboxMessages
//   SysValues.freedomUiSchemaVersion          0.820.0 typings (absent
//                                             [2024-10-31] in 0.815.0)
//   ProcessEngineService,                     0.823.0 CHANGELOG +          Messaging/HowToMigrateProcessLaunch
//   SysValues.environmentType                 [2025-04-28] typings
//   TransactionFactoryService,                0.831.0 CHANGELOG +          Data/HowToMigrateBatchQuery
//   Model.*InTransaction                      [2025-10-08] typings
//   ViewModelCollectionChange,                0.832.0 CHANGELOG +          Lists/HowToMigrateDetailPageMessaging
//   registerOnCollectionChangeCallback        [2026-01-05] typings
//   SchemaModalService                        0.832.0 typings only (not    Sections/HowToMigrateMiniPage
//                                             [2026-01-05] in CHANGELOG)
//   UserConsentService, hierarchy load        0.834.0 CHANGELOG
//   options, RemoteFeatureDefinition          [2026-05-22]
//   ThemeService                              0.1000.1 CHANGELOG
//                                             [2026-08-28]
//
//   Requests named by string (crt.ShowDialogRequest, crt.RunBusinessProcessRequest,
//   crt.LoadDataRequest ...) need no devkit at all; their availability is a
//   PLATFORM question. getPrimaryModelMode() is in no devkit version checked.
//
//   Note on numbering: 0.8010.0 (2023-08-01) was published between 0.809.0 and
//   0.810.0; 0.1000.0 (2026-05-12) was published BEFORE 0.834.0 (2026-05-22).
//   Compare versions by the CHANGELOG order, not by string or date.

// ===== 3. CREATIO VERSION <-> DEVKIT VERSION ==================================
//
// No official mapping was found (searched: the npm package page, the package
// README and CHANGELOG, Academy "Implement a remote module" 8.1 and the remote
// module overview, Creatio Community). Academy only says to install or update
// @creatio-devkit/common with npm, without a version. Do not infer the mapping
// from the version numbers. Check on the instance instead:
//
//   1. Feature detection in a page handler (the reliable test - it checks what
//      the page will actually call):
//        typeof sdk.TransactionFactoryService === "function"
//        typeof sdk.ProcessEngineService === "function"
//        typeof sdk.MessageChannelService === "function"
//      Guard optional routes with the same test and fall back: one awaited
//      call per write instead of a transaction, crt.RunBusinessProcessRequest
//      instead of ProcessEngineService.
//   2. Platform version: (await new sdk.SysValuesService().loadSysValues())
//      .coreVersion (typed from devkit 0.810.0), or the version shown in the
//      System Designer / About Creatio window.
//   3. Remote modules: the version in YOUR project's package.json /
//      node_modules/@creatio-devkit/common/package.json is the compile-time
//      version only. The devkit build bundled into the instance exposes no
//      version string in the published API; whether an on-site instance's
//      static client files contain a readable package.json is not documented.
//   4. Run tools/verify/UsrMigrationVerify_FormPage.js on a TEST instance: it
//      logs coreVersion and which of these services exist. Recorded so far:
//      Creatio 10.1.796.0 (CRM bundle trial, 2026-10-24) - coreVersion
//      "10.1.796.0"; DialogService, MessageChannelService,
//      ProcessEngineService, TransactionFactoryService, SchemaModalService,
//      FeatureService, RightsService all present.
//
// Record the result per environment (dev / test / prod can differ after a
// partial update) next to the Applies line of the recipes you rely on.
