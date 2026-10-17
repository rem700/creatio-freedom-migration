// --- How to migrate Terrasoft.MaskHelper.ShowBodyMask (body mask) to sdk.MaskService ---
// Classic UI blocks the page while async work runs with
// Terrasoft.MaskHelper.ShowBodyMask() / HideBodyMask() (or the view model
// shortcuts this.showBodyMask() / this.hideBodyMask()), and masks one element
// with Terrasoft.Mask.show({ selector }) / Terrasoft.Mask.hide(maskId). Freedom
// UI's public route is sdk.MaskService from @creatio-devkit/common:
// `await mask.showBodyMask({ delay })` and `await mask.hideBodyMask()`, both
// returning promises. Wrap the work in try/finally and hide in `finally`.
//
// API MAP
//   Terrasoft.MaskHelper.ShowBodyMask()       ->  const mask = new sdk.MaskService();
//   this.showBodyMask()                           await mask.showBodyMask({ delay: 300 });
//   Terrasoft.MaskHelper.HideBodyMask()       ->  await mask.hideBodyMask();
//   this.hideBodyMask()                           (in `finally`)
//   hide in the ESQ / callback on every path  ->  one try { await ... } finally { hide }
//   Terrasoft.Mask.show({ selector }) (one element) ->  no public equivalent: MaskService's
//                                                  element-level showMask/hideMask are excluded
//                                                  from the published typings. Use the body mask.
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - `delay` (ms, MaskSettings.delay) is new: a fast operation never flashes
//     the mask. Classic showed it at once.
//   - The calls are async. Not awaiting showBodyMask is harmless; not awaiting
//     hideBodyMask before opening a dialog can leave the dialog under the mask.
//     Hide first, then ask - the same rule as Classic.
//   - How MaskService behaves with nested show/hide pairs is not documented. Keep
//     one mask per user-visible operation and do not mask inside helpers that
//     are also called under a mask.
//   - The typings also export a crt.SchemaViewMaskRequest (action
//     "addTask" / "removeTask", taskName). Its visual effect is not documented;
//     do not port to it without testing.
//   - A business process started with crt.RunBusinessProcessRequest returns when
//     the process STARTS; masking around it does not wait for the process to end.
//     See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Classic code hid the mask inside the success callback. Ported as
//   `await mask.showBodyMask(); await http.post(...); await mask.hideBodyMask();`
//   any thrown error (a failed service call, a rejected promise) skips the hide:
//   the page stays frozen until reload, and nothing is logged by the mask itself.
//
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: MaskService, MaskSettings, SchemaViewMaskRequest)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ServiceHelper"], function(ServiceHelper) {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			onRecalculateClick: function() {
				Terrasoft.MaskHelper.ShowBodyMask();
				ServiceHelper.callService("UsrMyService", "Recalculate", function(response) {
					// Hide on EVERY path, and before any dialog.
					Terrasoft.MaskHelper.HideBodyMask();
					if (!response || !response.RecalculateResult) {
						this.showInformationDialog(this.get("Resources.Strings.RecalculateFailedMessage"));
						return;
					}
					this.reloadEntity();
				}, { recordId: this.get("Id") }, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.RecalculateRequest",
				handler: async (request, next) => {
					const mask = new sdk.MaskService();
					let isOk = false;
					await mask.showBodyMask({ delay: 300 });
					try {
						const http = new sdk.HttpClientService();
						const response = await http.post("/rest/UsrMyService/Recalculate", {
							recordId: await request.$context.PDS_Id_a1b2c3d
						});
						isOk = Boolean(response?.body?.RecalculateResult);
					} catch (e) {
						isOk = false;
					} finally {
						// Every path, including a throw.
						await mask.hideBodyMask();
					}
					// The dialog comes AFTER the mask is gone.
					if (!isOk) {
						await new sdk.DialogService().open({
							message: await request.$context.Resources.Strings.RecalculateFailedMessage,
							actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
						});
						return next?.handle(request);
					}
					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "PDS"
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
