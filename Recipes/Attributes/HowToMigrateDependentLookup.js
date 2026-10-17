// --- How to migrate a dependent lookup (Country -> City) to Freedom UI ---------
// Classic UI filters a child lookup by a parent with a FILTRATION business rule
// (ruleType 1, baseAttributePatch, autoClean) or with lookupListConfig.filter
// plus a dependency that clears the child. Freedom UI offers a no-code
// business rule ("Apply filter", with "Clear value" / "Populate value"
// checkboxes) and, in code, a declarative form: `filterAttributes` on the
// child's "<attribute>_List" attribute names an attribute holding the filter,
// with loadOnChange so the list re-queries; a handler on the parent's change
// writes a new sdk.FilterGroup into it and clears the child.
//
// API MAP
//   businessRules ruleType FILTRATION        ->  Freedom UI business rule "Apply filter"
//     baseAttributePatch: "UsrCountry"           (no code), or filterAttributes (below)
//     autoClean: true                        ->  "Clear value..." checkbox / clear the child in code
//     autocomplete: true (reverse fill)      ->  "Populate value..." checkbox; in code: set the
//                                               parent from the child's change handler
//   lookupListConfig.filter on UsrCity       ->  "PDS_UsrCity_a1b2c3d_List": { "modelConfig":
//                                               { "filterAttributes": [{ "name": "UsrCity_Filter",
//                                               "loadOnChange": true }] } }
//   dependencies on UsrCountry -> clear city ->  "change" on the parent attribute + handler
//   Terrasoft.createFilterGroup() + add(...) ->  new sdk.FilterGroup();
//                                               filter.addSchemaColumnFilterWithParameter(...)
//   this.set("UsrCity", null)                ->  request.$context.PDS_UsrCity_a1b2c3d = null
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The column in the filter is on the CHILD entity (UsrCity.UsrCountry),
//     as in Classic's baseAttributePatch.
//   - An empty parent should set the filter attribute to null (no restriction),
//     not filter on null, which shows an empty list.
//   - Without loadOnChange the list keeps the rows it loaded first. Since
//     8.0.10 a lookup list requests its data only once; reported still present
//     after 8.1.x (May 2024, CustomerFX article comments). 8.1.1 removed the
//     Object.assign / newFilter.items workaround, so filterAttributes with
//     loadOnChange is the route; test on your version.
//   - Assigning an sdk.FilterGroup to the filter attribute is the common
//     practice; if your version ignores it, assign filter.toJson() (observed).
//   - Clearing the child on a load-time change wipes the stored City of a
//     saved record. Clear only when the user changed the parent: below, a
//     "model loaded" flag set on finish-load-model-attributes. HasUnsavedData
//     is a common guard but can turn true during load (observed).
//     See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//   - A filter that needs a query or several conditions is easier in a
//     crt.LoadDataRequest handler.
//     See: Recipes/Attributes/HowToMigrateLookupFilter.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Filtering the list but not clearing the child (Classic autoClean was a
//   rule flag, easy to overlook) keeps a City from the old Country selected;
//   it saves, although the list no longer offers it.
//   A wrong list attribute name ("PDS_UsrCity_a1b2c3d" without "_List") is
//   ignored: no error, no filter.
//
// See: Recipes/Attributes/HowToMigrateBusinessRules.js
// Applies: Creatio 8.1+ (lookup data loads once since 8.0.10; Object.assign workaround gone in 8.1.1+; filter.toJson() needs @creatio-devkit/common 0.811.1+; "finish-load-model-attributes" reported from 8.1.3); Classic UI 7.x–8.x
// Source: https://customerfx.com/article/dynamically-filtering-a-lookup-on-a-creatio-freedom-ui-page/ (comments: load-once)
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/freedom-ui-business-rules
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/classic-ui/client-schema/references/rules-and-businessrules

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	// Invented rule id.
	const UsrCityRuleId = "8d2e4f60-1a3b-4c5d-9e7f-0a1b2c3d4e5f";

	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			// Code form: filter the list each time it opens.
			"UsrCity": {
				"dataValueType": Terrasoft.DataValueType.LOOKUP,
				"lookupListConfig": {
					"filter": function() {
						var filters = Terrasoft.createFilterGroup();
						var country = this.get("UsrCountry");
						if (country) {
							filters.add("ByCountry", Terrasoft.createColumnFilterWithParameter(
								Terrasoft.ComparisonType.EQUAL, "UsrCountry", country.value));
						}
						return filters;
					}
				}
			},
			"UsrCountry": {
				"dependencies": [
					{ "columns": ["UsrCountry"], "methodName": "onCountryChanged" }
				]
			}
		},
		// Rule form of the same thing (designer-generated); use one, not both.
		businessRules: /**SCHEMA_BUSINESS_RULES*/{
			"UsrCity": {
				"UsrCityByCountryRule": {
					"uId": UsrCityRuleId,
					"enabled": true,
					"removed": false,
					"invalid": false,
					"ruleType": 1,               // FILTRATION
					"baseAttributePatch": "UsrCountry",
					"comparisonType": 3,         // EQUAL
					"autoClean": true,
					"autocomplete": true,
					"type": 1,                   // ATTRIBUTE
					"attribute": "UsrCountry"
				}
			}
		}/**SCHEMA_BUSINESS_RULES*/,
		methods: {
			onCountryChanged: function() {
				if (!this.get("IsEntityInitialized")) {
					return;
				}
				this.set("UsrCity", null);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// The child's LIST attribute: "<lookup attribute>_List".
					"PDS_UsrCity_a1b2c3d_List": {
						"modelConfig": {
							"filterAttributes": [
								{ "loadOnChange": true, "name": "UsrCity_Filter" }
							]
						}
					},
					// Holds the filter; null = no restriction.
					"UsrCity_Filter": { "value": null },
					// Set once the record has loaded: guards the clear below.
					"UsrIsModelLoaded": { "value": false },
					// The parent: its change rebuilds the filter.
					"PDS_UsrCountry_b2c3d4e": {
						"modelConfig": { "path": "PDS.UsrCountry" },
						"change": { "request": "usr.CountryChangedRequest" }
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					request.$context.events$.subscribe((evt) => {
						if (evt?.type === "finish-load-model-attributes") {
							request.$context.UsrIsModelLoaded = true;
						}
					});
				}
			},
			{
				request: "usr.CountryChangedRequest",
				handler: async (request, next) => {
					const country = await request.$context.PDS_UsrCountry_b2c3d4e;
					if (!country?.value) {
						request.$context.UsrCity_Filter = null;
					} else {
						const filter = new sdk.FilterGroup();
						// Returns void: build first, then assign the variable.
						filter.addSchemaColumnFilterWithParameter(
							sdk.ComparisonType.Equal, "UsrCountry", country.value);
						request.$context.UsrCity_Filter = filter;
					}
					// Was autoClean: drop a City that no longer fits, but only
					// after a user edit (the load-time change must keep it).
					const city = await request.$context.PDS_UsrCity_a1b2c3d;
					if (city && await request.$context.UsrIsModelLoaded) {
						request.$context.PDS_UsrCity_a1b2c3d = null;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
