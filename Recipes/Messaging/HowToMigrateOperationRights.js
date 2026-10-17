// --- How to migrate RightUtilities.checkCanExecuteOperation to sdk.RightsService ---
// Classic UI asks whether the current user may execute a system operation
// ("Operation permissions", e.g. "UsrCanApproveDiscount") with
// RightUtilities.checkCanExecuteOperation({ operation }, callback, scope) and
// stores the boolean in a virtual attribute that `enabled` / `visible` bind
// to. Freedom UI has a direct, typed equivalent in @creatio-devkit/common:
// `await new sdk.RightsService().getCanExecuteOperation(code)` (one code) and
// `getCanExecuteOperations([codes])` (several, answers in the same order).
//
// API MAP
//   dependency "RightUtilities"               ->  "@creatio-devkit/common" in SCHEMA_DEPS (sdk)
//   RightUtilities.checkCanExecuteOperation({ operation: "UsrX" }, cb, this)
//                                             ->  await new sdk.RightsService().getCanExecuteOperation("UsrX")
//   several checks, several callbacks         ->  const [a, b] = await rights.getCanExecuteOperations(["UsrA", "UsrB"])
//   callback: this.set("UsrCanApprove", result)
//                                             ->  request.$context.UsrCanApprove = result
//   check in onEntityInitialized              ->  check in crt.HandleViewModelInitRequest
//                                                 (does not depend on the record)
//   "enabled": { "bindTo": "UsrCanApprove" }  ->  "disabled": "$UsrCanApprove | crt.InvertBooleanValue"
//   "visible": { "bindTo": "UsrCanApprove" }  ->  "visible": "$UsrCanApprove"
//   server side: DBSecurityEngine.GetCanExecuteOperation   ->  unchanged (keep it)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Callback -> await; the answer still arrives AFTER the page renders.
//     Default the attribute to false so the protected control does not flash
//     enabled before the answer.
//   - getCanExecuteOperations returns booleans by POSITION, not a map by code.
//   - The operation code is a plain string in both generations; an unknown code
//     answers false, indistinguishable from "no permission".
//   - Record-level rights (can this user edit THIS record) are a different
//     question: a data source answers it, not RightsService.
//   - A UI check is not security. Keep the server-side check in the process,
//     web service or entity event listener that does the work.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Porting the call shape - getCanExecuteOperation({ operation: "UsrX" }) -
//   passes an object where the typings expect the code string; what the
//   service answers then is outside the typed contract - do not rely on it. A
//   missing await assigns a Promise to the attribute: it is truthy, so a
//   button bound to `visible` shows for EVERYONE.
//
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: RightsService.getCanExecuteOperation, getCanExecuteOperations)
// Source: https://community.creatio.com/questions/check-permission-operation-client-code

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["RightUtilities"], function(RightUtilities) {

	const OperationApproveDiscount = "UsrCanApproveDiscount";

	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrCanApproveDiscount": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				RightUtilities.checkCanExecuteOperation({ operation: OperationApproveDiscount },
					function(result) {
						if (!this.destroyed) {
							this.set("UsrCanApproveDiscount", result === true);
						}
					}, this);
			},
			onApproveDiscountClick: function() {
				if (!this.get("UsrCanApproveDiscount")) {
					return;
				}
				this.set("UsrIsDiscountApproved", true);
				this.save();
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrApproveDiscountButton",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.ApproveDiscountButtonCaption" },
					"click": { "bindTo": "onApproveDiscountClick" },
					"enabled": { "bindTo": "UsrCanApproveDiscount" }
				},
				"parentName": "LeftContainer",
				"propertyName": "items",
				"index": 5
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const OperationApproveDiscount = "UsrCanApproveDiscount";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrApproveDiscountButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrApproveDiscountButton_caption)#",
					"iconPosition": "only-text",
					"disabled": "$UsrCanApproveDiscount | crt.InvertBooleanValue",
					"clicked": { "request": "usr.ApproveDiscountRequest" }
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// false until the answer arrives: nothing flashes enabled.
					"UsrCanApproveDiscount": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					const rights = new sdk.RightsService();
					// The CODE string, awaited.
					request.$context.UsrCanApproveDiscount =
						(await rights.getCanExecuteOperation(OperationApproveDiscount)) === true;
				}
			},
			{
				request: "usr.ApproveDiscountRequest",
				handler: async (request, next) => {
					// Guard for code paths that bypass the disabled button.
					if (!(await request.$context.UsrCanApproveDiscount)) {
						return next?.handle(request);
					}
					request.$context.PDS_UsrIsDiscountApproved_f2a3b4c = true;
					await request.$context.executeRequest({
						type: "crt.SaveRecordRequest",
						$context: request.$context,
						preventCardClose: true
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
