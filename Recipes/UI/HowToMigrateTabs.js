// --- How to migrate tabs (diff "tabs", setActiveTab) to crt.TabPanel / crt.TabContainer ---
// Classic UI inserts a tab into the stock "Tabs" panel with propertyName
// "tabs", then a CONTROL_GROUP (itemType 15) and a GRID_LAYOUT (itemType 0)
// inside it, and switches tabs from code with this.setActiveTab("<TabName>").
// Freedom UI's panel is a crt.TabPanel (stock name "Tabs" on the form page
// template); each tab is a crt.TabContainer inserted with propertyName "items",
// and fields go into a crt.GridContainer inside the tab. There is NO
// setActiveTab method: the selected tab is a zero-based index held in an
// attribute named "<TabPanelName>_SelectedTabIndex_Profile" (community-reported).
//
// API MAP
//   parentName "Tabs", propertyName "tabs"    ->  parentName "Tabs", propertyName "items",
//                                                  "type": "crt.TabContainer"
//   tab "caption": { "bindTo": "Resources.Strings.X" } ->  "caption": "#ResourceString(X)#"
//   itemType 15 (CONTROL_GROUP) + 0 (GRID_LAYOUT) ->  "type": "crt.GridContainer" (one level);
//                                                  "crt.ExpansionPanel" if the group was collapsible
//   "layout": { column: 0, row: 0, colSpan: 12 } ->  "layoutConfig": { column: 1, row: 1, colSpan: 1 }
//                                                  (1-based; colSpan counts grid COLUMNS, not 24ths)
//   this.setActiveTab("UsrExtraTab")          ->  request.$context.Tabs_SelectedTabIndex_Profile = 1
//                                                  (index of the tab, not its name)
//   this.get("ActiveTabName")                 ->  await request.$context.Tabs_SelectedTabIndex_Profile
//   activeTabChange(activeTab)                ->  no documented hook; reacting to a change of
//                                                  the _Profile attribute is unverified
//   "operation": "move" on a tab               ->  "operation": "move" with "index" in "items"
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Tabs are addressed by POSITION, not name. Inserting or hiding a tab
//     shifts every index after it; derive the index from your own constant list
//     and re-check it after any designer change.
//   - "_Profile" means the index is saved to the user profile: by default the
//     page reopens on the last tab the user chose. The system setting /
//     feature DisableSaveToProfileSelectedTabIndex was suggested to stop it;
//     one user reported it had no effect on Freedom pages.
//   - Setting the index inside crt.HandleViewModelInitRequest switched the tab
//     but logged a console error (community report, 8.x), and the record's
//     columns are not loaded there yet anyway. Decide from the change handler
//     of the column the choice depends on (it also fires while the record
//     loads), once, guarded by a declared one-shot attribute.
//   - The Freedom grid has as many columns as entries in `columns`; a Classic
//     colSpan 12 of 24 becomes colSpan 1 of a 2-column container.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   propertyName "tabs" on Freedom inserts nothing visible and raises no error.
//   Assigning a tab NAME ("UsrExtraTab") to the _SelectedTabIndex_Profile
//   attribute does not switch the tab. A wrong panel name in the attribute
//   ("TabPanel_Profile") just creates a new, unused attribute.
//
// Source: https://community.creatio.com/node/37945
// Source: https://community.creatio.com/node/40873
// Source: https://community.creatio.com/questions/setting-default-tab-page
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const UsrMyEntityTypeArrival = "8b2f6a3e-51c4-4d7a-9e0b-2c1d3f4a5b6c";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				var type = this.get("UsrMyEntityType");
				this.setActiveTab(type && type.value === UsrMyEntityTypeArrival
					? "UsrExtraTab" : "GeneralInfoTab");
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrExtraTab",
				"values": {
					"caption": { "bindTo": "Resources.Strings.UsrExtraTabCaption" },
					"items": [],
					"order": 1
				},
				"parentName": "Tabs",
				"propertyName": "tabs",
				"index": 1
			},
			{
				"operation": "insert",
				"name": "UsrExtraTabGroup",
				"values": {
					"itemType": 15,
					"caption": { "bindTo": "Resources.Strings.UsrExtraTabGroupCaption" },
					"items": []
				},
				"parentName": "UsrExtraTab",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "UsrExtraTabGridLayout",
				"values": { "itemType": 0, "items": [] },
				"parentName": "UsrExtraTabGroup",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "UsrPartner",
				"values": {
					"layout": { "colSpan": 12, "rowSpan": 1, "column": 0, "row": 0,
						"layoutName": "UsrExtraTabGridLayout" },
					"bindTo": "UsrPartner"
				},
				"parentName": "UsrExtraTabGridLayout",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	const UsrMyEntityTypeArrival = "8b2f6a3e-51c4-4d7a-9e0b-2c1d3f4a5b6c";
	// Tab order as it is on the page. Re-check after every designer change.
	const TabIndexGeneral = 0;
	const TabIndexExtra = 1;

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrExtraTab",
				"values": {
					"type": "crt.TabContainer",
					"caption": "#ResourceString(UsrExtraTab_caption)#",
					"items": []
				},
				"parentName": "Tabs",
				"propertyName": "items",
				"index": TabIndexExtra
			},
			{
				// Group + grid layout collapse into one grid container.
				"operation": "insert",
				"name": "UsrExtraTabGridContainer",
				"values": {
					"type": "crt.GridContainer",
					"rows": "minmax(max-content, 32px)",
					"columns": ["minmax(64px, 1fr)", "minmax(64px, 1fr)"],
					"gap": { "columnGap": "large", "rowGap": "none" },
					"items": []
				},
				"parentName": "UsrExtraTab",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "UsrPartner",
				"values": {
					"layoutConfig": { "column": 1, "row": 1, "colSpan": 1, "rowSpan": 1 },
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrPartner_c3d4e5f",
					"control": "$PDS_UsrPartner_c3d4e5f"
				},
				"parentName": "UsrExtraTabGridContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// One-shot flag: pick the tab once per opening, not on every edit.
					"UsrIsInitialTabChosen": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Fires while the record loads, so the value is there.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrMyEntityType_d4e5f6a" &&
						!(await request.$context.UsrIsInitialTabChosen)) {
						request.$context.UsrIsInitialTabChosen = true;
						// setActiveTab(name) -> assign the zero-based INDEX.
						request.$context.Tabs_SelectedTabIndex_Profile =
							request.value?.value === UsrMyEntityTypeArrival
								? TabIndexExtra : TabIndexGeneral;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
