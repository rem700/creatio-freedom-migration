// --- How to migrate asyncValidate to Freedom UI --------------------------------
// Classic UI runs server-dependent checks before saving in asyncValidate(callback,
// scope): callParent with a wrapper, check validateResponse(response), chain the
// checks with Terrasoft.chain, and call back with { success: false, message } to
// stop the save. Freedom UI has no asyncValidate. The same checks go into a
// crt.SaveRecordRequest handler BEFORE `await next?.handle(request)`: await each
// query in sequence, and return without calling next to stop the save.
//
// API MAP
//   asyncValidate(callback, scope)          ->  handler "crt.SaveRecordRequest", before next
//   this.callParent([wrapper, this])        ->  (nothing: field validators run inside next)
//   this.validateResponse(response)         ->  (nothing: a failed field validator makes next
//                                               resolve falsy and the platform shows the error
//                                               - observed)
//   Terrasoft.chain(fn1, fn2, ..., this)    ->  sequential `await` statements
//   callback.call(scope, { success: false,  ->  show a message, `return false;` (next not called)
//     message: msg })
//   callback.call(scope, response)          ->  return await next?.handle(request)
//   Ext.create("Terrasoft.EntitySchemaQuery") -> await sdk.Model.create("UsrMyDetailEntity")
//   esq.getEntityCollection(cb, this)       ->  await model.load({ attributes, parameters })
//   result.collection.getCount()            ->  records.length
//   this.get("Id")                          ->  await request.$context.Id
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Order changes: Classic ran the base (field) validation first and your
//     async checks only when it passed. In the save handler your checks run
//     BEFORE next, i.e. before field validators. Cheap field errors may be
//     hidden behind your query's message; check required inputs first.
//   - A validator with "async": true exists in the validators section, but
//     Academy documents only the flag, not the contract of an async validator.
//     For a query-based check at save time the save handler is the documented
//     route.
//   - A brand-new record has no rows in related entities yet; a "detail must
//     have rows" check on create needs to read the list attribute on the page
//     instead of the database.
//   - Report failure with a message (crt.NotificationRequest or
//     crt.ShowDialogRequest); there is no response object to carry it.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Keeping the callback style inside the async handler (calling model.load
//   without await and "calling back" from .then) lets the handler return
//   before the check finishes: next has already been called, the record is
//   saved, and the failed check is ignored.
//   Building the filter as `value: new sdk.FilterGroup().addSchemaColumnFilter
//   WithParameter(...)` passes undefined (the method returns void): the query
//   counts every row in the table and the check always passes.
//
// See: Recipes/Lifecycle/HowToMigrateSaveOverride.js
// See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model.create, Model.load, FilterGroup)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			asyncValidate: function(callback, scope) {
				this.callParent([function(response) {
					if (!this.validateResponse(response)) {
						return;
					}
					Terrasoft.chain(
						function(next) {
							this.validateDetailHasRows(function(stepResponse) {
								if (this.validateResponse(stepResponse)) {
									next();
								}
							}, this);
						},
						function() {
							callback.call(scope, response);
						},
						this);
				}, this]);
			},

			validateDetailHasRows: function(callback, scope) {
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", {
					rootSchemaName: "UsrMyDetailEntity"
				});
				esq.addColumn("Id");
				esq.filters.addItem(esq.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", this.get("Id")));
				esq.getEntityCollection(function(result) {
					if (result.success && result.collection.getCount() === 0) {
						callback.call(scope, {
							success: false,
							message: this.get("Resources.Strings.DetailRowRequiredMessage")
						});
						return;
					}
					callback.call(scope, { success: true });
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	// The former validateDetailHasRows, as an awaited helper. true = passes.
	async function detailHasRows(recordId) {
		const model = await sdk.Model.create("UsrMyDetailEntity");
		const filter = new sdk.FilterGroup();
		// Returns void: build first, then pass the variable.
		filter.addSchemaColumnFilterWithParameter(
			sdk.ComparisonType.Equal, "UsrMyEntity", recordId);
		const records = await model.load({
			attributes: ["Id"],
			parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
		});
		return records.length > 0;
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.Id;

					// Was Terrasoft.chain: each check awaited in turn.
					if (!(await detailHasRows(recordId))) {
						await request.$context.executeRequest({
							type: "crt.NotificationRequest",
							$context: request.$context,
							message: await request.$context.Resources.Strings.DetailRowRequiredMessage
						});
						// Was callback({ success: false }): next is not called.
						return false;
					}

					// Was callback.call(scope, response): continue the save.
					return await next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
