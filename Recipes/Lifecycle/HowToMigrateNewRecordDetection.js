// --- How to migrate isAddMode / isCopyMode (new record check) to Freedom UI ----
// Classic UI asks the page for its card state: this.isAddMode(),
// this.isCopyMode(), this.isEditMode(), or this.get("CardState") against
// ConfigurationEnums.CardStateV2. Freedom UI pages answer "is this record
// new?" with `await request.$context.getPrimaryModelMode()`, observed to
// return "create" for an unsaved record and "update" for an existing one. The
// method appears in community threads but is not in the @creatio-devkit/common
// typings: treat it and its values as observed, not contractual.
//
// API MAP
//   this.isAddMode()                         ->  await request.$context.getPrimaryModelMode() === "create"
//                                               (values observed)
//   this.isEditMode()                        ->  await request.$context.getPrimaryModelMode() === "update"
//   this.isCopyMode()                        ->  no documented separate value (see below)
//   this.get("CardState") === CardStateV2.ADD ->  same getPrimaryModelMode() check
//   this.get("IsChanged")                    ->  await request.$context.HasUnsavedData
//   "visible": { "bindTo": "isAddMode" }      ->  boolean attribute set in a handler, bound
//                                               as "visible": "$UsrIsNewRecord"
//   openCardInChain({ operation: ADD/EDIT/COPY }) -> crt.OpenPageRequest with
//                                               modelInitConfigs: [{ action: "add" | "edit" | "copy" }]
//                                               (sdk ModelInPageAction, in the typings)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Copy mode: the typings know "copy" only as an action for OPENING a page
//     (ModelInPageAction). What getPrimaryModelMode() returns on a copied record
//     is not documented; test it on your version before relying on it.
//   - The mode is asynchronous, so a binding cannot call it the way Classic
//     bound "visible" to isAddMode. Compute a boolean attribute instead.
//   - In the init handler the mode is known, but the record is not loaded yet.
//     Defaults for a new record belong after the model is loaded.
//     See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   - After the first successful save of a new record the mode becomes
//     "update" (observed). Recompute any "is new" flag after saving.
//   - HasUnsavedData can be true right after load (calculated columns,
//     forward references - reported by the community); it is not a "new
//     record" test.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Porting the anti-pattern "no Id means new" fails exactly as it did in
//   Classic: a new Freedom UI record already holds a generated Id, so
//   `if (!id)` is always false and the "new record" branch never runs.
//   Forgetting `await` compares a Promise with "create": always false, also
//   silently.
//
// Source: https://community.creatio.com/questions/correct-way-unsubscribe-requestcontextevents-crthandleviewmodelinitrequest
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: ModelInPageAction)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ConfigurationEnums"], function(ConfigurationEnums) {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			onEntityInitialized: function() {
				this.callParent(arguments);
				var isNew = this.isAddMode() || this.isCopyMode();
				// Explicit form of the add-mode test.
				var isAdd = this.get("CardState") === ConfigurationEnums.CardStateV2.ADD;
				if (isNew || isAdd) {
					this.setActiveTab("GeneralInfoTab");
				}
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				// Shown only while the record is being created.
				"operation": "merge",
				"name": "UsrNewRecordHint",
				"values": {
					"visible": { "bindTo": "isAddMode" }
				}
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	async function refreshNewRecordFlag($context) {
		const mode = await $context.getPrimaryModelMode();
		$context.UsrIsNewRecord = mode === "create";
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrNewRecordHint",
				"values": {
					// Was { "bindTo": "isAddMode" }: bind to a computed attribute.
					"visible": "$UsrIsNewRecord"
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// false by default, so nothing flashes before the answer.
					"UsrIsNewRecord": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					await refreshNewRecordFlag(request.$context);
				}
			},
			{
				// After the first save the record is no longer new.
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					if (result) {
						await refreshNewRecordFlag(request.$context);
					}
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
