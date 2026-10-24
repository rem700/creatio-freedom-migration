// --- How to migrate this.get / this.set (field values) to Freedom UI -----------
// Classic UI reads and writes view model columns synchronously with
// this.get("Column") and this.set("Column", value). Freedom UI reads an
// attribute ASYNCHRONOUSLY from the request context - `await
// request.$context.<Attribute>` - and writes it with a plain assignment. The
// attribute name is the generated one bound to the column
// ("PDS_UsrName_a1b2c3d"), not the column name.
//
// API MAP
//   this.get("UsrName")                      ->  await request.$context.PDS_UsrName_a1b2c3d
//   this.set("UsrName", "X")                 ->  request.$context.PDS_UsrName_a1b2c3d = "X"
//   this.get(columnName) (dynamic name)      ->  await request.$context[attributeName]
//   lookup { value, displayValue }           ->  same shape: { value, displayValue } or null
//   this.set("UsrStatus", { value, displayValue }) -> assign the same object
//   this.set("UsrOwner", null)               ->  request.$context.PDS_UsrOwner_c3d4e5f = null
//   this.get("Id")                           ->  await request.$context.Id (or the generated
//                                               PDS_Id_... attribute of the page)
//   this.set("IsChanged", true)              ->  no direct equivalent; assigning a data-source
//                                               attribute marks the page dirty (HasUnsavedData;
//                                               verified on Creatio 10.1.796, tools/verify)
//   this.get("Resources.Strings.X")          ->  await request.$context.Resources.Strings.X
//   value inside a method with `this`        ->  pass request.$context to helper functions
//   detail rows: this.get("Collection")      ->  await request.$context.<ListAttribute>: an ARRAY
//                                               of row contexts; await row.<Column> per cell
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Reads are Promises. Every comparison, arithmetic or `if` on a value
//     needs `await` first.
//   - There is no `this` in a handler. Helpers take $context as a parameter.
//   - Only declared attributes exist. A column that is not bound to an
//     attribute cannot be read from $context.
//     See: Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//   - Writing a lookup with only `value` shows an empty caption, as in Classic.
//   - Assigning to an attribute fires its change handlers immediately.
//   - Assigning a data-source attribute sets HasUnsavedData, and writing the
//     original value back does NOT reset it; writes to virtual attributes do
//     not set it (verified on Creatio 10.1.796, tools/verify). Write only when
//     the value differs.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   `if (request.$context.PDS_UsrIsPaid_b2c3d4e)` without await is ALWAYS
//   true (a Promise is truthy); `=== "Closed"` is always false; `a + b` on two
//   un-awaited numbers concatenates "[object Promise]". Nothing throws.
//   Reading the bare column name (request.$context.UsrName) returns undefined.
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	// Invented id of a UsrStatus record.
	const StatusInWork = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			onApplyClick: function() {
				var name = this.get("UsrName");
				var isPaid = this.get("UsrIsPaid");
				var status = this.get("UsrStatus");
				if (isPaid && status && status.value === StatusInWork) {
					this.set("UsrName", name + " (paid)");
					this.set("UsrStatus", { value: StatusInWork, displayValue: "In work" });
					this.set("UsrOwner", null);
				}
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	// Invented id of a UsrStatus record.
	const StatusInWork = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrApplyButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrApplyButton_caption)#",
					"clicked": { "request": "usr.ApplyRequest" }
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.ApplyRequest",
				handler: async (request, next) => {
					// Every read awaited.
					const name = await request.$context.PDS_UsrName_a1b2c3d;
					const isPaid = await request.$context.PDS_UsrIsPaid_b2c3d4e;
					const status = await request.$context.PDS_UsrStatus_d4e5f6a;
					if (isPaid && status?.value === StatusInWork) {
						// Writes are assignments.
						request.$context.PDS_UsrName_a1b2c3d = name + " (paid)";
						request.$context.PDS_UsrStatus_d4e5f6a = { value: StatusInWork, displayValue: "In work" };
						request.$context.PDS_UsrOwner_c3d4e5f = null;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
