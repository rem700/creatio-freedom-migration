// --- How to migrate a save() / onSaved override to Freedom UI ------------------
// Classic UI customises saving by overriding methods of the save pipeline:
// save() -> validate() -> asyncValidate() -> saveEntity() ->
// validateSaveEntityResponse() -> onSaved(). Freedom UI has one request,
// crt.SaveRecordRequest. Code before `await next?.handle(request)` runs before
// the save; code after it runs after the save ATTEMPT, and the awaited result
// tells you whether the record was actually written.
//
// API MAP
//   save: function() { ...; callParent }      ->  handler "crt.SaveRecordRequest",
//                                                 code BEFORE await next?.handle(request)
//   onSaved: function() { callParent; ... }    ->  const result = await next?.handle(request);
//                                                 if (result) { ... }
//   validateSaveEntityResponse(response, ...)  ->  the same falsy result (no response object)
//   cancel: return false from validate()       ->  return without calling next (and tell the user)
//   this.save({ isSilent: true }) from code    ->  executeRequest({ type: "crt.SaveRecordRequest",
//                                                 $context, preventCardClose: true })
//   stay on page after save                    ->  request.preventCardClose = true
//   this.updateDetail({ detail: "X" })         ->  crt.LoadDataRequest, loadType "reload",
//                                                 dataSourceName of the list
//   this.showInformationDialog(msg)            ->  crt.NotificationRequest / crt.ShowDialogRequest
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - There is no separate onSaved hook: "after save" is the code after next,
//     and it runs for a FAILED save too unless you check the result.
//   - Values you assign to data-source attributes before next are included in
//     the same save; values assigned after next mark the page dirty again.
//   - The handler also runs for saves triggered by your own executeRequest
//     calls and by other packages' handlers. Keep it idempotent.
//   - Synchronous and asynchronous validation have no separate hooks either.
//     See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//     See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Translating onSaved into "code after next" without checking the result
//   sends notifications, refreshes lists or starts processes for a record that
//   was never written (required field empty, validator failed, no rights).
//   Translating "return false" into a bare `return` with no message leaves the
//   user pressing a Save button that seems to do nothing.
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://customerfx.com/article/saving-a-page-before-some-action-on-a-creatio-freedom-ui-page/

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		details: /**SCHEMA_DETAILS*/{
			"UsrMyDetail": {
				"schemaName": "UsrMyDetail",
				"entitySchemaName": "UsrMyDetailEntity",
				"filter": { "detailColumn": "UsrMyEntity", "masterColumn": "Id" }
			}
		}/**SCHEMA_DETAILS*/,
		methods: {

			// Before save: stamp a value that must be saved with the record.
			save: function() {
				if (!this.get("UsrName")) {
					this.showInformationDialog(this.get("Resources.Strings.NameRequiredMessage"));
					return;
				}
				this.set("UsrLastSubmittedOn", new Date());
				this.callParent(arguments);
				// Code here would run BEFORE the record is written.
			},

			// After a SUCCESSFUL save.
			onSaved: function() {
				this.callParent(arguments);
				this.updateDetail({ detail: "UsrMyDetail" });
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					// Before save (was: save() before callParent).
					const name = await request.$context.PDS_UsrName_a1b2c3d;
					if (!name) {
						// Cancel: do not call next, and say why.
						await request.$context.executeRequest({
							type: "crt.NotificationRequest",
							$context: request.$context,
							message: await request.$context.Resources.Strings.NameRequiredMessage
						});
						return false;
					}
					// Assigned before next: saved in the same operation.
					request.$context.PDS_UsrLastSubmittedOn_b2c3d4e = new Date();

					const result = await next?.handle(request);

					// After save (was: onSaved) - only when it really succeeded.
					if (result) {
						await request.$context.executeRequest({
							type: "crt.LoadDataRequest",
							$context: request.$context,
							config: { loadType: "reload", useLastLoadParameters: true },
							dataSourceName: "GridDetail_UsrMyDetailDS"
						});
					}
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
