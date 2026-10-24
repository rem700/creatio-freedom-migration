// --- How to migrate Terrasoft.Features.getIsEnabled / getIsFeatureEnabled to sdk.FeatureService ---
// Classic UI checks a feature toggle synchronously:
// Terrasoft.Features.getIsEnabled("UsrMyFeature") anywhere, or
// this.getIsFeatureEnabled("UsrMyFeature") on a view model, against feature
// states loaded with the application. Freedom UI has a typed, ASYNCHRONOUS
// equivalent in @creatio-devkit/common: `await new
// sdk.FeatureService().getFeatureState(code)` and `getFeaturesState([codes])`
// (booleans in the same order). The feature itself (Features page, the Feature
// data, CreateFeature / SafeSetFeatureState in C#) does not change.
//
// API MAP
//   Terrasoft.Features.getIsEnabled("UsrX")   ->  await new sdk.FeatureService().getFeatureState("UsrX")
//   this.getIsFeatureEnabled("UsrX")          ->  same call, inside an async handler
//   several checks                            ->  const [a, b] = await features.getFeaturesState(["UsrA", "UsrB"])
//   this.set("UsrIsNewFlow", enabled) in onEntityInitialized
//                                             ->  request.$context.UsrIsNewFlow = await ... in
//                                                 crt.HandleViewModelInitRequest
//   "visible": { "bindTo": "UsrIsNewFlow" }   ->  "visible": "$UsrIsNewFlow"
//   if (getIsEnabled(...)) inside a click method
//                                             ->  if (await features.getFeatureState(...)) in the handler
//   server: UserConnection.GetIsFeatureEnabled("UsrX")  ->  unchanged
//   no FeatureService (unexpected; present in every devkit checked, 0.803.0 to 0.1000.3)
//                                             ->  a system setting read with sdk.SysSettingsService,
//                                                 or a configuration web service that returns the flag
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Synchronous -> asynchronous. An inline `if (Terrasoft.Features...)` in a
//     converter or validator cannot become an await (converters are
//     synchronous; validators are too unless declared `async: true`, whose
//     contract is undocumented): read the flag once into a declared attribute
//     and bind to it.
//   - getFeaturesState answers by POSITION, not by code.
//   - Whether the answer is cached for the session (Classic needed a browser
//     refresh after switching a feature) is not documented for FeatureService;
//     test before telling users "it applies immediately".
//   - The code is a plain string; an unknown feature reads as disabled
//     (verified on Creatio 10.1.796, tools/verify).
//   - A toggle hides client behaviour only; check it on the server too.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   `if (new sdk.FeatureService().getFeatureState("UsrX"))` without await tests
//   a Promise, which is always truthy: the NEW branch runs for every user,
//   whether the feature is on or off. Assigning that Promise to a `visible`
//   attribute shows the element to everyone in the same way.
//
// Applies: Creatio 8.1+ (FeatureService in every published @creatio-devkit/common, 0.803.0+); Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: FeatureService.getFeatureState, getFeaturesState)
// Source: https://academy.creatio.com/docs/7-18/developer/interface_elements/interface_control_tools/existing_feature
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/hide-functionality-on-a-page/overview (sdk.FeatureService.getFeatureState)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const FeatureNewApproval = "UsrNewApprovalFlow";

	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrIsNewApprovalVisible": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				this.set("UsrIsNewApprovalVisible", this.getIsFeatureEnabled(FeatureNewApproval));
			},
			onApproveClick: function() {
				if (Terrasoft.Features.getIsEnabled(FeatureNewApproval)) {
					this.runNewApproval();
				} else {
					this.runLegacyApproval();
				}
			},
			runNewApproval: function() {},
			runLegacyApproval: function() {}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrApprovalGroup",
				"values": { "visible": { "bindTo": "UsrIsNewApprovalVisible" } }
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const FeatureNewApproval = "UsrNewApprovalFlow";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrApprovalExpansionPanel",
				"values": { "visible": "$UsrIsNewApprovalVisible" }
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsNewApprovalVisible": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					request.$context.UsrIsNewApprovalVisible =
						(await new sdk.FeatureService().getFeatureState(FeatureNewApproval)) === true;
				}
			},
			{
				request: "usr.ApproveRequest",
				handler: async (request, next) => {
					// await: a bare Promise is always truthy.
					const isNewFlow = await new sdk.FeatureService().getFeatureState(FeatureNewApproval);
					await request.$context.executeRequest({
						type: isNewFlow ? "usr.RunNewApprovalRequest" : "usr.RunLegacyApprovalRequest",
						$context: request.$context
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
