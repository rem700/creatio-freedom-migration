// --- How to migrate section modes and command buttons (SeparateModeAddRecordButton) ---
// A Classic UI section renders in two MODES with separate command containers:
// COMBINED (list + open record: "CombinedModeAddRecordButton",
// "CombinedModeActionButtonsCotainer") and SEPARATE (full-screen list:
// "SeparateModeAddRecordButton", "SeparateModeActionButtonsLeftContainer" /
// "...RightContainer"). Replacing the stock Add button means hiding BOTH mode
// variants; a replacing base section (BaseLookupSection) serves every entity
// that inherits it. Freedom UI has no section modes: each app has a list page
// ("<Entity>_ListPage") and a form page. The header of the list page holds the
// stock "AddButton" (crt.CreateRecordRequest { entityName, defaultValues }) and
// the "ActionButtonsContainer" for your own crt.Button elements.
//
// API MAP
//   SeparateModeAddRecordButton + CombinedModeAddRecordButton
//                                            ->  "AddButton" on UsrMyEntity_ListPage (one element)
//   merge "visible": { bindTo: "UsrBaseAddButtonVisible" } on both
//                                            ->  merge "AddButton" { "visible": "$UsrBaseAddButtonVisible" }
//   remove "SeparateModeAddRecordButton"     ->  { "operation": "remove", "name": "AddButton" }
//   insert into "SeparateModeActionButtonsLeftContainer"
//                                            ->  insert crt.Button into "ActionButtonsContainer"
//   "click": { bindTo: "onUsrAddColumnsClick" }
//                                            ->  "clicked": { "request": "usr.MyRequest" }
//   addRecord() / typed add (record type)    ->  AddButton "clicked" crt.CreateRecordRequest with
//                                                "defaultValues": [{ attributeName: "Type", value }]
//   this.reloadGridData()                    ->  crt.LoadDataRequest { dataSourceName: "PDS",
//                                                    config: { loadType: "reload" } }
//   init(): this.entitySchemaName === "X" in a shared base section
//                                            ->  no shared list page; customise each _ListPage itself
//   "<SchemaName>Resources" dependency       ->  "#ResourceString(<key>)#" in viewConfigDiff
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Combined mode (list beside an open record) does not exist; the form
//     page replaces the list. Logic that ran "while a record is open in the
//     section" belongs on the form page.
//   - A replacing schema of a BASE section affected every inheriting section
//     (all lookups for BaseLookupSection). Freedom list pages are per app/
//     entity; there is no one schema to change them all.
//   - Header element names come from the list page template ("AddButton",
//     "ActionButtonsContainer"); confirm them in the parent schema before
//     merging, they are not guaranteed for every template.
//   - Academy's typified-page example merges "AddButton" with "clickMode" and
//     "defaultValues" to create records of one type from the list header.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Merging or removing "SeparateModeAddRecordButton" in a Freedom list page
//   targets an element that does not exist: the operation is ignored and the
//   stock Add button stays. Inserting into
//   "SeparateModeActionButtonsLeftContainer" puts your button nowhere - it never
//   renders, with no error.
//
// See: Recipes/Lists/HowToMigrateDetailDefaultValues.js
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/open-a-page-from-a-custom-handler/examples/open-a-typified-freedom-ui-page
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/docs/7-16/developer/interface_elements/record_page/button

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntitySection", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrBaseAddButtonVisible": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": true
			}
		},
		methods: {
			init: function() {
				this.callParent(arguments);
				this.set("UsrBaseAddButtonVisible", !this.get("UsrIsReadOnlySection"));
			},

			onUsrRecalculateClick: function() {
				this.reloadGridData();
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				// Own button, separate mode only.
				"operation": "insert",
				"name": "UsrRecalculateButton",
				"parentName": "SeparateModeActionButtonsLeftContainer",
				"propertyName": "items",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.UsrRecalculateButtonCaption" },
					"style": Terrasoft.controls.ButtonEnums.style.GREEN,
					"click": { "bindTo": "onUsrRecalculateClick" }
				},
				"index": 0
			},
			{
				"operation": "merge",
				"name": "SeparateModeAddRecordButton",
				"values": { "visible": { "bindTo": "UsrBaseAddButtonVisible" } }
			},
			{
				// Both modes, or the button reappears in combined mode.
				"operation": "merge",
				"name": "CombinedModeAddRecordButton",
				"values": { "visible": { "bindTo": "UsrBaseAddButtonVisible" } }
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyEntity_ListPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// One Add button replaces both mode variants.
				"operation": "merge",
				"name": "AddButton",
				"values": {
					"visible": "$UsrBaseAddButtonVisible"
				}
			},
			{
				"operation": "insert",
				"name": "UsrRecalculateButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrRecalculateButton_caption)#",
					"color": "primary",
					"iconPosition": "only-text",
					"clicked": { "request": "usr.RecalculateRequest" }
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
					"UsrBaseAddButtonVisible": { "value": true }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					request.$context.UsrBaseAddButtonVisible = !(await request.$context.UsrIsReadOnlySection);
					return result;
				}
			},
			{
				request: "usr.RecalculateRequest",
				handler: async (request, next) => {
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
