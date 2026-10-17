// --- How to migrate section filters (FixedFilterConfig, getFilters) to Freedom UI ---
// Classic UI configures a section's quick filter block in
// initFixedFiltersConfig() by setting the FixedFilterConfig attribute (period
// and owner filters, dependency BaseFiltersGenerateModule), and adds a
// permanent, user-invisible filter by overriding getFilters() with
// addIfNotExists. Freedom UI splits the two: the quick filters become
// crt.QuickFilter elements on the list page, configured in the designer
// (Custom, Date/Time or Lookup type, with a default value); the permanent
// filter becomes one more entry in Items.modelConfig.filterAttributes pointing
// at an attribute you own, filled with an sdk.FilterGroup in an init handler.
//
// API MAP
//   initFixedFiltersConfig() + FixedFilterConfig.filters[...]
//                                            ->  crt.QuickFilter elements (designer: "Quick filter"
//                                                component, "Component to filter" = the list)
//   period filter (startDate / dueDate defValue)
//                                            ->  QuickFilter of type Date/Time, "Default period"
//   owner filter (BaseFiltersGenerateModule.OwnerFilter, CURRENT_USER_CONTACT)
//                                            ->  QuickFilter of type Lookup, "Default value"
//   checkbox-style preset ("only open")      ->  QuickFilter of type Custom, "Default checkbox state"
//   getFilters() + filters.addIfNotExists("Key", group)
//                                            ->  filterAttributes: [..., { name: "UsrHideClosedFilter",
//                                                    loadOnChange: true }] + attribute value = sdk.FilterGroup
//   Terrasoft.SysValue.CURRENT_USER_CONTACT  ->  (await new sdk.SysValuesService().loadSysValues()).userContact
//   folders / "Predefined" filter            ->  generated filterAttributes entries of the list page
//                                                (e.g. "Items_PredefinedFilter") - keep them
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Quick filter UI is declarative and designer-generated. Its config
//     (including the `_filterOptions` wiring) is version specific: add the
//     filter in the designer, do not hand-write that block.
//   - A merge on filterAttributes REPLACES the whole array (observed): re-list
//     every entry the parent list page already has, then add yours.
//   - getFilters() ran on every load and read section state synchronously.
//     The Freedom attribute is set once (after `await next` in init) and
//     reloads the list whenever you assign it again.
//   - Classic's addIfNotExists guarded against the duplicate-key exception;
//     a filter attribute has no keys - assigning replaces the previous filter.
//   - NOT_EQUAL drops rows where the column is EMPTY in both generations.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Merging filterAttributes with only your own entry silently disables
//   folders, search and the generated quick filters - the list still loads,
//   just unfiltered by them. An EMPTY sdk.FilterGroup (or null) in your
//   attribute means "no restriction", not "no rows", so a filter built from
//   an empty list shows everything.
//
// See: Recipes/Data/HowToMigrateFilters.js
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/section/examples/set-up-quick-filter-block
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/element-setup-examples/components/set-up-quick-filter-components
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: FilterGroup, SysValuesService)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntitySection", ["BaseFiltersGenerateModule"], function(BaseFiltersGenerateModule) {

	const StatusClosed = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e01";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			// Quick filter block: period + "my records".
			initFixedFiltersConfig: function() {
				this.set("FixedFilterConfig", {
					entitySchema: this.entitySchema,
					filters: [
						{
							name: "PeriodFilter",
							caption: this.get("Resources.Strings.PeriodFilterCaption"),
							dataValueType: Terrasoft.DataValueType.DATE,
							startDate: { columnName: "UsrStartDate", defValue: Terrasoft.startOfWeek(new Date()) },
							dueDate: { columnName: "UsrStartDate", defValue: Terrasoft.endOfWeek(new Date()) }
						},
						{
							name: "Owner",
							caption: this.get("Resources.Strings.OwnerFilterCaption"),
							columnName: "UsrOwner",
							defValue: Terrasoft.SysValue.CURRENT_USER_CONTACT,
							dataValueType: Terrasoft.DataValueType.LOOKUP,
							filter: BaseFiltersGenerateModule.OwnerFilter
						}
					]
				});
			},

			// Permanent filter: closed records never show (empty status stays).
			getFilters: function() {
				var filters = this.callParent(arguments);
				var notClosed = Terrasoft.createFilterGroup();
				notClosed.logicalOperation = Terrasoft.LogicalOperatorType.OR;
				notClosed.add("StatusNotClosed", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.NOT_EQUAL, "UsrStatus", StatusClosed));
				notClosed.add("StatusEmpty", Terrasoft.createColumnIsNullFilter("UsrStatus"));
				filters.addIfNotExists("UsrHideClosed", notClosed);
				return filters;
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyEntity_ListPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const StatusClosed = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e01";

	return {
		// The period and owner quick filters: add two Quick filter components
		// in the designer (Date/Time with a default period, Lookup on UsrOwner
		// with a default value). It writes the crt.QuickFilter entries here.
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				// REPLACES the array: copy the parent page's entries (names below are
				// typical of generated pages - check yours), then add your own.
				"operation": "merge",
				"path": ["attributes", "Items", "modelConfig"],
				"values": {
					"filterAttributes": [
						{ "loadOnChange": true, "name": "FolderTree_active_folder_filter" },
						{ "loadOnChange": true, "name": "Items_PredefinedFilter" },
						{ "loadOnChange": true, "name": "LookupQuickFilterByTag_Items" },
						{ "loadOnChange": true, "name": "SearchFilter_Items" },
						{ "loadOnChange": true, "name": "UsrHideClosedFilter" }
					]
				}
			},
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrHideClosedFilter": { "value": null }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Was getFilters(): set once, after the stock initialisation.
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					const notClosed = new sdk.FilterGroup(sdk.LogicalOperatorType.Or);
					notClosed.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Not_equal, "UsrStatus", StatusClosed);
					notClosed.addSchemaColumnIsNullFilter("UsrStatus");
					request.$context.UsrHideClosedFilter = notClosed;
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
