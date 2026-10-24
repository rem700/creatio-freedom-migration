// Trial migration of the Classic DocumentPageV2 logic that Creatio's own Documents_FormPage
// (CRM bundle, Creatio 10.1) does not carry over: autonumbering on a new record and the
// unique Number check on save. Written only from the recipes; paste over the replacing
// Documents_FormPage the designer creates. TEST INSTANCES ONLY. Logs: [docmig].
define("Documents_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	// ===== Migrated from DocumentPageV2 (Classic) by the creatio-freedom-migration recipes =====
	// 1. onEntityInitialized + getIncrementCode  -> finish-load + SysSettingsService
	//    (Lifecycle/HowToMigrateNewRecordDetection, Lifecycle/HowToMigrateInitAndOnEntityInitialized,
	//     Data/HowToMigrateServiceHelperCalls)
	// 2. asyncValidate + validateUniqueNumber     -> crt.SaveRecordRequest + sdk.Model
	//    (Lifecycle/HowToMigrateAsyncValidate, Data/HowToMigrateEsqQueries)
	// Account-or-Contact and the "filter by Account" rules are already Freedom business rules.
	const MIG = window.UsrDocMigration = window.UsrDocMigration || { log: [] };
	function mlog(text) {
		MIG.log.push(text);
		console.log("[docmig] " + text);
	}

	// Was getIncrementCode: SysSettingsService.GetIncrementValueVsMask with
	// <Entity>LastNumber / <Entity>CodeMask. NOTE: the call increments the setting.
	async function getIncrementCode(entitySchemaName) {
		const response = await new sdk.HttpClientService().post(
			"/rest/SysSettingsService/GetIncrementValueVsMask",
			{ sysSettingName: entitySchemaName + "LastNumber", sysSettingMaskName: entitySchemaName + "CodeMask" });
		mlog("GetIncrementValueVsMask response keys = " + JSON.stringify(Object.keys(response || {})) +
			", body = " + JSON.stringify(response && response.body));
		return response?.body?.GetIncrementValueVsMaskResult;
	}

	// Was validateUniqueNumber (ESQ with Id != current and Number == value).
	async function isNumberUnique(id, number) {
		const model = await sdk.Model.create("Document");
		const filter = new sdk.FilterGroup();
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.NotEqual, "Id", id);
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "Number", number);
		const rows = await model.load({
			attributes: ["Id"],
			parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }],
			options: { pagingConfig: { rowCount: 1, rowsOffset: 0 } }
		});
		return rows.length === 0;
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "remove",
				"name": "RequeueQueueItemButton"
			},
			{
				"operation": "remove",
				"name": "PostponeQueueItemButton"
			},
			{
				"operation": "remove",
				"name": "RelatedDocumentsList",
				"properties": [
					"activeRow",
					"_filterOptions",
					"selectionState",
					"_selectionOptions"
				]
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					const ctx = request.$context;
					let done = false;
					const sub = ctx.events$.subscribe(async (evt) => {
						if (done || evt?.type !== "finish-load-model-attributes") {
							return;
						}
						// Fires several times; act only once the record attributes are loaded.
						if (!evt.payload || !("Number" in evt.payload)) {
							return;
						}
						const mode = await ctx.getPrimaryModelMode();
						if (mode === "init") {
							return;
						}
						done = true;
						const number = await ctx.Number;
						mlog("record loaded: mode = " + JSON.stringify(mode) + ", Number = " + JSON.stringify(number));
						// Was: (isAddMode() && empty Number) || isCopyMode()
						if (mode !== "update" && (!number || mode === "copy")) {
							const code = await getIncrementCode("Document");
							if (code) {
								ctx.Number = code;
								mlog("Number set to " + JSON.stringify(code));
							}
						}
					});
					MIG.sub = sub;
					return result;
				}
			},
			{
				request: "crt.HandleViewModelPauseRequest",
				handler: async (request, next) => {
					// Cleanup belongs in Pause (Destroy does not fire on navigation).
					if (MIG.sub) {
						MIG.sub.unsubscribe();
						MIG.sub = null;
					}
					return next?.handle(request);
				}
			},
			{
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const ctx = request.$context;
					const id = await ctx.Id;
					const number = await ctx.Number;
					// The Classic code checked only a changed Number (and then called
					// back twice when it was unchanged - a bug, not ported).
					if (number && !(await isNumberUnique(id, number))) {
						mlog("save blocked: Number " + JSON.stringify(number) + " is not unique");
						await ctx.executeRequest({
							type: "crt.NotificationRequest",
							$context: ctx,
							message: "The document number must be unique."
						});
						return false;
					}
					const saved = await next?.handle(request);
					mlog("save result = " + JSON.stringify(saved));
					return saved;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
