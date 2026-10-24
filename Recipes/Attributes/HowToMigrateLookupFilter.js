// --- How to migrate a lookup filter (lookupListConfig) to Freedom UI ------------
// Classic UI filters a lookup with `lookupListConfig.filter` on the column's
// attribute: a SYNCHRONOUS function, called with the view model as `this` each
// time the list opens, that returns a Terrasoft.FilterGroup. Freedom UI has no
// such attribute property. The filter moves into a handler for
// crt.LoadDataRequest that recognises the lookup's list data source and pushes
// an sdk.FilterGroup into request.parameters.
//
// API MAP
//   attributes.X.lookupListConfig.filter   ->  handler "crt.LoadDataRequest",
//                                              if (request.dataSourceName === "<attr>_List_DS")
//   this.get("UsrParent")                  ->  await request.$context.PDS_UsrParent_b2c3d4e
//   Terrasoft.createFilterGroup()          ->  new sdk.FilterGroup()
//   Terrasoft.createColumnFilterWithParameter(Terrasoft.ComparisonType.EQUAL, ...)
//                                          ->  filter.addSchemaColumnFilterWithParameter(
//                                                  sdk.ComparisonType.Equal, ...)   // returns void
//   return filterGroup                     ->  request.parameters.push({ type: "filter", value: filter })
//   lookupListConfig.columns / orders      ->  no handler equivalent; the list's own
//                                              data source config (see the Freedom UI recipe)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic reads values synchronously; Freedom must `await` every $context read.
//   - The attribute name changes: Classic "UsrParent" becomes a generated
//     Freedom attribute such as "PDS_UsrParent_b2c3d4e". Read it off the real schema.
//   - The data source name is the lookup attribute + "_List_DS" (verified on
//     Creatio 10.1.796, tools/verify: "Owner_List_DS" on a stock contact
//     page). A wrong name fails silently: no error, no filter.
//   - When crt.LoadDataRequest runs (observed on 10.1.796, tools/verify): at
//     page load only "PageParameters" and "PDS" go through it; list data
//     sources (e.g. AddressListDS, CareerListDS) load about 3 s later, after
//     render; a lookup's "<attr>_List_DS" only when its dropdown opens, with
//     loadType "reload". Do not expect the lookup request at page load.
//   - Since 8.0.10 a lookup list requests its data only ONCE, so a filter that
//     depends on another field may apply to the first open only. It was reported
//     still present after 8.1.x (May 2024, CustomerFX article comments). What
//     8.1.1 removed is the Object.assign / newFilter.items workaround. Prefer
//     filterAttributes with loadOnChange (below) and test on your version.
//   - The lookup's selection window sends crt.OpenLookupPageRequest, not
//     crt.LoadDataRequest; this handler does not filter it.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Assigning `value: new sdk.FilterGroup().addSchemaColumnFilterWithParameter(...)`
//   passes undefined (the method returns void): the list shows every record.
//   Classic's "return an empty FilterGroup to show everything" still holds; an
//   empty sdk.FilterGroup also means "no filter".
//
// For "filter B by the value picked in A" with no code at all, Freedom UI's
// declarative form is `filterAttributes` on the "<attr>_List" attribute.
//
// Applies: Creatio 8.1+ (lookup data loads once since 8.0.10; Object.assign workaround not needed on 8.1.1+); Classic UI 7.x–8.x
// Source: https://customerfx.com/article/dynamically-filtering-a-lookup-on-a-creatio-freedom-ui-page/
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: FilterGroup, ComparisonType)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/customize-page-fields/overview (filterAttributes, _List, loadOnChange)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrRelatedEntity": {
				"dataValueType": Terrasoft.DataValueType.LOOKUP,
				"lookupListConfig": {
					"filter": function() {
						var filters = Terrasoft.createFilterGroup();
						var parent = this.get("UsrParent");
						if (parent) {
							filters.add("ByParent", Terrasoft.createColumnFilterWithParameter(
								Terrasoft.ComparisonType.EQUAL, "UsrParent", parent.value));
						}
						// An empty group means "show everything"; never return null.
						return filters;
					}
				}
			}
		}
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.LoadDataRequest",
				handler: async (request, next) => {
					if (request.dataSourceName === "PDS_UsrRelatedEntity_a1b2c3d_List_DS") {
						const parent = await request.$context.PDS_UsrParent_b2c3d4e;
						if (parent?.value) {
							const filter = new sdk.FilterGroup();
							// Synchronous, returns void: build first, then pass the variable.
							filter.addSchemaColumnFilterWithParameter(
								sdk.ComparisonType.Equal, "UsrParent", parent.value);
							request.parameters.push({ type: "filter", value: filter });
						}
					}
					return await next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
