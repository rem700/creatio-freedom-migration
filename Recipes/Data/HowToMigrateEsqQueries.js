// --- How to migrate EntitySchemaQuery (ESQ) reads to Freedom UI --------------
// Classic UI reads records with Terrasoft.EntitySchemaQuery: addColumn() per
// column, filters on esq.filters, then getEntityCollection(callback, scope) or
// getEntity(id, callback, scope). The callback gets { success, collection }
// and every row is a view model read with row.get("Alias"). Freedom UI reads
// from a handler with sdk.Model: `await sdk.Model.create("<Entity>")`, then
// `await model.load({ attributes, parameters, options })`, which resolves to a
// plain array of plain objects. When the data is shown on the page, a data
// source in modelConfigDiff is usually the better replacement: no code at all.
//
// API MAP
//   Ext.create("Terrasoft.EntitySchemaQuery",
//       { rootSchemaName: "X" })             ->  await sdk.Model.create("X")
//   esq.addColumn("UsrName")                 ->  attributes: ["UsrName"]
//   esq.addColumn("UsrType.Name", "TypeName")->  attributes: [{ name: "TypeName",
//                                                    path: "UsrType.Name" }]
//   esq.filters.addItem(esq.createColumnFilterWithParameter(...))
//                                            ->  parameters: [{ type: sdk.ModelParameterType.Filter,
//                                                    value: <sdk.FilterGroup> }]
//   esq.getEntity(id, cb, scope)             ->  load({ parameters: [{ type:
//                                                    sdk.ModelParameterType.PrimaryColumnValue,
//                                                    value: id }] })[0]
//   esq.getEntityCollection(cb, scope)       ->  await model.load({...})   // array
//   result.success / result.errorInfo        ->  no flag: a failed load rejects; try/catch
//   result.collection.getItems() / each()    ->  the array itself / for...of
//   result.collection.getCount()             ->  records.length
//   row.get("TypeName")                      ->  row.TypeName
//   esq.rowCount = 20                        ->  options: { pagingConfig: { rowCount: 20,
//                                                    rowsOffset: 0 } }
//   column.orderPosition / orderDirection    ->  options: { sortingConfig: { columns: [
//                                                    { columnName, direction: "desc" }] } }
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Callback + scope becomes async/await. There is no `this`; read page
//     values with `await request.$context.<Attribute>` before the query.
//   - The alias moves INTO the attribute: { name, path }. A plain string
//     "UsrType.Name" comes back under that dotted key, not under your alias
//     (observed).
//   - Paging and sorting move from properties of the query to load `options`
//     (pagingConfig { rowsOffset, rowCount }, sortingConfig { columns }).
//     The old `loadOptions` key is deprecated since devkit 0.813.0.
//   - A lookup column still arrives as { value, displayValue }.
//   - Unsaved record: Classic tests isAddMode(); Freedom tests
//     `await request.$context.getPrimaryModelMode() === "create"`. In both
//     generations the Id exists before the row does, so never test for an
//     empty Id.
//   - An ESQ that only fed a list or a detail is not ported as a query: in
//     Freedom that data comes from a data source + collection attribute.
//     See: Recipes/Lists/HowToMigrateDetailToList.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   `value: new sdk.FilterGroup().addSchemaColumnFilterWithParameter(...)`
//   passes undefined (the add methods return void), and load() then returns
//   EVERY row of the table, the same as an ESQ with no filter at all.
//   Ported reads like `result?.collection` or `row.get?.("X")` on the Freedom
//   result are undefined: guarded with ?. the code runs and shows empty values.
//
// Filters in depth: See: Recipes/Data/HowToMigrateFilters.js
//
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model.load, DataSourceLoadOptions, ModelParameterType)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/ (Terrasoft.EntitySchemaQuery)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			// One record by id, with a joined caption.
			loadRecordInfo: function() {
				if (this.isAddMode() || this.isCopyMode()) {
					return;
				}
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", {
					rootSchemaName: "UsrMyEntity"
				});
				esq.addColumn("UsrDescription");
				esq.addColumn("UsrCategory");
				esq.addColumn("UsrDocumentType.Name", "DocumentTypeName");

				esq.getEntity(this.get("Id"), function(result) {
					if (!result.success || !result.entity) {
						return;
					}
					var category = result.entity.get("UsrCategory");
					this.set("UsrInfoText",
						result.entity.get("DocumentTypeName") + " / " +
						(category ? category.displayValue : ""));
				}, this);
			},

			// The 20 newest detail rows of this record.
			loadLatestRows: function(callback) {
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", {
					rootSchemaName: "UsrMyDetailEntity"
				});
				esq.rowCount = 20;
				var createdOn = esq.addColumn("CreatedOn");
				createdOn.orderPosition = 0;
				createdOn.orderDirection = Terrasoft.OrderDirection.DESC;
				esq.addColumn("UsrAmount");
				esq.filters.addItem(esq.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", this.get("Id")));

				esq.getEntityCollection(function(result) {
					var total = 0;
					if (result.success) {
						result.collection.each(function(row) {
							total += row.get("UsrAmount") || 0;
						});
					}
					callback.call(this, total, result.success ? result.collection.getCount() : 0);
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
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
				// One record by id, with a joined caption (was esq.getEntity).
				request: "usr.LoadRecordInfoRequest",
				handler: async (request, next) => {
					if (await request.$context.getPrimaryModelMode() === "create") {
						return next?.handle(request);
					}
					const recordId = await request.$context.PDS_Id_a1b2c3d;
					const model = await sdk.Model.create("UsrMyEntity");
					try {
						const records = await model.load({
							attributes: [
								"UsrDescription",
								"UsrCategory",
								// The alias lives in the attribute itself.
								{ name: "DocumentTypeName", path: "UsrDocumentType.Name" }
							],
							parameters: [{
								type: sdk.ModelParameterType.PrimaryColumnValue,
								value: recordId
							}]
						});
						const record = records[0];
						if (record) {
							request.$context.UsrInfoText = record.DocumentTypeName + " / " +
								(record.UsrCategory?.displayValue || "");
						}
					} catch (e) {
						// There is no result.success: a failed load rejects.
						console.error(e);
					}
					return next?.handle(request);
				}
			},
			{
				// The 20 newest detail rows (was rowCount + orderDirection).
				request: "usr.LoadLatestRowsRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.PDS_Id_a1b2c3d;

					// Build the group first: the add call returns void.
					const filter = new sdk.FilterGroup();
					filter.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Equal, "UsrMyEntity", recordId);

					const model = await sdk.Model.create("UsrMyDetailEntity");
					const rows = await model.load({
						attributes: ["CreatedOn", "UsrAmount"],
						parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }],
						options: {
							pagingConfig: { rowsOffset: 0, rowCount: 20 },
							sortingConfig: { columns: [{ columnName: "CreatedOn", direction: "desc" }] }
						}
					});

					let total = 0;
					for (const row of rows) {
						total += Number(row.UsrAmount) || 0;
					}
					request.$context.UsrLatestTotal = total;
					request.$context.UsrLatestCount = rows.length;
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
