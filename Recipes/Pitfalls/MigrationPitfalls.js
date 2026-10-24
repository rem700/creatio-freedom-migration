// --- Migration pitfalls: what breaks SILENTLY when Classic UI code is ported mechanically ---
// A catalog of Classic UI (7.x) -> Freedom UI (8.1+) translations that compile,
// load and raise NO error, yet do the wrong thing. Each entry: the mechanical
// port, what actually happens, the fix, and the recipe that covers it. Read it
// before porting a schema line by line, and again when a ported page "does
// nothing".
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Every entry below is one: 8.0 vs *Diff sections; PDS_ attribute names;
//   _List_DS / DS data source names; "value" vs "control" binding; enabled vs
//   disabled; tabs vs items; 0- vs 1-based layout; missing await (sync ->
//   async); SysValue / Features / RightUtilities as Promises; init vs
//   onEntityInitialized; Destroy not firing on navigation; Id of new records;
//   dependencies firing on load and request.silent deprecated; enum casing
//   (EQUAL -> Equal); void add*() filters; empty filter or empty selection =
//   all records; crt.ShowDialogRequest shape; leaked mask; missing next; sandbox
//   messages; Header.Sender casing; process parameters; custom control config.
//   Two ports are NOT silent on 10.1.796 and stop the page from opening: a
//   validator type without "message" in its params, and a crt.Input without
//   "control" (entries 31 and 32).
//
// Applies: Creatio 8.1+ (entry 1 covers 8.0 schema shapes); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://www.npmjs.com/package/@creatio-devkit/common

// ===== SCHEMA SHAPE ==========================================================
//
// 1. 8.0 SECTIONS IN AN 8.1+ SCHEMA (OR THE REVERSE)
//    viewModelConfig / modelConfig (8.0, whole objects) vs viewModelConfigDiff /
//    modelConfigDiff (8.1+, arrays of merge operations). The wrong form for the
//    page's version is ignored: the attributes and data sources do not exist and
//    their bindings stay empty. Keep the marker comments the page already has
//    (/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/ vs /**SCHEMA_VIEW_MODEL_CONFIG*/).
//    See: Recipes/Strategy/SchemaStructureMappingReference.js
//    See: Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//
// 2. CLASSIC COLUMN NAMES USED AS ATTRIBUTE NAMES
//    this.get("UsrStatus") becomes $context.PDS_UsrStatus_<suffix> - the designer
//    generates the name. `request.$context.UsrStatus` is a different, undeclared
//    attribute: reads give undefined, writes go nowhere. Read the real name off
//    the schema.
//    See: Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//    See: Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//
// 3. WRONG DATA SOURCE NAME
//    A lookup's list is "<attribute>_List_DS"; a list's is "<ListName>DS"; the
//    page's is "PDS". A handler that tests another name (or the Classic column
//    name) never matches: no filter, no reload, no error.
//    See: Recipes/Attributes/HowToMigrateLookupFilter.js
//    See: Recipes/Lists/HowToMigrateDetailToList.js
//
// 4. "value" INSTEAD OF "control" ON AN INPUT
//    On 10.1.796 a crt.Input bound with "value": "$Attr" and no "control" does
//    not render at all: it breaks the whole page (entry 32). Inputs bind with
//    "control"; a control-bound input runs the attribute's validators on every
//    keystroke (verified on Creatio 10.1.796, tools/verify).
//    See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//
// 5. "enabled" PORTED AS-IS
//    Freedom elements have `disabled` (and `readonly` on fields), not `enabled`.
//    An unknown property is ignored: the control stays enabled. Invert with
//    crt.InvertBooleanValue. Binding to a former METHOD name binds to an
//    undeclared attribute - same result.
//    See: Recipes/UI/HowToMigrateDiffButtons.js
//    See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//
// 6. propertyName "tabs" FOR A NEW TAB
//    Freedom tabs are crt.TabContainer items of the crt.TabPanel
//    (propertyName "items"). "tabs" inserts nothing visible. setActiveTab(name)
//    becomes a zero-based INDEX in <Panel>_SelectedTabIndex_Profile.
//    See: Recipes/UI/HowToMigrateTabs.js
//
// 7. LAYOUT COORDINATES COPIED
//    Classic layout is 0-based on 24 columns; Freedom layoutConfig is 1-based
//    and colSpan counts the container's `columns` entries. Copied numbers
//    overlap elements or push them out of the grid.
//    See: Recipes/UI/HowToMigrateTabs.js
//
// ===== ASYNC =================================================================
//
// 8. SYNCHRONOUS READS PORTED WITHOUT await
//    this.get("X") was synchronous; `request.$context.X` is a Promise. Without
//    await, comparisons are always false and a Promise assigned to a boolean
//    attribute is TRUTHY (a `visible` binding then shows for everyone).
//    See: Recipes/Attributes/HowToMigrateFieldValueReadWrite.js
//
// 9. CALLBACK CODE THAT RELIED ON "RUNS LATER"
//    Classic dialogs, ESQ and process starts took callbacks and the code after
//    the call ran immediately. Ported to `await`, that code now waits for the
//    user / server. Move "must happen now" code above the await.
//    See: Recipes/UI/HowToMigrateDialogs.js
//
// 10. GLOBALS THAT BECAME ASYNC SERVICES
//    Terrasoft.SysValue.*, Terrasoft.Features.getIsEnabled,
//    RightUtilities.checkCanExecuteOperation all become awaited sdk services.
//    Not awaited, a feature check or a rights check is a truthy Promise: the
//    new branch runs, the protected button shows, for every user. SysValues keys
//    are camelCase (userContact, not CURRENT_USER_CONTACT).
//    See: Recipes/Messaging/HowToMigrateCurrentUser.js
//    See: Recipes/Messaging/HowToMigrateFeatureToggles.js
//    See: Recipes/Messaging/HowToMigrateOperationRights.js
//
// 11. RESOURCE STRINGS NOT AWAITED
//    `request.$context.Resources.Strings.X` is a Promise: a dialog or toast then
//    reads "[object Promise]".
//    See: Recipes/Attributes/HowToMigrateLocalizableStrings.js
//
// 12. ASYNC WORK IN CONVERTERS OR VALIDATORS
//    Converters are synchronous; validators are too unless declared
//    `async: true`, whose contract is undocumented. A ported validator or
//    converter that awaits a service returns a Promise instead of its result,
//    so the outcome is not what the code says. Load data into an attribute in a handler first; port
//    server-side checks the asyncValidate way.
//    See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//
// ===== LIFECYCLE =============================================================
//
// 13. INIT USED AS onEntityInitialized
//    crt.HandleViewModelInitRequest runs before the record's data is loaded:
//    reads are undefined and values set there can be overwritten by the load.
//    getPrimaryModelMode() still returns "init" there. finish-load-model-
//    attributes fires several times, the first time with only {"Id": true}:
//    code that reacts to the FIRST one sees an empty record. Check the
//    payload for the attributes you need (verified on Creatio 10.1.796,
//    tools/verify).
//    See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//
// 14. CLEANUP IN DESTROY
//    crt.HandleViewModelDestroyRequest does not fire when the user navigates
//    to another section: only Pause does; the close button runs Pause, then
//    Destroy (verified on Creatio 10.1.796, tools/verify). Academy puts
//    cleanup in Pause. Listeners, timers and subscriptions
//    attached in init and released in destroy pile up: each event is handled N
//    times. Attach on Resume, release on Pause.
//    See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//    See: Recipes/Messaging/HowToMigrateServerChannel.js
//
// 15. "NO Id" AS THE NEW-RECORD TEST
//    A new record already holds a generated Id in both generations (at init
//    on 10.1.796 - verified, tools/verify), so
//    `if (!Id)` never fires. Use getPrimaryModelMode() === "create", and save
//    with crt.SaveRecordRequest (preventCardClose) before acting on the record.
//    Read the mode after load: it is "init" during load.
//    See: Recipes/Lifecycle/HowToMigrateNewRecordDetection.js
//
// 16. DEPENDENCY HANDLERS THAT FIRE DURING LOAD
//    attributes[...].dependencies -> crt.HandleViewModelAttributeChangeRequest,
//    which also fires while the record LOADS. A handler that clears dependent
//    fields wipes stored data on every open. request.silent still marks the
//    load but is @deprecated in the typings: compare value / oldValue.
//    See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//
// 17. save() OVERRIDE PORTED AS A HANDLER THAT IGNORES THE RESULT
//    crt.SaveRecordRequest resolves FALSY when the save failed (validation,
//    rights). Code after it that assumes success acts on unsaved data.
//    See: Recipes/Lifecycle/HowToMigrateSaveOverride.js
//
// ===== FILTERS AND DATA ======================================================
//
// 18. ENUM CASING
//    Terrasoft.ComparisonType.EQUAL -> sdk.ComparisonType.Equal,
//    Terrasoft.LogicalOperatorType.OR -> sdk.LogicalOperatorType.Or. A
//    SCREAMING_CASE member is undefined and the filter degrades silently.
//    See: Recipes/Data/HowToMigrateFilters.js
//
// 19. CHAINED add*() ON sdk.FilterGroup
//    The add* methods return void. `value: new sdk.FilterGroup().addSchema...()`
//    passes undefined = no filter = every row.
//    See: Recipes/Data/HowToMigrateFilters.js
//
// 20. EMPTY FILTER GROUP = EVERY ROW
//    As in Classic, an empty group means "no filter". An Or group built over an
//    empty id list matches the whole table; for update/delete that is a bulk
//    write. An empty group returned the same rows as no filter on a load
//    (verified on Creatio 10.1.796, tools/verify; writes not tested).
//    See: Recipes/Data/HowToMigrateInsertUpdateDelete.js
//
// 21. EMPTY SELECTION = ALL RECORDS
//    A selection action built with crt.ToCollectionFilters but without
//    crt.SkipIfSelectionEmpty turns "nothing selected" into "every record"
//    (export, tag, delete, process for the selected records).
//    See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//
// 22. DEPENDENT LOOKUP LOADED ONCE
//    Since 8.0.10 a lookup list requests its data only once: a filter that
//    depends on another field may apply to the first open only. Reported still
//    present after 8.1.x (May 2024, CustomerFX article comments). 8.1.1 removed
//    the Object.assign / newFilter.items workaround. Prefer filterAttributes
//    with loadOnChange and test on your version.
//    See: Recipes/Attributes/HowToMigrateDependentLookup.js
//    See: Recipes/Attributes/HowToMigrateLookupFilter.js
//
// 23. A LIST NOT BOUND TO THE MASTER RECORD
//    A Classic detail had its master filter (detailColumn / masterColumn). A
//    Freedom list data source without the master-record dependency loads the
//    WHOLE table on every record.
//    See: Recipes/Lists/HowToMigrateDetailToList.js
//
// ===== REQUESTS, DIALOGS, MESSAGES ==========================================
//
// 24. crt.ShowDialogRequest WITH THE SERVICE SHAPE
//    The request nests the config: dialogConfig.data.message / .actions.
//    message/actions flat on the request open an EMPTY dialog. The result is the
//    clicked action's `key` (case-sensitive), not a MessageBoxButtons code.
//    See: Recipes/UI/HowToMigrateDialogs.js
//
// 25. MASK HIDDEN ONLY ON SUCCESS
//    sdk.MaskService.hideBodyMask after an await that throws is skipped: the
//    page stays frozen. Hide in `finally`, before any dialog.
//    See: Recipes/UI/HowToMigrateBodyMask.js
//
// 26. A HANDLER THAT DOES NOT CALL next
//    Extending a stock request without `return next?.handle(request)` CANCELS
//    the stock behaviour (save, close, load). A custom request with no handler
//    at all does nothing. Two packages handling the same request name both run.
//    See: Recipes/UI/HowToMigrateDiffButtons.js
//
// 27. SANDBOX MESSAGE PORTED AS A REQUEST TO ANOTHER PAGE
//    A request runs through the chain of the $context you pass; page B's handler
//    never sees a request page A dispatches with its own $context. The caller
//    gets undefined and treats it as "no answer". Lists on the same page need no
//    message at all.
//    See: Recipes/Messaging/HowToMigrateSandboxMessages.js
//    See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//
// 28. SERVER MESSAGE FIELDS COPIED
//    message.Header.Sender -> event.header.sender (lower case), and
//    sdk.MessageChannelService.subscribe(sender, ...) already filters by sender.
//    A copied Header check reads undefined and drops every message. Store the
//    RESOLVED Subscription, not the promise.
//    See: Recipes/Messaging/HowToMigrateServerChannel.js
//
// 29. PROCESS PARAMETERS PORTED BY NAME
//    executeProcess `parameters` -> recordIdProcessParameterName /
//    parameterMappings (documented) on crt.RunBusinessProcessRequest;
//    processParameters is observed, undocumented. Codes are case-sensitive and
//    a wrong one is ignored (observed); lookups go as raw guids.
//    saveAtProcessStart defaults to true (Academy). "Started" is not "finished": only
//    sdk.ProcessEngineService.executeProcessByName returns outputs.
//    See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//
// 30. CUSTOM CONTROL CONFIG COPIED
//    controlConfig.className is ignored; a view element `type` that does not
//    match the registration renders an empty tag; a property not declared as
//    @CrtInput / in registerViewElement `inputs` is never set.
//    See: Recipes/UI/HowToMigrateCustomControl.js
//
// ===== PAGE DOES NOT OPEN (observed on 10.1.796) ============================
//
// 31. VALIDATOR WITHOUT A "message" PARAM
//    The platform reads config.message for a custom validator. When the
//    validator type's "params" does not declare { "name": "message" }, it
//    throws "Property message is not defined in validator params config" and
//    the page never opens (observed on 10.1.796, tools/verify). Always
//    declare "message" in params.
//    See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//
// 32. crt.Input WITHOUT "control"
//    Platform code in crtOnViewModelInit runs control.replace("$", "") for
//    every crt.Input. One bound with "value" and no "control" throws a
//    TypeError and the page stays behind the loading mask (observed on
//    10.1.796, tools/verify). Every crt.Input needs "control".
//    See: Recipes/Lifecycle/HowToMigrateValidationConfig.js

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrAmountInput",
				"values": {
					// 4: control, not value.
					"control": "$PDS_UsrAmount_a1b2c3d",
					// 5: disabled, inverted - never "enabled".
					"disabled": "$UsrCanEditAmount | crt.InvertBooleanValue"
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		// 1: the 8.1+ Diff form.
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrCanEditAmount": { "value": false },
					// 16: set once the record finished loading
					// (see Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js).
					"UsrIsRecordLoaded": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					// 13 + 16: one-shot "loaded" flag. The event fires several
					// times (first payload {"Id": true} only): wait for the
					// payload that carries the attribute the handler reads.
					request.$context.events$.subscribe(async (evt) => {
						if (evt?.type === "finish-load-model-attributes" &&
							evt?.payload?.PDS_UsrStatus_b2c3d4e &&
							!(await request.$context.UsrIsRecordLoaded)) {
							request.$context.UsrIsRecordLoaded = true;
						}
					});
					// 10: awaited service, strict boolean.
					request.$context.UsrCanEditAmount =
						(await new sdk.RightsService().getCanExecuteOperation("UsrCanEditAmount")) === true;
				}
			},
			{
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					// 2 + 16: generated name; only a USER change after load clears the dependant.
					if (request.attributeName === "PDS_UsrStatus_b2c3d4e" &&
						(await request.$context.UsrIsRecordLoaded) &&
						request.value?.value !== request.oldValue?.value) {
						request.$context.PDS_UsrAmount_a1b2c3d = null;
					}
					return next?.handle(request);
				}
			},
			{
				request: "crt.LoadDataRequest",
				handler: async (request, next) => {
					// 3: exact data source name.
					if (request.dataSourceName === "PDS_UsrRelatedEntity_c3d4e5f_List_DS") {
						const ids = (await request.$context.UsrAllowedIds) || [];
						// 20: an IN filter with zero values is not an empty group, and
					// what it returns is unverified, so do not send one. Here an
					// empty list means "no restriction"; decide that explicitly.
						if (ids.length) {
							const filter = new sdk.FilterGroup();
							// 18 + 19: Word casing, build first, pass the variable.
							filter.addSchemaColumnInFilterWithParameters(
								sdk.ComparisonType.Equal, "Id", ids);
							request.parameters.push({ type: "filter", value: filter });
						}
					}
					// 26: always continue the stock chain.
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
