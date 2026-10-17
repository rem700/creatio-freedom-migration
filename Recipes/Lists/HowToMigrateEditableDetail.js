// --- How to migrate an inline-editable detail (ConfigurationGrid) to Freedom UI: crt.SaveRecordsRequest ---
// Classic UI makes a detail editable in place by replacing its DataGrid with
// Terrasoft.ConfigurationGrid: dependencies ConfigurationGrid /
// ConfigurationGridGenerator / ConfigurationGridUtilitiesV2, an IsEditable
// attribute, the ConfigurationGridUtilitiesV2 mixin and a diff merge on
// "DataGrid" with generator and activeRowActions (save / cancel / card / copy /
// remove). Rows are saved one at a time by the row actions. Freedom UI makes a
// list editable with the grid's `features.editable` flags; edits are saved by
// the stock request crt.SaveRecordsRequest (plural), which you handle on the
// page to validate or change rows before they are written.
//
// API MAP
//   "className": "Terrasoft.ConfigurationGrid" + generator + mixin
//                                            ->  "features": { "editable": { "enable": true,
//                                                    "itemsCreation": true, "floatingEditPanel": false } }
//   IsEditable attribute                     ->  features.editable.enable (or bind it: "$UsrIsListEditable")
//   activeRowActions "save" / row save       ->  crt.SaveRecordsRequest (all edited rows of the list)
//   onActiveRowAction("save") override       ->  handler for crt.SaveRecordsRequest,
//                                                check request.itemsAttributeName
//   onActiveRowAction("remove")              ->  rowToolbarItems crt.DeleteRecordRequest
//   activeRowAction "card"                   ->  rowToolbarItems crt.UpdateRecordRequest
//   row.get("UsrAmount")                     ->  await row.GridDetail_xDS_UsrAmount
//   validateRow / row validation             ->  return without next?.handle to stop the save,
//                                                after telling the user
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic saves ROW BY ROW (row actions, leaving the row). Freedom saves
//     the pending edits of the whole list through one crt.SaveRecordsRequest.
//   - crt.SaveRecordRequest (singular, the page record) and
//     crt.SaveRecordsRequest (plural, list edits) are different requests. A
//     validation hooked on the singular one never sees list edits.
//   - The master page's Save (crt.SaveRecordRequest) is not documented to
//     flush pending list edits; do not rely on it. Test it on your version,
//     and send crt.SaveRecordsRequest for the list explicitly before an action
//     that needs the edited rows in the database.
//   - Rows added with the inline "+" (itemsCreation) do not go through
//     crt.CreateRecordRequest (community report); default their values in the
//     SaveRecordsRequest handler.
//   - One page can host several editable lists; request.itemsAttributeName
//     tells which one is being saved.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Porting the row validation into a crt.SaveRecordRequest handler compiles
//   and never fires for list edits - bad rows are saved. Reading a cell as
//   `row.GridDetail_xDS_UsrAmount` without await yields a Promise: the
//   comparison `< 0` is false and every row passes.
//
// See: Recipes/Lists/HowToMigrateDetailToList.js
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://community.creatio.com/questions/how-access-all-items-detail-list-freedom-ui-page
// Source: https://community.creatio.com/questions/functionhandler-called-when-creating-new-record-detail
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/page-customization-basics/references/list (features.editable: enable, itemsCreation)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyDetail", ["ConfigurationGrid", "ConfigurationGridGenerator",
	"ConfigurationGridUtilitiesV2"], function() {
	return {
		entitySchemaName: "UsrMyDetailEntity",
		attributes: {
			"IsEditable": {
				dataValueType: Terrasoft.DataValueType.BOOLEAN,
				type: Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				value: true
			}
		},
		mixins: {
			ConfigurationGridUtilitiesV2: "Terrasoft.ConfigurationGridUtilitiesV2"
		},
		methods: {
			// Validate the active row before the mixin saves it.
			onActiveRowAction: function(buttonTag, primaryColumnValue) {
				if (buttonTag === "save") {
					var row = this.getGridData().get(primaryColumnValue);
					if ((row.get("UsrAmount") || 0) < 0) {
						this.showInformationDialog(this.get("Resources.Strings.NegativeAmountMessage"));
						return;
					}
				}
				this.mixins.ConfigurationGridUtilitiesV2.onActiveRowAction.call(
					this, buttonTag, primaryColumnValue);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "merge",
				"name": "DataGrid",
				"values": {
					"className": "Terrasoft.ConfigurationGrid",
					"generator": "ConfigurationGridGenerator.generatePartial",
					"generateControlsConfig": { "bindTo": "generateActiveRowControlsConfig" },
					"changeRow": { "bindTo": "changeRow" },
					"unSelectRow": { "bindTo": "unSelectRow" },
					"onGridClick": { "bindTo": "onGridClick" },
					"activeRowActions": [
						{
							"className": "Terrasoft.Button",
							"style": Terrasoft.controls.ButtonEnums.style.TRANSPARENT,
							"tag": "save",
							"markerValue": "save",
							"imageConfig": { "bindTo": "Resources.Images.SaveIcon" }
						},
						{
							"className": "Terrasoft.Button",
							"style": Terrasoft.controls.ButtonEnums.style.TRANSPARENT,
							"tag": "remove",
							"markerValue": "remove",
							"imageConfig": { "bindTo": "Resources.Images.RemoveIcon" }
						}
					],
					"initActiveRowKeyMap": { "bindTo": "initActiveRowKeyMap" },
					"activeRowAction": { "bindTo": "onActiveRowAction" },
					"multiSelect": { "bindTo": "MultiSelect" }
				}
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "GridDetail_m3n5p7r",
				"values": {
					"features": {
						"rows": { "selection": true },
						"editable": {
							"enable": true,
							"itemsCreation": true,
							"floatingEditPanel": false
						}
					}
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Plural: list edits. The singular SaveRecordRequest never sees them.
				request: "crt.SaveRecordsRequest",
				handler: async (request, next) => {
					if (request.itemsAttributeName !== "GridDetail_m3n5p7r") {
						return next?.handle(request);
					}
					const rows = await request.$context.GridDetail_m3n5p7r;
					for (const row of (rows || [])) {
						const amount = Number(await row.GridDetail_m3n5p7rDS_UsrAmount) || 0;
						if (amount < 0) {
							await request.$context.executeRequest({
								type: "crt.ShowDialogRequest",
								$context: request.$context,
								dialogConfig: {
									data: {
										message: await request.$context.Resources.Strings.NegativeAmountMessage,
										actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
									}
								}
							});
							// No next?.handle: the list is not saved.
							return;
						}
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
