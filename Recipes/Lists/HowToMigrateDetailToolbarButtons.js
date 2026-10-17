// --- How to migrate detail toolbar buttons and menu items to a Freedom list ---
// Classic UI customises a detail's command strip inside the DETAIL schema:
// diff inserts with parentName "Detail" / propertyName "tools", the stock
// "AddRecordButton" merged or removed, getToolsVisible() / getAddRecordButtonVisible()
// for visibility, addToolsButtonMenuItems(toolsButtonMenu) for the "..." menu,
// and this.get("MasterRecordId") to know the page record. Freedom UI puts the
// list's buttons on the PAGE: crt.Button elements in the container the designer
// generates above the list, menus as crt.Button with clickMode "menu" and
// crt.MenuItem children, per-row actions in the grid's rowToolbarItems. Each
// button sends a crt.* request or your own usr.* request handled on the page.
//
// API MAP
//   diff insert parentName "Detail", propertyName "tools"
//                                            ->  insert crt.Button into the list's toolbar container
//                                                (designer-generated; read its name off the schema)
//   "click": { "bindTo": "onMyClick" }       ->  "clicked": { "request": "usr.MyRequest", "params": {...} }
//   remove "AddRecordButton"                 ->  remove the generated add button element of the list
//   addRecord() (stock "+")                  ->  crt.CreateRecordRequest { entityName, defaultValues }
//   addToolsButtonMenuItems(toolsButtonMenu) ->  crt.Button "clickMode": "menu" + crt.MenuItem
//                                                inserted with propertyName "menuItems"
//   this.get("MasterRecordId")               ->  await request.$context.PDS_Id_a1b2c3d (same page)
//   getToolsVisible() (collapsed detail)     ->  no hook; bind "visible" to an attribute if needed
//   getAddRecordButtonVisible()              ->  "visible": "$UsrCanAddRows"
//   per-row buttons (ConfigurationGrid activeRowActions)
//                                            ->  grid "rowToolbarItems": [crt.MenuItem ...]
//                                                with "recordId": "$GridDetail_x.GridDetail_xDS_Id"
//   this.reloadGridData()                    ->  crt.LoadDataRequest for "GridDetail_xDS"
//   ProcessModuleUtilities.executeProcess    ->  crt.RunBusinessProcessRequest
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The handler runs in the PAGE context, so the master record and every
//     page field are directly readable. MasterRecordId and GetColumnsValues
//     are not needed. See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//   - Adding ANY item to rowToolbarItems drops the stock row actions (open,
//     copy, delete). Re-declare the ones you keep.
//   - In rowToolbarItems, `itemsAttributeName` has NO "$" and `recordId`
//     HAS one: "$<items>.<primaryColumnName>". The section-list form
//     "$Items.PDS_Id" sends undefined from a list on a form page.
//   - Freedom has no "detail collapsed" state hook; the list sits in an
//     ExpansionPanel whose tools stay visible (observed).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Copying the handler name into "clicked" ("clicked": "onMyClick") or
//   leaving a "click": { bindTo } key renders a button that does nothing.
//   A custom request with no handler is also silently ignored, so test every
//   button. A copied crt.CreateRecordRequest that lost its master link in
//   defaultValues creates rows that never appear in this list.
//   See: Recipes/Lists/HowToMigrateDetailDefaultValues.js
//
// Source: https://customerfx.com/article/adding-row-action-menu-items-to-a-creatio-freedom-ui-list/
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/references/basedetailv2

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyDetail", ["ProcessModuleUtilities"], function(ProcessModuleUtilities) {
	return {
		entitySchemaName: "UsrMyDetailEntity",
		methods: {

			// Item in the detail's "..." menu.
			addToolsButtonMenuItems: function(toolsButtonMenu) {
				this.callParent(arguments);
				toolsButtonMenu.addItem(this.getButtonMenuItem({
					"Caption": { "bindTo": "Resources.Strings.RecalculateMenuCaption" },
					"Click": { "bindTo": "onRecalculateClick" }
				}));
			},

			onRecalculateClick: function() {
				ProcessModuleUtilities.executeProcess({
					sysProcessName: "UsrRecalculateProcess",
					parameters: { RecordId: this.get("MasterRecordId") }
				});
			},

			onRunProcessClick: function() {
				ProcessModuleUtilities.executeProcess({
					sysProcessName: "UsrMyProcess",
					parameters: { RecordId: this.get("MasterRecordId") },
					callback: function() {
						this.reloadGridData();
					},
					scope: this
				});
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrRunProcessButton",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.RunProcessButtonCaption" },
					"click": { "bindTo": "onRunProcessClick" },
					"visible": { "bindTo": "getToolsVisible" },
					"style": Terrasoft.controls.ButtonEnums.style.GREY
				},
				"parentName": "Detail",
				"propertyName": "tools",
				"index": 1
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// Toolbar button; parentName is the list's generated tool container.
				"operation": "insert",
				"name": "UsrRunProcessButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrRunProcessButton_caption)#",
					"iconPosition": "only-text",
					"clicked": {
						"request": "crt.RunBusinessProcessRequest",
						"params": {
							"processName": "UsrMyProcess",
							"processRunType": "ForTheSelectedPage",
							"recordIdProcessParameterName": "RecordId"
						}
					}
				},
				"parentName": "GridDetailToolsContainer_k7m2p9q",
				"propertyName": "items",
				"index": 1
			},
			{
				// The "..." menu: a menu button plus menu items.
				"operation": "insert",
				"name": "UsrListMenuButton",
				"values": {
					"type": "crt.Button",
					"icon": "actions-button-icon",
					"iconPosition": "only-icon",
					"clickMode": "menu",
					"menuItems": []
				},
				"parentName": "GridDetailToolsContainer_k7m2p9q",
				"propertyName": "items",
				"index": 2
			},
			{
				"operation": "insert",
				"name": "UsrRecalculateMenuItem",
				"values": {
					"type": "crt.MenuItem",
					"caption": "#ResourceString(UsrRecalculateMenuItem_caption)#",
					"clicked": { "request": "usr.RecalculateRequest" }
				},
				"parentName": "UsrListMenuButton",
				"propertyName": "menuItems",
				"index": 0
			},
			{
				// Row action. Stock Open/Copy/Delete must be re-declared alongside.
				"operation": "merge",
				"name": "GridDetail_k7m2p9q",
				"values": {
					"rowToolbarItems": [
						{
							"type": "crt.MenuItem",
							"caption": "DataGrid.RowToolbar.Delete",
							"icon": "delete-row-action",
							"clicked": {
								"request": "crt.DeleteRecordRequest",
								"params": {
									"itemsAttributeName": "GridDetail_k7m2p9q",
									"recordId": "$GridDetail_k7m2p9q.GridDetail_k7m2p9qDS_Id"
								}
							}
						},
						{
							"type": "crt.MenuItem",
							"caption": "#ResourceString(UsrMarkDoneRowAction_caption)#",
							"clicked": {
								"request": "usr.MarkRowDoneRequest",
								"params": {
									"itemsAttributeName": "GridDetail_k7m2p9q",
									"recordId": "$GridDetail_k7m2p9q.GridDetail_k7m2p9qDS_Id"
								},
								"useRelativeContext": true
							}
						}
					]
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.RecalculateRequest",
				handler: async (request, next) => {
					// Was this.get("MasterRecordId"): ForTheSelectedPage passes the
					// page record's Id itself.
					await request.$context.executeRequest({
						type: "crt.RunBusinessProcessRequest",
						$context: request.$context,
						processName: "UsrRecalculateProcess",
						// Documented route for the record id. processParameters
						// ({ RecordId: recordId }) is observed, undocumented.
						processRunType: "ForTheSelectedPage",
						recordIdProcessParameterName: "RecordId",
						// Default is true (Academy): false skips the save.
						saveAtProcessStart: true
					});
					return next?.handle(request);
				}
			},
			{
				request: "usr.MarkRowDoneRequest",
				handler: async (request, next) => {
					const rowId = request.recordId;   // from params.recordId
					console.log("mark done", rowId);
					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "GridDetail_k7m2p9qDS"
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
