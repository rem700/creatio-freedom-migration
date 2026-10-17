// --- How to migrate enabled / visible / isRequired bindings to Freedom UI ------
// Classic UI binds a control's "enabled", "visible" and "isRequired" in diff
// to a virtual boolean attribute ({ "bindTo": "X" }) or to a method name, and
// for a dependable required check flips this.columns.X.isRequired and calls
// validateColumn. Freedom UI binds element properties in viewConfigDiff with
// "$Attribute": "visible", "readonly" (inputs), "disabled" (buttons). Required
// is NOT a view property: it is the crt.Required validator on the attribute,
// switched at runtime with enableAttributeValidator / disableAttributeValidator.
//
// API MAP
//   "visible": { "bindTo": "UsrInfoVisible" } ->  "visible": "$UsrInfoVisible"
//   "enabled": { "bindTo": "UsrCanEdit" }      ->  input: "readonly": "$UsrCanEdit | crt.InvertBooleanValue"
//                                                 button: "disabled": "$UsrCanEdit | crt.InvertBooleanValue"
//   "enabled": false (static)                 ->  "readonly": true
//   "visible": { "bindTo": "isAddMode" }       ->  boolean attribute computed in a handler
//   "isRequired": { "bindTo": "UsrOwnerRequired" } -> "validators": { "required": { "type": "crt.Required" } }
//                                                 + enable/disableAttributeValidator(attr, "required")
//   this.columns.UsrOwner.isRequired = x;
//   this.validateColumn("UsrOwner")           ->  request.$context.enableAttributeValidator(
//                                                 "PDS_UsrOwner_a1b2c3d", "required")
//   this.set("UsrInfoVisible", true)          ->  request.$context.UsrInfoVisible = true
//   business rule BINDPARAMETER VISIBLE /     ->  Freedom UI business rule actions "Show elements",
//     ENABLED / REQUIRED                          "Make elements read-only", "Make elements required"
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Freedom UI has "readonly" where Classic had "enabled"; the meaning is
//     inverted. Use crt.InvertBooleanValue or name the attribute after what
//     you bind ("UsrIsOwnerReadonly").
//   - A method name as a binding target ("isAddMode") is not available; a
//     binding reads an attribute, optionally through converters.
//   - Toggle a validator in BOTH directions. Writing only the enable branch
//     leaves the field mandatory after the condition changes back.
//   - Call the toggle from the driving field's change handler (it also fires
//     while the record loads) AND once after init for a field that never
//     changes.
//   - Hiding or locking a field is not security: the column can still be
//     written through the API. Enforce on the server.
//   - Prefer a no-code business rule when the condition is a simple field
//     comparison; use code for queries or arithmetic. Do not implement the same
//     rule in both: they fight.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Keeping the Classic form "enabled": { "bindTo": "X" } or "isRequired" inside
//   viewConfigDiff is not reported as an error; the key has no effect and the
//   field stays editable / optional (observed). Academy: "Creatio applies
//   validators to the attributes rather than visual elements" - a required
//   check belongs on the attribute. A bare "$UsrCanEdit" bound
//   to "readonly" without the inverting converter locks the field exactly when
//   it should be editable.
//
// See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
// See: Recipes/Attributes/HowToMigrateBusinessRules.js
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/examples/set-up-the-requirement-condition-of-a-field
// Source: https://customerfx.com/article/programatically-disabling-controls-on-a-creatio-freedom-ui-page/
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/freedom-ui-business-rules

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	// Invented id of a UsrStatus record.
	const StatusInWork = "3c9f1a72-5b0e-4d8a-9e6f-7a2b1c0d9e31";

	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrActionButtonEnabled": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			},
			"UsrFieldStateHost": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"dependencies": [
					{ "columns": ["UsrStatus"], "methodName": "applyFieldStates" }
				]
			}
		},
		methods: {

			onEntityInitialized: function() {
				this.callParent(arguments);
				this.applyFieldStates();
			},

			applyFieldStates: function() {
				var isInWork = this.get("UsrStatus")?.value === StatusInWork;
				this.columns.UsrOwner.isRequired = isInWork;
				this.validateColumn("UsrOwner");
				this.set("UsrActionButtonEnabled", isInWork);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrActionButton",
				"values": { "enabled": { "bindTo": "UsrActionButtonEnabled" } }
			},
			{
				"operation": "merge",
				"name": "UsrCompany",
				"values": { "enabled": false }
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	// Invented id of a UsrStatus record.
	const StatusInWork = "3c9f1a72-5b0e-4d8a-9e6f-7a2b1c0d9e31";

	async function applyFieldStates($context) {
		const status = await $context.PDS_UsrStatus_b2c3d4e;
		const isInWork = status?.value === StatusInWork;
		// Both branches, always.
		if (isInWork) {
			$context.enableAttributeValidator("PDS_UsrOwner_a1b2c3d", "required");
		} else {
			$context.disableAttributeValidator("PDS_UsrOwner_a1b2c3d", "required");
		}
		$context.UsrActionButtonEnabled = isInWork;
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrActionButton",
				"values": {
					// Was "enabled": { "bindTo": ... } - note the inversion.
					"disabled": "$UsrActionButtonEnabled | crt.InvertBooleanValue"
				}
			},
			{
				"operation": "merge",
				"name": "UsrCompany",
				"values": { "readonly": true }
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrActionButtonEnabled": { "value": false },
					"PDS_UsrOwner_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrOwner" },
						// Declared here, switched on/off at runtime.
						"validators": {
							"required": { "type": "crt.Required" }
						}
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Fires on user edits AND while the record loads.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrStatus_b2c3d4e") {
						await applyFieldStates(request.$context);
					}
					return next?.handle(request);
				}
			},
			{
				// Covers a status that never changes on this open.
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					await applyFieldStates(request.$context);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
