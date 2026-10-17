// --- How to avoid slow async patterns after porting to Freedom UI (await in loops, Promise.all, reloads) ---
// Classic UI page code was mostly synchronous: this.get() returned a value at
// once, ESQ callbacks started as soon as the query was sent (two queries sent
// one after another ran in parallel), and a detail was refreshed with one
// updateDetail call. A line-by-line port to Freedom UI turns each of those
// into an `await`, and the page gets slower without any error: network calls
// wait for each other, a lookup is loaded on every attribute change (also
// while the page itself is loading), a list is reloaded after every single
// row, and queries fetch columns nobody reads. This recipe shows the same
// task on both sides and where the time goes.
//
// API MAP
//   this.get("A"), this.get("B") (sync, free)
//                                  ->  await request.$context.PDS_A_x, ... - local, cheap
//                                      (observed: no network call); read once per handler,
//                                      not once per loop iteration
//   two ESQ.getEntityCollection(...) sent back to back (parallel by nature)
//                                  ->  const [a, b] = await Promise.all([modelA.load(...),
//                                          modelB.load(...)])  - NOT two awaits in a row
//   ESQ per row inside a loop (rare in Classic: callbacks discouraged it)
//                                  ->  ONE load with an IN filter:
//                                      filter.addSchemaColumnInFilterWithParameters(
//                                          sdk.ComparisonType.Equal, "Id", ids)
//   esq.addColumn("UsrCreditLimit") only
//                                  ->  load({ attributes: ["UsrCreditLimit"], ... }); always
//                                      list attributes
//   dependencies: [{ columns: ["UsrAccount"], methodName }]
//                                  ->  crt.HandleViewModelAttributeChangeRequest guarded by
//                                      attributeName AND value !== oldValue
//   this.updateDetail({ detail }) once after a batch
//                                  ->  ONE crt.LoadDataRequest { loadType: "reload" } after the
//                                      loop, never inside it
//   Terrasoft.BatchQuery for N writes
//                                  ->  a transaction; See: Recipes/Data/HowToMigrateBatchQuery.js
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Classic callbacks were "fire and forget": code after esq.getEntity()
//     ran at once and the queries overlapped. `await` makes every line wait.
//     Independent calls must be started first and awaited together.
//   - Promise.all fails fast: one rejected load rejects the whole call. Use
//     Promise.allSettled when the page can show partial data.
//   - The attribute change request fires for values set while the page
//     loads, not only for user edits (see the Pitfalls recipe). A load in that
//     handler without a guard runs once per field on every page open.
//   - Model.load without `attributes`: what it returns is not documented in
//     the typings. Name the columns; it is also what the next developer reads.
//   - sdk.Model.create(...) is async too. Create the model once per handler
//     call, outside any loop.
//   - Debouncing (wait until the user stops typing before a server call) has
//     no Freedom UI helper; a setTimeout guard in the handler is plain
//     JavaScript. Mind that the page may be closed when it fires.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Nothing fails. `for (const id of ids) { await model.load(...) }` returns
//   the right data N times slower; a crt.LoadDataRequest reload inside the loop
//   re-queries the whole list N times; `await` on two unrelated loads doubles
//   the wait. The Network tab shows it: count the DataService requests for one
//   user action (See: Recipes/Strategy/HowToDebugMigratedFreedomPage.js).
//
// See: Recipes/Data/HowToMigrateEsqQueries.js
// See: Recipes/Pitfalls/MigrationPitfalls.js
// Applies: Classic UI 7.x; Freedom UI 8.1+ (Model.load options/attributes; loadOptions deprecated since devkit 0.813.0)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/data-sources/crud-operations/references/model-class-js
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model.create/load, FilterGroup.addSchemaColumnInFilterWithParameters, HandleViewModelAttributeChangeRequest.value/oldValue)
// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrAccount": {
				dependencies: [{ columns: ["UsrAccount"], methodName: "onAccountChanged" }]
			}
		},
		methods: {
			// 1. Several page values: synchronous, free.
			recalculateTotal: function() {
				var total = 0;
				Terrasoft.each(["UsrAmount", "UsrTax", "UsrShipping"], function(name) {
					total += this.get(name) || 0;
				}, this);
				this.set("UsrTotal", total);
			},

			// 2. One lookup read with ONE column on change.
			onAccountChanged: function() {
				var account = this.get("UsrAccount");
				if (!account) {
					return;
				}
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "Account" });
				esq.addColumn("UsrCreditLimit");
				esq.getEntity(account.value, function(result) {
					if (result.success && result.entity) {
						this.set("UsrCreditLimit", result.entity.get("UsrCreditLimit"));
					}
				}, this);
			},

			// 3. Two independent reads: both are sent at once, callbacks overlap.
			loadSummary: function() {
				var id = this.get("Id");
				var tasks = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "Activity" });
				tasks.addColumn("Id");
				tasks.filters.add("ByEntity", tasks.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", id));
				tasks.getEntityCollection(function(r) {
					this.set("UsrTaskCount", r.success ? r.collection.getCount() : 0);
				}, this);

				var lines = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "UsrMyDetailEntity" });
				lines.addColumn("UsrAmount");
				lines.filters.add("ByEntity", lines.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", id));
				lines.getEntityCollection(function(r) {
					var sum = 0;
					if (r.success) {
						r.collection.each(function(row) { sum += row.get("UsrAmount") || 0; });
					}
					this.set("UsrLinesTotal", sum);
				}, this);
			},

			// 4. Names of several related records: one query with an IN filter,
			// then ONE detail refresh.
			loadRelatedNames: function(relatedIds) {
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "UsrRelatedEntity" });
				esq.addColumn("Name");
				esq.filters.add("ByIds", Terrasoft.createColumnInFilterWithParameters("Id", relatedIds));
				esq.getEntityCollection(function(r) {
					var names = [];
					if (r.success) {
						r.collection.each(function(row) { names.push(row.get("Name")); });
					}
					this.set("UsrRelatedNames", names.join(", "));
					this.updateDetail({ detail: "UsrMyDetail" });
				}, this);
			}
		}
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	const byMaster = (column, id) => {
		const filter = new sdk.FilterGroup();
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, column, id);
		return filter;
	};

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					const ctx = request.$context;

					// 1. Page values: read each ONCE, in parallel. Cheap either
					// way; the point is not to re-read them per iteration.
					if (["PDS_UsrAmount_a1b2c3d", "PDS_UsrTax_b2c3d4e", "PDS_UsrShipping_c3d4e5f"]
							.includes(request.attributeName)) {
						const values = await Promise.all([
							ctx.PDS_UsrAmount_a1b2c3d, ctx.PDS_UsrTax_b2c3d4e, ctx.PDS_UsrShipping_c3d4e5f
						]);
						ctx.PDS_UsrTotal_d4e5f6a = values.reduce((sum, v) => sum + (Number(v) || 0), 0);
					}

					// 2. Lookup read: only for THIS attribute, only on a real
					// change, only the column you need.
					if (request.attributeName === "PDS_UsrAccount_e5f6a7b" &&
							request.value?.value !== request.oldValue?.value) {
						const accountId = request.value?.value;
						if (accountId) {
							const accountModel = await sdk.Model.create("Account");
							const rows = await accountModel.load({
								attributes: ["UsrCreditLimit"],
								parameters: [{ type: sdk.ModelParameterType.PrimaryColumnValue, value: accountId }]
							});
							ctx.PDS_UsrCreditLimit_f6a7b8c = rows[0]?.UsrCreditLimit ?? null;
						}
					}
					return next?.handle(request);
				}
			},
			{
				request: "usr.LoadSummaryRequest",
				handler: async (request, next) => {
					const id = await request.$context.PDS_Id_a7b8c9d;

					// 3. Independent reads: start both, await together.
					// SLOW port: const tasks = await ...; const lines = await ...;
					const [activityModel, lineModel] = await Promise.all([
						sdk.Model.create("Activity"),
						sdk.Model.create("UsrMyDetailEntity")
					]);
					const [tasks, lines] = await Promise.all([
						activityModel.load({
							attributes: ["Id"],
							parameters: [{ type: sdk.ModelParameterType.Filter, value: byMaster("UsrMyEntity", id) }]
						}),
						lineModel.load({
							attributes: ["UsrAmount"],
							parameters: [{ type: sdk.ModelParameterType.Filter, value: byMaster("UsrMyEntity", id) }]
						})
					]);
					// For large sets count on the server instead (a process or
					// service); loading Ids only to count them grows with the data.
					request.$context.UsrTaskCount = tasks.length;
					request.$context.UsrLinesTotal = lines.reduce((sum, row) => sum + (Number(row.UsrAmount) || 0), 0);
					return next?.handle(request);
				}
			},
			{
				request: "usr.LoadRelatedNamesRequest",
				handler: async (request, next) => {
					// Passed as a property of the request (executeRequest or "params").
					const relatedIds = request.relatedIds || [];
					if (relatedIds.length) {
						// 4. ONE query with IN, not one load per id inside a loop.
						const model = await sdk.Model.create("UsrRelatedEntity");
						const filter = new sdk.FilterGroup();
						filter.addSchemaColumnInFilterWithParameters(sdk.ComparisonType.Equal, "Id", relatedIds);
						const rows = await model.load({
							attributes: ["Name"],
							parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
						});
						request.$context.UsrRelatedNames = rows.map(row => row.Name).join(", ");

						// ONE reload after the work, never inside a loop.
						await request.$context.executeRequest({
							type: "crt.LoadDataRequest",
							$context: request.$context,
							config: { loadType: "reload", useLastLoadParameters: true },
							dataSourceName: "GridDetail_b8c9d0eDS"
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
