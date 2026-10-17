// --- How to migrate Terrasoft.BatchQuery to Freedom UI -----------------------
// Classic UI packs several Insert / Update / Delete queries (and ESQ reads)
// into one round trip with Terrasoft.BatchQuery: bq.add(query) per query, then
// bq.execute(callback, scope) with one success flag and per-query
// queryResults. Freedom UI has no batch object. The closest replacement for
// the WRITES is a transaction: sdk.TransactionFactoryService.create(), then
// model.insertInTransaction / updateInTransaction / deleteInTransaction to
// queue operations, and transaction.commit() to send them together.
//
// API MAP
//   Ext.create("Terrasoft.BatchQuery")       ->  const tx = await sdk.TransactionFactoryService.create()
//   bq.add(insertQuery)                      ->  model.insertInTransaction(tx, dto)          // NOT awaited
//   bq.add(updateQuery)                      ->  model.updateInTransaction(tx, dto, parameters)
//   bq.add(deleteQuery)                      ->  model.deleteInTransaction(tx, parameters)
//   bq.execute(cb, scope)                    ->  await tx.commit()
//   response.success === false               ->  commit() rejects; call tx.rollback()
//   response.queryResults[i]                 ->  operation.asyncResult (resolves after commit)
//   bq.add(esq) for reads                    ->  no transactional read: await Promise.all(
//                                                    [modelA.load(...), modelB.load(...)])
//   Terrasoft.MaskHelper.ShowBodyMask()      ->  await new sdk.MaskService().showBodyMask()
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - SEMANTICS CHANGE: a Classic batch is NOT a transaction - a partial
//     failure leaves some rows written (observed). A Freedom transaction is all or
//     nothing. Code that relied on "the other rows still got saved" changes
//     behaviour.
//   - Version: TransactionFactoryService was added in @creatio-devkit/common
//     0.831.0. Check the devkit version your Creatio ships; on older 8.x the
//     closest route is one awaited call per write (N requests, no atomicity)
//     or moving the work to a business process / configuration service.
//   - Reads cannot join a transaction; batch them with Promise.all (still N
//     requests, run in parallel).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Treating *InTransaction like model.insert: awaiting it does nothing
//   useful, and forgetting commit() loses every change without an error - the
//   operations only queue until commit. `await model.insertInTransaction(...)`
//   gets a plain ITransactionOperation (not a Promise, per the typings) and
//   returns at once. Empty FilterGroups in queued
//   update/delete still mean "every row" (observed).
//
// See: Recipes/Data/HowToMigrateInsertUpdateDelete.js
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: TransactionFactoryService, ITransaction, Model.*InTransaction; CHANGELOG 0.831.0)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/ (Terrasoft.BatchQuery)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			// Replace the link rows of this record in one request.
			replaceLinks: function(relatedIds) {
				var recordId = this.get("Id");
				var bq = Ext.create("Terrasoft.BatchQuery");

				var del = Ext.create("Terrasoft.DeleteQuery", { rootSchemaName: "UsrRelatedInMyEntity" });
				del.filters.add("Master", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", recordId));
				bq.add(del);

				relatedIds.forEach(function(relatedId) {
					var insert = Ext.create("Terrasoft.InsertQuery", { rootSchemaName: "UsrRelatedInMyEntity" });
					insert.setParameterValue("UsrMyEntity", recordId, Terrasoft.DataValueType.GUID);
					insert.setParameterValue("UsrRelatedEntity", relatedId, Terrasoft.DataValueType.GUID);
					bq.add(insert);
				});

				Terrasoft.MaskHelper.ShowBodyMask();
				bq.execute(function(response) {
					Terrasoft.MaskHelper.HideBodyMask();
					if (!response.success) {
						// Some of the queries may already be applied.
						this.showInformationDialog(response.errorInfo.message);
						return;
					}
					this.updateDetail({ detail: "UsrMyDetail" });
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
				request: "usr.ReplaceLinksRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.PDS_Id_a1b2c3d;
					const relatedIds = request.relatedIds || [];

					const model = await sdk.Model.create("UsrRelatedInMyEntity");
					const tx = await sdk.TransactionFactoryService.create();

					const masterFilter = new sdk.FilterGroup();
					masterFilter.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Equal, "UsrMyEntity", recordId);

					// Queue only - no await, nothing is sent yet.
					model.deleteInTransaction(tx, [{ type: sdk.ModelParameterType.Filter, value: masterFilter }]);
					for (const relatedId of relatedIds) {
						model.insertInTransaction(tx, {
							UsrMyEntity: recordId,
							UsrRelatedEntity: relatedId
						});
					}

					const maskService = new sdk.MaskService();
					await maskService.showBodyMask();
					try {
						await tx.commit();      // all or nothing
					} catch (e) {
						await tx.rollback();
						console.error(e);
						return next?.handle(request);
					} finally {
						await maskService.hideBodyMask();
					}

					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "GridDetail_a1b2c3dDS"
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
