// --- API mapping reference: Classic UI API to Freedom UI equivalent -----------
// Reference text: one cheat-sheet row per Classic UI (7.x) client API, with the
// Freedom UI (8.1+) equivalent and the recipe that shows the conversion
// side by side. Rows marked "no equivalent" name the closest working route.
// Freedom UI services come from "@creatio-devkit/common" (sdk in SCHEMA_DEPS);
// crt.* requests are dispatched with request.$context.executeRequest({ type,
// $context, ... }) or named in a view element's "clicked".
//
// API MAP
//   this.get / this.set           ->  await request.$context.X / assignment
//   Terrasoft.EntitySchemaQuery   ->  sdk.Model
//   ServiceHelper.callService     ->  sdk.HttpClientService
//   sandbox.publish / subscribe   ->  custom requests (usr.*) / sdk.MessageChannelService
//   (full table below)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Almost every Classic API is synchronous or callback-based; every Freedom
//     UI counterpart is a Promise. The surrounding code changes shape.
//   - Rows marked "no equivalent" need a redesign, not a rename.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Renaming the API but keeping the Classic control flow (callbacks, missing
//   await, `this`) yields code that runs without errors and acts on Promises.
//
// See: Recipes/Strategy/SchemaStructureMappingReference.js
// Source: https://www.npmjs.com/package/@creatio-devkit/common
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/

// ===== VIEW MODEL: VALUES, ATTRIBUTES, BINDINGS ==============================
//
//   Classic UI                               Freedom UI                                   Recipe
//   this.get("UsrName")                      await request.$context.PDS_UsrName_a1b2c3d   Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//   this.set("UsrName", v)                   request.$context.PDS_UsrName_a1b2c3d = v     Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//   attributes: { X: { dataValueType,        viewModelConfigDiff merge ["attributes"]     Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//     type: VIRTUAL_COLUMN, value } }
//   attributes.X.dependencies                "change" key / HandleViewModelAttributeChangeRequest  Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   this.on("change:X", fn, this)            crt.HandleViewModelAttributeChangeRequest    Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   this.get("IsEntityInitialized")          "finish-load-model-attributes" flag (8.1.3+, observed) Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   "enabled"/"visible": { bindTo: "X" }     "readonly"/"disabled"/"visible": "$X"        Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   isRequired / columns.X.isRequired        crt.Required + enable/disableAttributeValidator  Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   lookupListConfig.filter                  crt.LoadDataRequest on "<attr>_List_DS"      Recipes/Attributes/HowToMigrateLookupFilter.js
//   businessRules FILTRATION / dependent     filterAttributes on "<attr>_List"            Recipes/Attributes/HowToMigrateDependentLookup.js
//   businessRules BINDPARAMETER              Freedom UI business rules (designer)         Recipes/Attributes/HowToMigrateBusinessRules.js
//   this.get("Resources.Strings.X")          await request.$context.Resources.Strings.X   Recipes/Attributes/HowToMigrateLocalizableStrings.js
//   { bindTo: "Resources.Strings.X" }        "#ResourceString(X)#" / "$Resources.Strings.X"  Recipes/Attributes/HowToMigrateLocalizableStrings.js
//   method bound to compute a caption        converters: "$X | usr.MyConverter"           Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js

// ===== PAGE LIFECYCLE ========================================================
//
//   init()                                   crt.HandleViewModelInitRequest               Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   onEntityInitialized()                    events$ "finish-load-model-attributes"       Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   this.callParent(arguments)               await next?.handle(request)                  Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   save() / onSaved()                       crt.SaveRecordRequest (before/after next)    Recipes/Lifecycle/HowToMigrateSaveOverride.js
//   this.save({ isSilent: true })            crt.SaveRecordRequest, preventCardClose      Recipes/Lifecycle/HowToMigrateSaveOverride.js
//   validate()                               crt.SaveRecordRequest, return without next   Recipes/Lifecycle/HowToMigrateSaveOverride.js
//   asyncValidate(callback, scope)           crt.SaveRecordRequest + awaited checks       Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//   Terrasoft.chain(...)                     sequential await                             Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//   setValidationConfig / addColumnValidator validators section + attribute "validators"  Recipes/Lifecycle/HowToMigrateValidationConfig.js
//   onRender() / document.querySelector      no equivalent: bindings, converters,         Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js
//                                            custom view element
//   destroy()                                crt.HandleViewModelPauseRequest              Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   isAddMode() / isCopyMode() / CardState   await $context.getPrimaryModelMode()         Recipes/Lifecycle/HowToMigrateNewRecordDetection.js
//   this.get("IsChanged")                    await request.$context.HasUnsavedData        Recipes/Lifecycle/HowToMigrateNewRecordDetection.js

// ===== DATA ==================================================================
//
//   Ext.create("Terrasoft.EntitySchemaQuery")  await sdk.Model.create("X"); model.load()  Recipes/Data/HowToMigrateEsqQueries.js
//   esq.getEntity / getEntityCollection      model.load({ attributes, parameters })       Recipes/Data/HowToMigrateEsqQueries.js
//   Terrasoft.createFilterGroup() etc.       new sdk.FilterGroup(); addSchemaColumn...    Recipes/Data/HowToMigrateFilters.js
//   Terrasoft.InsertQuery / UpdateQuery /    model.insert / update / delete               Recipes/Data/HowToMigrateInsertUpdateDelete.js
//     DeleteQuery
//   Terrasoft.BatchQuery                     sdk.TransactionFactoryService                Recipes/Data/HowToMigrateBatchQuery.js
//   ServiceHelper.callService                sdk.HttpClientService().post(url, body)      Recipes/Data/HowToMigrateServiceHelperCalls.js
//   Terrasoft.AjaxProvider.request           sdk.HttpClientService                        Recipes/Data/HowToMigrateServiceHelperCalls.js
//   Terrasoft.SysSettings.querySysSettingsItem  sdk.SysSettingsService().getByCode       Recipes/Data/HowToMigrateSysSettings.js
//   Terrasoft.SysSettings.postSysSettingsValues sdk.SysSettingsService().update          Recipes/Data/HowToMigrateSysSettings.js

// ===== DETAILS AND LISTS =====================================================
//
//   details: { X: { schemaName, filter } }   crt.DataGrid + data source "dependencies"    Recipes/Lists/HowToMigrateDetailToList.js
//   this.updateDetail({ detail: "X" })       crt.LoadDataRequest loadType "reload"        Recipes/Lists/HowToMigrateDetailToList.js
//   detail toolbar / addToolsButtonMenuItems crt.Button + crt.MenuItem in the list        Recipes/Lists/HowToMigrateDetailToolbarButtons.js
//   LookupMultiAddMixin                      crt.OpenLookupPageRequest multiple + insert  Recipes/Lists/HowToMigrateMultiSelectAdd.js
//   ConfigurationGrid (editable detail)      features.editable + crt.SaveRecordsRequest  Recipes/Lists/HowToMigrateEditableDetail.js
//   details.X.defaultValues                  defaultValues on the add request             Recipes/Lists/HowToMigrateDetailDefaultValues.js
//   FileDetailV2                             crt.FileList / crt.UploadFileRequest         Recipes/Lists/HowToMigrateFileDetail.js
//   GetColumnsValues / UpdateCardProperty    same view model: read/assign $context        Recipes/Lists/HowToMigrateDetailPageMessaging.js

// ===== SECTIONS ==============================================================
//
//   getSectionActions()                      crt.Button "clickMode": "menu" + crt.MenuItem  Recipes/Sections/HowToMigrateSectionActions.js
//   SelectedRows / ActiveRow                 DataTable_SelectionState (observed shape)    Recipes/Sections/HowToMigrateSectionActions.js
//   fixed filters / section filters          list page filter attributes                  Recipes/Sections/HowToMigrateSectionFilters.js
//   grid columns (profile / getGridColumns)  crt.DataGrid "columns"                       Recipes/Sections/HowToMigrateGridColumns.js
//   mini page (MiniPage schema)              Freedom UI mini page / crt.OpenPageRequest   Recipes/Sections/HowToMigrateMiniPage.js
//   section modes, separate/combined view    list page layout                             Recipes/Sections/HowToMigrateSectionModesAndButtons.js

// ===== UI ELEMENTS AND DIALOGS ===============================================
//
//   diff insert itemType BUTTON, "click"     crt.Button, "clicked": { request }           Recipes/UI/HowToMigrateDiffButtons.js
//   tabs / this.setActiveTab("X")            crt.TabContainer; Tabs_SelectedTabIndex_Profile  Recipes/UI/HowToMigrateTabs.js
//   Terrasoft.showConfirmation / showInformationDialog
//                                            crt.ShowDialogRequest / sdk.DialogService     Recipes/UI/HowToMigrateDialogs.js
//   this.showInformationDialog (toast-like)  crt.NotificationRequest                      Recipes/UI/HowToMigrateDialogs.js
//   Terrasoft.MaskHelper.ShowBodyMask        sdk.MaskService().showBodyMask()             Recipes/UI/HowToMigrateBodyMask.js
//   Ext.define custom control                remote module @CrtViewElement /              Recipes/UI/HowToMigrateCustomControl.js
//                                            sdk.registerViewElement
//   "css!UsrMyCSS" module                    styles inside a custom element; no page CSS  Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js

// ===== MESSAGING, PROCESSES, USER, RIGHTS, FEATURES ==========================
//
//   messages + sandbox.publish/subscribe     usr.* request / sdk.MessageChannelService    Recipes/Messaging/HowToMigrateSandboxMessages.js
//   Terrasoft.ServerChannel.on / un          sdk.MessageChannelService().subscribe        Recipes/Messaging/HowToMigrateServerChannel.js
//   ProcessModuleUtilities.executeProcess    crt.RunBusinessProcessRequest /              Recipes/Messaging/HowToMigrateProcessLaunch.js
//                                            sdk.ProcessEngineService().executeProcessByName
//   Terrasoft.SysValue.CURRENT_USER_CONTACT  sdk.SysValuesService().loadSysValues()       Recipes/Messaging/HowToMigrateCurrentUser.js
//   RightUtilities.checkCanExecuteOperation  sdk.RightsService().getCanExecuteOperation   Recipes/Messaging/HowToMigrateOperationRights.js
//   Terrasoft.Features.getIsEnabled          sdk.FeatureService().getFeatureState         Recipes/Messaging/HowToMigrateFeatureToggles.js
//   openCardInChain({ schemaName })          crt.OpenPageRequest / crt.UpdateRecordRequest  Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js

// ===== SCHEMA LEVEL ==========================================================
//
//   mixins                                   no equivalent: Module schema / usr.* request /  Recipes/Strategy/SchemaStructureMappingReference.js
//                                            remote module handler
//   replacing a Classic page schema          new Freedom UI page + "Form page preferences"   Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
//   Classic module in a Freedom page         custom view element hosting the module       Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
//   common traps across all of the above                                                  Recipes/Pitfalls/MigrationPitfalls.js
