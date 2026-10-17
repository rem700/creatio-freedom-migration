// --- How to migrate section actions (getSectionActions, SelectedRows) --------
// Classic UI adds items to a section's Actions menu by overriding
// getSectionActions() in the section schema (callParent, addItem(
// this.getButtonMenuItem({ Caption, Click, Enabled, IsEnabledForSelectedAll }))).
// The handler reads this.get("SelectedRows") in multi-select mode or
// this.get("ActiveRow") otherwise, writes with a BatchQuery and calls
// reloadGridData(). Freedom UI has no actions collection to override: put a
// crt.Button (clickMode "menu") with crt.MenuItem children on the list page
// "<Entity>_ListPage", and let each item send a request. Bulk work over the
// selection goes through the stock requests that accept the selection filter
// chain, or through your own handler that reads "<Grid>_SelectionState".
//
// API MAP
//   getSectionActions() + addItem(getButtonMenuItem({...}))
//                                            ->  crt.Button "clickMode": "menu" + crt.MenuItem
//                                                (propertyName "menuItems") on UsrMyEntity_ListPage
//   "Click": { bindTo: "setSelectedDone" }   ->  "clicked": { "request": "usr.SetSelectedDoneRequest" }
//   "Enabled": { bindTo: "isAnyRowSelected" } ->  no documented selection-to-boolean binding;
//                                                guard the empty selection in the handler
//   this.get("SelectedRows") / ActiveRow     ->  await request.$context.DataTable_SelectionState
//                                                { type: "specific", selected: [...] } |
//                                                { type: "all", unselected: [...] }   (observed shape)
//   run a process per selected record        ->  crt.RunBusinessProcessRequest processRunType
//                                                "ForTheSelectedRecords" + selection filter chain
//   delete / tag selected                    ->  crt.DeleteRecordsRequest / crt.AddTagsInRecordsRequest
//                                                with "filters": "<chain> | crt.SkipIfSelectionEmpty : ..."
//   BatchQuery of UpdateQuery per id         ->  sdk.Model update with addPrimarySchemaColumnInFilter(ids)
//   this.reloadGridData()                    ->  crt.LoadDataRequest { dataSourceName: "PDS",
//                                                    config: { loadType: "reload" } }
//   page getActions() (record page)          ->  the same menu-button pattern on UsrMyPage_FormPage
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - "Select all" in Freedom is a SelectionState of type "all" with an
//     `unselected` list, not a list of ids. Code that reads only `selected`
//     sees an empty array after "select all". Prefer the stock requests,
//     which turn the state into a filter for you.
//   - IsEnabledForSelectedAll has no equivalent; decide in the handler.
//   - The section schema (UsrMyEntitySection) and the list page
//     (UsrMyEntity_ListPage) are unrelated schemas: nothing is inherited.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   EMPTY SELECTION = ALL RECORDS. A selection filter chain without
//   crt.SkipIfSelectionEmpty, or a handler that builds a FilterGroup from an
//   empty id list, produces an EMPTY filter - and an empty filter means every
//   record in the data source. A "mark done" or delete action then runs on the
//   whole table with nothing selected. Classic's Enabled binding protected you;
//   in Freedom guard explicitly.
//
// See: Recipes/Data/HowToMigrateFilters.js
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/section/examples/set-up-handling-for-multiple-records
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/business-processes
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntitySection", [], function() {

	const StatusDone = "b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d01";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			getSectionActions: function() {
				var actionMenuItems = this.callParent(arguments);
				actionMenuItems.addItem(this.getButtonMenuItem({ Type: "Terrasoft.MenuSeparator", Caption: "" }));
				actionMenuItems.addItem(this.getButtonMenuItem({
					"Caption": { bindTo: "Resources.Strings.SetDoneActionCaption" },
					"Click": { bindTo: "setSelectedDone" },
					"Enabled": { bindTo: "isAnyRowSelected" },
					"IsEnabledForSelectedAll": true
				}));
				return actionMenuItems;
			},

			getSelectedIds: function() {
				if (this.get("MultiSelect")) {
					return this.get("SelectedRows") || [];
				}
				var activeRow = this.get("ActiveRow");
				return activeRow ? [activeRow] : [];
			},

			isAnyRowSelected: function() {
				return this.getSelectedIds().length > 0;
			},

			setSelectedDone: function() {
				var ids = this.getSelectedIds();
				if (!ids.length) {
					return;
				}
				var batch = Ext.create("Terrasoft.BatchQuery");
				ids.forEach(function(id) {
					var update = Ext.create("Terrasoft.UpdateQuery", { rootSchemaName: "UsrMyEntity" });
					update.filters.add("IdFilter", Terrasoft.createColumnFilterWithParameter(
						Terrasoft.ComparisonType.EQUAL, "Id", id));
					update.setParameterValue("UsrStatus", StatusDone, Terrasoft.DataValueType.GUID);
					batch.add(update);
				});
				batch.execute(function(response) {
					if (response.success) {
						this.reloadGridData();
					}
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyEntity_ListPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const StatusDone = "b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d01";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrActionsButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrActionsButton_caption)#",
					"icon": "actions-button-icon",
					"iconPosition": "left-icon",
					"clickMode": "menu",
					"menuItems": []
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// Custom bulk action - the handler guards the empty selection.
				"operation": "insert",
				"name": "UsrSetDoneMenuItem",
				"values": {
					"type": "crt.MenuItem",
					"caption": "#ResourceString(UsrSetDoneMenuItem_caption)#",
					"clicked": { "request": "usr.SetSelectedDoneRequest" }
				},
				"parentName": "UsrActionsButton",
				"propertyName": "menuItems",
				"index": 0
			},
			{
				// Stock route: a process per selected record. The chain ENDS with SkipIfSelectionEmpty.
				"operation": "insert",
				"name": "UsrRunProcessMenuItem",
				"values": {
					"type": "crt.MenuItem",
					"caption": "#ResourceString(UsrRunProcessMenuItem_caption)#",
					"clicked": {
						"request": "crt.RunBusinessProcessRequest",
						"params": {
							"processName": "UsrMyProcess",
							"processRunType": "ForTheSelectedRecords",
							"showNotification": true,
							"dataSourceName": "PDS",
							"parameterMappings": { "UsrRecordId": "Id" },
							"filters": "$Items | crt.ToCollectionFilters : 'Items' : $DataTable_SelectionState | crt.SkipIfSelectionEmpty : $DataTable_SelectionState",
							"sorting": "$ItemsSorting",
							"selectionStateAttributeName": "DataTable_SelectionState"
						}
					}
				},
				"parentName": "UsrActionsButton",
				"propertyName": "menuItems",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.SetSelectedDoneRequest",
				handler: async (request, next) => {
					const selection = await request.$context.DataTable_SelectionState;
					// "all" is a different shape (unselected list): refuse rather than guess.
					if (selection?.type !== "specific") {
						return next?.handle(request);
					}
					const ids = selection.selected || [];
					// Empty id list -> empty filter -> EVERY record. Never send it.
					if (!ids.length) {
						return next?.handle(request);
					}
					const filter = new sdk.FilterGroup();
					filter.addPrimarySchemaColumnInFilter(ids);

					const model = await sdk.Model.create("UsrMyEntity");
					const result = await model.update(
						{ UsrStatus: StatusDone },
						[{ type: sdk.ModelParameterType.Filter, value: filter }]);
					if (result?.success) {
						await request.$context.executeRequest({
							type: "crt.LoadDataRequest",
							$context: request.$context,
							config: { loadType: "reload", useLastLoadParameters: true },
							dataSourceName: "PDS"
						});
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
