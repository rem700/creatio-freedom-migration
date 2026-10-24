// --- How to migrate attribute declarations (attributes section) to Freedom UI ---
// Classic UI declares view model columns in the `attributes` object: entity
// columns (key = column of entitySchemaName) and virtual columns
// (type VIRTUAL_COLUMN), each with dataValueType, value, caption, dependencies,
// lookupListConfig. Freedom UI declares attributes in viewModelConfigDiff as a
// "merge" into path ["attributes"]. A column of the record is an attribute with
// modelConfig.path "<DataSource>.<Column>", usually named
// "PDS_<Column>_<suffix>" by the designer; a virtual attribute is a plain
// entry with an optional `value`.
//
// API MAP
//   attributes: { ... }                      ->  viewModelConfigDiff: [{ operation: "merge",
//                                                path: ["attributes"], values: { ... } }]
//   "UsrName": {} (entity column)            ->  "PDS_UsrName_a1b2c3d": { "modelConfig":
//                                                { "path": "PDS.UsrName" } }
//   type: VIRTUAL_COLUMN, value: false       ->  "UsrIsFlag": { "value": false }
//   dataValueType: Terrasoft.DataValueType.X ->  no key: the type comes from the entity
//                                                column, or from the value you assign
//   dataValueType CUSTOM_OBJECT              ->  plain attribute: {} (any value)
//   caption: { bindTo: "Resources.Strings.X" } -> the element's "label" / "caption" in
//                                                viewConfigDiff ("$Resources.Strings.X")
//   isRequired: true                         ->  "validators": { "required": { "type": "crt.Required" } }
//   dependencies: [...]                      ->  "change": { "request": "usr.X" } or
//                                                crt.HandleViewModelAttributeChangeRequest
//   lookupListConfig                         ->  "<attr>_List" attribute / crt.LoadDataRequest
//   entitySchemaName: "UsrMyEntity"          ->  modelConfigDiff data source "PDS",
//                                                config.entitySchemaName
//   page parameter (no Classic equivalent)   ->  modelConfig.path "PageParameters.<Name>"
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Names change. Every this.get("UsrName") becomes a read of the generated
//     attribute name. Take the names from the Freedom UI schema the designer
//     produced; do not guess the suffix.
//   - Creatio 8.0 uses `viewModelConfig: { attributes: {...} }` (one object);
//     8.1+ uses the viewModelConfigDiff array (Academy: the 8.0 section was
//     replaced). The wrong shape for the version is ignored without an error
//     (observed).
//   - A Classic entity column was available on the view model even when no
//     control showed it. In Freedom UI a column you read in code must have an
//     attribute with modelConfig.path, or it is not loaded (verified on
//     Creatio 10.1.796, tools/verify: an undeclared column reads undefined).
//   - Stock CRM bundle pages use short attribute names (Owner, Account,
//     JobTitle; list CareerList with data source CareerListDS), not
//     PDS_<Column>_<suffix> (observed on 10.1.796): the generated pattern
//     applies to fields added in the designer. Read the names off the schema.
//   - Every attribute a handler WRITES must be declared; writing an
//     undeclared name updates nothing a binding can see.
//   - Merging into one existing attribute uses path ["attributes", "<Name>"].
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Copying the Classic block as-is (dataValueType, type: VIRTUAL_COLUMN keys
//   inside a Freedom attribute) raises no error; the extra keys are simply not
//   part of the Freedom UI attribute config (verified on Creatio 10.1.796,
//   tools/verify). Declaring an entity column
//   under its bare name ("UsrName": {}) creates an EMPTY virtual attribute:
//   it never loads the column and is never saved.
//
// Applies: Creatio 8.1+ (8.0 uses viewModelConfig / modelConfig objects instead of the *Diff arrays); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {

			// Virtual boolean that drives a control.
			"UsrActionButtonEnabled": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			},

			// Free-form state.
			"UsrCachedTotals": {
				"dataValueType": Terrasoft.DataValueType.CUSTOM_OBJECT,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": null
			},

			// Entity column redeclared to make it required.
			"UsrName": {
				"isRequired": true
			}
		},
		methods: {},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {

					// Virtual boolean: just a value.
					"UsrActionButtonEnabled": { "value": false },

					// Free-form state: no type needed.
					"UsrCachedTotals": {},

					// Entity column: bound through the data source path.
					"PDS_UsrName_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrName" },
						// Was isRequired: true.
						"validators": {
							"required": { "type": "crt.Required" }
						}
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[
			{
				// Was entitySchemaName. A generated form page already has it.
				"operation": "merge",
				"path": ["dataSources"],
				"values": {
					"PDS": {
						"type": "crt.EntityDataSource",
						"config": { "entitySchemaName": "UsrMyEntity" },
						"scope": "page"
					}
				}
			}
		]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
