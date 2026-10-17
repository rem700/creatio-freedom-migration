// --- How to find the generated names in a Freedom UI schema (PDS_ attributes, _List_DS, <Grid>DS, element names) ---
// Reference text with one short snippet. Classic UI code addresses a field by
// its column name ("UsrCity") and an element by the name you gave it in diff.
// Freedom UI code addresses GENERATED names that the designer writes into the
// page schema when you place a field or a list: attributes such as
// "PDS_UsrCity_a1b2c3d", lookup data sources "<attr>_List_DS", list data
// sources "<Grid>DS", row attributes "<Grid>DS_<Column>", element names with a
// random suffix. They cannot be derived from the column name; read them from
// the schema, or log them at runtime with a temporary handler.
//
// API MAP
//   this.get("UsrCity") (column name)      ->  attribute "PDS_UsrCity_<suffix>" in viewModelConfigDiff,
//                                              "modelConfig": { "path": "PDS.UsrCity" }
//   lookupListConfig on "UsrCity"          ->  list attribute "PDS_UsrCity_<suffix>_List",
//                                              data source "PDS_UsrCity_<suffix>_List_DS"
//   details key "UsrMyDetail"              ->  collection attribute "GridDetail_<suffix>", data source
//                                              "GridDetail_<suffix>DS", rows "GridDetail_<suffix>DS_<Column>"
//   section grid (GridData)                ->  list page collection "Items" on data source "PDS",
//                                              rows "PDS_<Column>" (observed)
//   diff item "name"                       ->  viewConfigDiff "name" (designer default
//                                              "<Type>_<suffix>"; rename allowed - observed)
//   Resources.Strings.<YourKey>            ->  generated keys "PDS_<Column>_<suffix>" (field label),
//                                              "<Element>_caption", "<Grid>DS_<Column>" (column caption)
//   (no Classic equivalent)                ->  log request.dataSourceName / request.attributeName
//                                              in a temporary handler (snippet below)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The suffix is random per placement: the same column on two pages, or
//     removed and re-added on one page, gets a different name. Never copy a
//     name from another page or from documentation examples.
//   - Names that come from the PARENT schema (template containers such as
//     "Tabs", "ActionButtonsContainer", "SideAreaProfileContainer", the
//     primary data source "PDS") are not in your schema's diff; open the
//     parent to see them.
//   - A stock or template field may be named without a suffix or with
//     another pattern (observed); the rule is "read it", not "build it".
//   - Element names are NOT DOM ids; do not build selectors from them.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A guessed name is never an error. Reading `$context.UsrCity` (the column
//   name) returns undefined; a handler that compares request.dataSourceName
//   with "UsrCity_List_DS" never matches, so the filter is never added; a
//   dependency keyed by the grid name instead of "<Grid>DS" leaves the list
//   showing every row. The page looks fine and the logic simply never runs.
//
// See: Recipes/Attributes/HowToMigrateLookupFilter.js
// See: Recipes/Lists/HowToMigrateDetailToList.js
// See: Recipes/Pitfalls/MigrationPitfalls.js
// Applies: Creatio 8.1+ (Freedom UI); Classic UI 7.x-8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://customerfx.com/article/dynamically-filtering-a-lookup-on-a-creatio-freedom-ui-page/
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: DataRequest.dataSourceName, HandleViewModelAttributeChangeRequest.attributeName)

// ===== WHERE THE NAMES COME FROM =============================================
//
//   You do in the designer              The designer writes (8.1+, observed shapes)
//   Place a field for column UsrCity    viewConfigDiff: element "<Type>_<suffix>" with
//                                         "control": "$PDS_UsrCity_<suffix>",
//                                         "label": "$Resources.Strings.PDS_UsrCity_<suffix>"
//                                       viewModelConfigDiff: "PDS_UsrCity_<suffix>":
//                                         { "modelConfig": { "path": "PDS.UsrCity" } }
//                                       resources: key "PDS_UsrCity_<suffix>" (the label)
//   ...if UsrCity is a lookup           the lookup list uses attribute "PDS_UsrCity_<suffix>_List"
//                                       and data source "PDS_UsrCity_<suffix>_List_DS" (they may
//                                       be absent from the schema until you configure them - observed)
//   Place a list (detail) of            viewConfigDiff: crt.DataGrid "GridDetail_<suffix>",
//     UsrMyDetailEntity                   "items": "$GridDetail_<suffix>",
//                                         "primaryColumnName": "GridDetail_<suffix>DS_Id"
//                                       viewModelConfigDiff: collection "GridDetail_<suffix>" with
//                                         row attributes "GridDetail_<suffix>DS_<Column>"
//                                       modelConfigDiff: data source "GridDetail_<suffix>DS" and,
//                                         when linked to the record, dependencies keyed by it
//                                       plus toolbar elements such as an add button
//                                         ("GridDetailAddBtn_<suffix>", observed)
//   Add a button                        element "Button_<suffix>" (observed), caption key
//                                         "<Element>_caption"
//   Add a tab                           element in "Tabs"; its index lives in
//                                         "Tabs_SelectedTabIndex_Profile" (observed)
//   List page (section)                 collection "Items" on data source "PDS"; selection in
//                                         "DataTable_SelectionState" (observed)

// ===== HOW TO READ THEM: THREE ROUTES ========================================
//
//   1. Freedom UI designer, source code view.
//      Open the page in the Freedom UI designer and open its source code (the
//      action that opens the schema in the client module designer). Search for
//      the column name: the "modelConfig": { "path": "PDS.UsrCity" } line sits
//      under the attribute whose key is the name you need. What you see is THIS
//      package's diff only (observed): names from the parent template or from
//      other packages' replacing schemas are not in it.
//
//   2. The schema itself (Configuration / the package files).
//      viewModelConfigDiff  -> attribute names (PDS_<Column>_<suffix>, list
//                              collections, your own attributes) and their paths.
//      modelConfigDiff      -> data source names (<Grid>DS) and the dependencies
//                              keyed by them.
//      viewConfigDiff       -> element names, parentName (containers), and the
//                              "$..." bindings that point back to attributes.
//      For inherited names open the parent schema named in the page's
//      properties, and every replacing schema above yours.
//
//   3. Runtime: a temporary logging handler (snippet below).
//      Open the page, open the lookup / scroll the list / change the field, and
//      read the browser console. dataSourceName and attributeName are declared
//      on the request classes in the devkit typings. Covers names from parents
//      and from other packages that routes 1-2 miss. Remove it before release.
//      A lookup list requests data only on its first open since 8.0.10
//      (observed): reload the page to see its _List_DS again.

// ===== TEMPORARY LOGGING HANDLER =============================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Lists and lookup lists: prints "GridDetail_k7m2p9qDS", "PDS_UsrCity_a1b2c3d_List_DS"...
				request: "crt.LoadDataRequest",
				handler: async (request, next) => {
					console.log("[UsrDebug] LoadDataRequest", request.dataSourceName);
					return next?.handle(request);
				}
			},
			{
				// Fields: prints "PDS_UsrCity_a1b2c3d" when the value changes (also on load).
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					console.log("[UsrDebug] change", request.attributeName, request.value);
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
