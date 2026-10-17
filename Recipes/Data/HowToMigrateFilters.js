// --- How to migrate ESQ filters (FilterGroup, ComparisonType) to Freedom UI ---
// Classic UI builds filters with Terrasoft.createFilterGroup(), the
// Terrasoft.create*Filter* factories and SCREAMING_CASE enums
// (Terrasoft.ComparisonType.EQUAL, Terrasoft.LogicalOperatorType.OR), and adds
// them with group.add("Key", filter). Freedom UI uses `new sdk.FilterGroup()`
// with add* helper methods on the group itself and "Word_word" enums
// (sdk.ComparisonType.Equal). The same group then goes to sdk.Model.load /
// update / delete, to a crt.LoadDataRequest handler or to a filter attribute.
//
// API MAP
//   Terrasoft.createFilterGroup()            ->  new sdk.FilterGroup()
//   group.logicalOperation = Terrasoft.LogicalOperatorType.OR
//                                            ->  new sdk.FilterGroup(sdk.LogicalOperatorType.Or)
//                                                (or set .logicalOperation)
//   group.add("Key", Terrasoft.createColumnFilterWithParameter(cmp, "Col", v))
//                                            ->  group.addSchemaColumnFilterWithParameter(cmp, "Col", v, "Key")
//   Terrasoft.createColumnInFilterWithParameters("Col", [a, b])
//                                            ->  group.addSchemaColumnInFilterWithParameters(
//                                                    sdk.ComparisonType.Equal, "Col", [a, b])
//   Terrasoft.createColumnIsNullFilter("Col") ->  group.addSchemaColumnIsNullFilter("Col")
//   Terrasoft.createColumnIsNotNullFilter("Col")
//                                            ->  group.addSchemaColumnIsNotNullFilter("Col")
//   Terrasoft.createColumnBetweenFilterWithParameters("Col", a, b)
//                                            ->  group.addSchemaColumnBetweenFilterWithParameters("Col", a, b)
//   Terrasoft.createExistsFilter(path) + subFilters
//                                            ->  group.addExistsFilter(path, subGroup)
//   Id IN [...]                              ->  group.addPrimarySchemaColumnInFilter([...])
//   parent.add("Sub", childGroup)            ->  parent.add(childGroup, "Sub")   // ORDER REVERSED
//   parent.addItem(childGroup)               ->  parent.add(childGroup)
//   group.addIfNotExists("Key", f)           ->  no equivalent; check group.items["Key"] first
//   group.removeByKey("Key")                 ->  group.remove("Key")             // returns boolean
//
// ENUM NAME MAPPING (numeric values are identical; only the names change)
//   EQUAL -> Equal              NOT_EQUAL -> Not_equal
//   LESS -> Less                LESS_OR_EQUAL -> Less_or_equal
//   GREATER -> Greater          GREATER_OR_EQUAL -> Greater_or_equal
//   IS_NULL -> Is_null          IS_NOT_NULL -> Is_not_null
//   CONTAIN -> Contain          NOT_CONTAIN -> Not_contain
//   START_WITH -> Start_with    NOT_START_WITH -> Not_start_with
//   END_WITH -> End_with        NOT_END_WITH -> Not_end_with
//   EXISTS -> Exists            NOT_EXISTS -> Not_exists
//   BETWEEN -> Between (hidden in the typings; use addSchemaColumnBetweenFilterWithParameters)
//   LogicalOperatorType: AND -> And, OR -> Or
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic add() with a key that already exists THROWS
//     Terrasoft.ItemAlreadyExistsException. Freedom stores filters in a Map:
//     a repeated key silently REPLACES the earlier filter (implementation of
//     @creatio/base). Loops must still generate distinct keys.
//   - Classic factories return the filter; Freedom add* methods return VOID
//     and mutate the group. You cannot chain them or use them as a value.
//   - add() takes (filter, key) in Freedom, (key, filter) in Classic. A
//     ported `group.add("Key", filter)` stores the STRING as the filter.
//   - addSchemaColumnBetweenFilterWithParameters exists since devkit 0.808.0.
//   - NOT_EQUAL keeps SQL semantics in both: rows with an EMPTY column are
//     dropped. Add an Is_null branch in an Or group when they must stay.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A wrong enum name (sdk.ComparisonType.EQUAL, .NotEqual,
//   sdk.LogicalOperatorType.OR) is undefined; the filter degrades without an
//   error. An EMPTY group means "no filter" in both generations: an Or group
//   built in a loop over an empty list matches EVERY row - guard for zero
//   items before you pass it to load, update or delete.
//
// Applies: Creatio 8.1+ (addSchemaColumnBetweenFilterWithParameters needs @creatio-devkit/common 0.808.0+); Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: FilterGroup, ComparisonType, LogicalOperatorType)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/ (Terrasoft.FilterGroup, Terrasoft.ComparisonType)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const ServiceImport = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e01";
	const ServiceExport = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e02";
	const StatusClosed = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e03";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			// Rows of this record, with one of several services, not closed
			// (an empty status counts as "not closed").
			buildRowFilters: function(serviceIds) {
				var root = Terrasoft.createFilterGroup();   // AND by default
				root.add("Master", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", this.get("Id")));

				if (serviceIds.length) {
					var services = Terrasoft.createFilterGroup();
					services.logicalOperation = Terrasoft.LogicalOperatorType.OR;
					serviceIds.forEach(function(id, index) {
						services.add("Service" + index, Terrasoft.createColumnFilterWithParameter(
							Terrasoft.ComparisonType.EQUAL, "UsrService", id));
					});
					root.add("Services", services);
				}

				var notClosed = Terrasoft.createFilterGroup();
				notClosed.logicalOperation = Terrasoft.LogicalOperatorType.OR;
				notClosed.add("NotClosed", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.NOT_EQUAL, "UsrStatus", StatusClosed));
				notClosed.add("NoStatus", Terrasoft.createColumnIsNullFilter("UsrStatus"));
				root.add("NotClosedGroup", notClosed);

				// add("Master", ...) a second time would throw here.
				root.addIfNotExists("Master", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", this.get("Id")));
				return root;
			},

			buildDefaultRowFilters: function() {
				return this.buildRowFilters([ServiceImport, ServiceExport]);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const ServiceImport = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e01";
	const ServiceExport = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e02";
	const StatusClosed = "3c1f6a2e-7d4b-4e85-9a10-5b2c8f0d1e03";

	// Same filter, Freedom style. add* calls return void: build, then return the variable.
	function buildRowFilters(recordId, serviceIds) {
		const root = new sdk.FilterGroup();   // And by default
		root.addSchemaColumnFilterWithParameter(
			sdk.ComparisonType.Equal, "UsrMyEntity", recordId, "Master");

		if (serviceIds.length) {
			// Equality against a list: one IN filter instead of an Or loop.
			root.addSchemaColumnInFilterWithParameters(
				sdk.ComparisonType.Equal, "UsrService", serviceIds, "Services");
		}

		const notClosed = new sdk.FilterGroup(sdk.LogicalOperatorType.Or);
		notClosed.addSchemaColumnFilterWithParameter(
			sdk.ComparisonType.Not_equal, "UsrStatus", StatusClosed);
		notClosed.addSchemaColumnIsNullFilter("UsrStatus");
		// (filter, key) - the reverse of Classic's add(key, filter).
		root.add(notClosed, "NotClosedGroup");

		// No addIfNotExists, and a repeated key would REPLACE, not throw.
		if (!root.items["Master"]) {
			root.addSchemaColumnFilterWithParameter(
				sdk.ComparisonType.Equal, "UsrMyEntity", recordId, "Master");
		}
		return root;
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.CountMatchingRowsRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.PDS_Id_a1b2c3d;
					const filter = buildRowFilters(recordId, [ServiceImport, ServiceExport]);

					const model = await sdk.Model.create("UsrMyDetailEntity");
					const rows = await model.load({
						attributes: ["Id"],
						parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
					});
					request.$context.UsrMatchingRowCount = rows.length;
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
