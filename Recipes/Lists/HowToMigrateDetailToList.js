// --- How to migrate a Classic detail (details + DETAIL diff) to a Freedom list that shows only its own rows ---
// Classic UI places a detail with two coordinated parts on the page: a
// `details` entry (schemaName, entitySchemaName, filter { detailColumn,
// masterColumn }) and a diff insert with itemType Terrasoft.ViewItemType.DETAIL
// whose name equals the details key. The detail itself is a separate schema
// (BaseGridDetailV2) with its own view model. Freedom UI has no detail schema:
// a "list" is a crt.DataGrid element ON the page, fed by a collection attribute
// (viewModelConfigDiff) and a data source (modelConfigDiff), tied to the page
// record by `dependencies`. Add it in the designer and adjust the generated code.
// Symptom this recipe fixes: the list shows every record, the detail shows all
// rows of the whole table instead of the rows of the open record.
//
// API MAP
//   details.UsrMyDetail.schemaName           ->  no separate schema: crt.DataGrid "GridDetail_x"
//   details.UsrMyDetail.entitySchemaName     ->  dataSources.GridDetail_xDS.config.entitySchemaName
//   filter: { detailColumn: "UsrMyEntity", masterColumn: "Id" }
//                                            ->  dependencies: { GridDetail_xDS: [
//                                                    { attributePath: "UsrMyEntity", relationPath: "PDS.Id" }] }
//                                                (shape as the designer generates it - observed)
//   filterMethod / detail getFilters()       ->  collection modelConfig.filterAttributes, or a
//                                                crt.LoadDataRequest handler for GridDetail_xDS
//   diff insert itemType DETAIL, parentName  ->  viewConfigDiff insert type "crt.DataGrid",
//                                                items "$GridDetail_x"
//   detail columns (profile / designer)      ->  "columns" on the grid + one attribute per column
//                                                in viewModelConfig.attributes
//   caption <Key>CaptionOnPage               ->  the ExpansionPanel / label around the grid
//   this.updateDetail({ detail: "UsrMyDetail" })
//                                            ->  crt.LoadDataRequest { dataSourceName: "GridDetail_xDS",
//                                                    config: { loadType: "reload" } }
//   isAddMode() -> detail empty              ->  getPrimaryModelMode() === "create" -> list empty
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The detail schema's methods (addRecord, getFilters, onGridDataLoaded...)
//     have nowhere to go: they become page handlers for crt.* requests.
//   - Placing the same detail schema twice under two keys becomes two grids
//     with two data sources - nothing is shared.
//   - Column data: a column is loaded only when its attribute is declared in
//     the collection's viewModelConfig. See: Recipes/Sections/HowToMigrateGridColumns.js
//   - Removing an inherited detail: Classic removes by the details KEY; in
//     Freedom remove the grid ELEMENT name (and its container) in viewConfigDiff.
//   - The Freedom designer writes `dependencies` when the list is linked to
//     the page record. Lists copied between pages by hand often lose it.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A data source WITHOUT `dependencies` is not related to the page record:
//   the list loads EVERY row of UsrMyDetailEntity for every record you open -
//   the detail shows all rows of the whole table, the list shows every record.
//   No error, the list just looks full. Same when attributePath names a column
//   that is not the link to the master, or the dependency is keyed by the grid
//   name instead of the data source name ("GridDetail_xDS").
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/references/basedetailv2

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		details: /**SCHEMA_DETAILS*/{
			"UsrMyDetail": {
				"schemaName": "UsrMyDetail",
				"entitySchemaName": "UsrMyDetailEntity",
				"filter": {
					"detailColumn": "UsrMyEntity",
					"masterColumn": "Id"
				}
			}
		}/**SCHEMA_DETAILS*/,
		methods: {
			onSaved: function() {
				this.callParent(arguments);
				this.updateDetail({ detail: "UsrMyDetail" });
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				// name === details key
				"operation": "insert",
				"name": "UsrMyDetail",
				"values": {
					"itemType": Terrasoft.ViewItemType.DETAIL,
					"markerValue": "added-detail"
				},
				"parentName": "UsrExtraTab",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	// Column ids are generated by the designer; these are invented placeholders.
	const ColumnNameId = "8d1e2f30-4a5b-4c6d-9e7f-0a1b2c3d4e01";
	const ColumnAmountId = "8d1e2f30-4a5b-4c6d-9e7f-0a1b2c3d4e02";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "GridDetail_k7m2p9q",
				"values": {
					"type": "crt.DataGrid",
					"items": "$GridDetail_k7m2p9q",
					"primaryColumnName": "GridDetail_k7m2p9qDS_Id",
					"visible": true,
					"fitContent": true,
					"columns": [
						{
							"id": ColumnNameId,
							"code": "GridDetail_k7m2p9qDS_UsrName",
							"caption": "#ResourceString(GridDetail_k7m2p9qDS_UsrName)#",
							"dataValueType": 1
						},
						{
							"id": ColumnAmountId,
							"code": "GridDetail_k7m2p9qDS_UsrAmount",
							"caption": "#ResourceString(GridDetail_k7m2p9qDS_UsrAmount)#",
							"dataValueType": 6
						}
					]
				},
				"parentName": "UsrExtraTabContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"GridDetail_k7m2p9q": {
						"isCollection": true,
						"modelConfig": { "path": "GridDetail_k7m2p9qDS" },
						"viewModelConfig": {
							"attributes": {
								"GridDetail_k7m2p9qDS_Id": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.Id" } },
								"GridDetail_k7m2p9qDS_UsrName": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.UsrName" } },
								"GridDetail_k7m2p9qDS_UsrAmount": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.UsrAmount" } }
							}
						}
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[
			{
				// The Classic `filter`: without this block the list shows ALL rows.
				"operation": "merge",
				"path": [],
				"values": {
					"dependencies": {
						"GridDetail_k7m2p9qDS": [
							{ "attributePath": "UsrMyEntity", "relationPath": "PDS.Id" }
						]
					}
				}
			},
			{
				"operation": "merge",
				"path": ["dataSources"],
				"values": {
					"GridDetail_k7m2p9qDS": {
						"type": "crt.EntityDataSource",
						"scope": "viewElement",
						"config": {
							"entitySchemaName": "UsrMyDetailEntity",
							"attributes": {
								"UsrName": { "path": "UsrName" },
								"UsrAmount": { "path": "UsrAmount" }
							}
						}
					}
				}
			}
		]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Was onSaved + updateDetail.
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "GridDetail_k7m2p9qDS"
					});
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
