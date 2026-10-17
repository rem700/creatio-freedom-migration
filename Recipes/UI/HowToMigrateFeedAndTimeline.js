// --- How to migrate the Feed tab (ESNTab) and History tab to Freedom UI Feed and Timeline ---
// In Classic UI the record page's Feed tab is "ESNTab", inherited from
// BaseModulePageV2 in the ESN package, which loads the feed module into the
// tab through sandbox (methods such as loadESNFeed and
// getSocialFeedSandboxId); custom code hides it with
// this.get("TabsCollection").removeByKey("ESNTab") or copies that wiring to
// other pages. Activities, emails and files of the record sit in a History
// tab as separate details. Freedom UI replaces both with components placed in
// the page schema: crt.Feed (record or user feed, rich text and mentions) and
// crt.Timeline, a combined, filterable history of the record (feed messages,
// emails, files, activities and other linked objects as crt.TimelineTile
// items) with a message composer (crt.MessageComposerSelector holding
// crt.FeedComposer / crt.EmailComposer). Both are normally added in the
// Freedom UI Designer; their properties are documented in the Academy
// component references.
//
// API MAP
//   inherited "ESNTab" + loadESNFeed / getSocialFeedSandboxId
//                                  ->  { "type": "crt.Feed", "feedType": "Record",
//                                        "primaryColumnValue": "$Id", "cardState": "$CardState",
//                                        "entitySchemaName": "UsrMyEntity", "dataSourceName": "PDS" }
//   feed of a user (contact profile) ->  crt.Feed with "feedType": "User"
//   tabsCollection.removeByKey("ESNTab") (hide the feed)
//                                  ->  remove the element in the designer, or "visible": "$Attr"
//   History tab: activity / email / file details
//                                  ->  crt.Timeline with crt.TimelineTile items (designer), each
//                                      tile: data.schemaType, linkedColumn, sortedByColumn,
//                                      ownerColumn
//   "write a message" area of the feed tab
//                                  ->  Timeline "tools": crt.MessageComposerSelector with
//                                      crt.FeedComposer / crt.EmailComposer, or crt.Feed itself
//   external (portal) users posting ->  crt.Feed "allowExternalPost" (default false)
//   follow / unfollow the record feed
//                                  ->  crt.ToggleFollowFeedRequest ("Follow or unfollow a record
//                                      feed", no documented parameters)
//   Change log (history of field values)
//                                  ->  crt.OpenChangeLogRequest / button action "Open change log"
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - There is no module to load and no sandbox id: the component reads the
//     record through dataSourceName "PDS" and primaryColumnValue "$Id". Custom
//     code that subscribed to ESN sandbox messages has nothing to subscribe
//     to; react to the data (records) or the server channel instead.
//   - Feed messages are data, not page code: the Freedom components are
//     expected to show what was posted from Classic (same database), but
//     Academy does not state it; check on a copy before switching users.
//   - Timeline tiles are configured per linked object in the designer. A
//     History-tab detail with a custom filter or extra columns has no
//     one-to-one tile setting; keep it as a list (crt.DataGrid) when the tile
//     cannot express it. See: Recipes/Lists/HowToMigrateDetailToList.js
//   - Timeline filters (TimelineFilter_Entity, _Date, _Owner,
//     _SystemMessages) are built in and not editable; custom filters go in
//     "customFilters" (a crt.FlexContainer) bound through "filterValues".
//   - Version differences: Academy references exist for 8.0-8.3; some
//     properties are newer (isTileReadOnly: 8.3.1+ per the 8.3 reference).
//     Copy the JSON your designer generates rather than this example.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A Classic onRender / initTabs override that removes "ESNTab" is never
//   called in Freedom UI, so the feed stays visible. A crt.Feed whose
//   entitySchemaName or primaryColumnValue is wrong (copied from another
//   page, or bound to a generated attribute instead of "$Id") renders an
//   empty feed with no error, and posts land on the wrong record or nowhere.
//
// Applies: Classic UI 7.x (ESN package); Freedom UI 8.0+ (crt.Feed, crt.Timeline references for 8.0-8.3); isTileReadOnly 8.3.1+
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/page-customization-basics/references/feed
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/page-customization-basics/references/timeline
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://community.creatio.com/node/27058 (Classic: Feed tab from BaseModulePageV2 in the ESN package)
// Source: https://techadv.com/blog/how-remove-feed-tab-creatio (Classic: removeByKey("ESNTab"))

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			// Hide the inherited Feed tab for closed records.
			onEntityInitialized: function() {
				this.callParent(arguments);
				if (this.get("UsrIsClosed")) {
					var tabs = this.get("TabsCollection");
					if (tabs && tabs.contains("ESNTab")) {
						tabs.removeByKey("ESNTab");
					}
				}
			}
		},
		details: /**SCHEMA_DETAILS*/{
			// History tab: one detail per kind of record (here: activities).
			"UsrActivities": {
				"schemaName": "ActivityDetailV2",
				"entitySchemaName": "Activity",
				"filter": { "masterColumn": "Id", "detailColumn": "UsrMyEntity" }
			}
		}/**SCHEMA_DETAILS*/,
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrActivities",
				"parentName": "HistoryTab",
				"propertyName": "items",
				"values": { "itemType": Terrasoft.ViewItemType.DETAIL }
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// A tab to hold the feed (Classic had a stock Feed tab).
				"operation": "insert",
				"name": "UsrFeedTabContainer",
				"values": {
					"type": "crt.TabContainer",
					"caption": "#ResourceString(UsrFeedTabContainer_caption)#",
					"items": []
				},
				"parentName": "Tabs",
				"propertyName": "items",
				"index": 1
			},
			{
				// The Feed tab -> crt.Feed; hidden for closed records by binding.
				"operation": "insert",
				"name": "UsrFeed",
				"values": {
					"type": "crt.Feed",
					"feedType": "Record",
					"primaryColumnValue": "$Id",
					"cardState": "$CardState",
					"allowExternalPost": false,
					"entitySchemaName": "UsrMyEntity",
					"dataSourceName": "PDS",
					"visible": "$UsrIsFeedVisible"
				},
				"parentName": "UsrFeedTabContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// The History tab -> crt.Timeline. Tiles (activities, emails,
				// files, feed) and their columns are added in the designer;
				// keep the generated "items", "tools", "filters" as they are.
				"operation": "insert",
				"name": "UsrTimeline",
				"values": {
					"type": "crt.Timeline",
					"items": [],
					"tools": [],
					"customFilters": [],
					"hideTools": false,
					"masterSchemaId": "$Id",
					"caption": "#ResourceString(UsrTimeline_caption)#",
					"label": "#ResourceString(UsrTimeline_label)#",
					"filters": [],
					"masterEntitySchemaName": "UsrMyEntity",
					// Generated by the designer - read it off your schema.
					"filterValues": "$UsrTimeline_AllTileFilters"
				},
				"parentName": "GeneralInfoTab",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsFeedVisible": { "value": true }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// onEntityInitialized -> the attribute change request, which also
				// fires while the record loads (the init request fires BEFORE the
				// data; See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js).
				// A business rule on "Is closed" does the same without code.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrIsClosed_a1b2c3d") {
						request.$context.UsrIsFeedVisible = !request.value;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
