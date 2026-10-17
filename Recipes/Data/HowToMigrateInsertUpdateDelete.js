// --- How to migrate InsertQuery / UpdateQuery / DeleteQuery to Freedom UI ----
// Classic UI writes records with three query classes created by Ext.create:
// Terrasoft.InsertQuery, Terrasoft.UpdateQuery and Terrasoft.DeleteQuery. Values
// go in with setParameterValue(column, value, Terrasoft.DataValueType.X), rows
// are picked with query.filters, and execute(callback, scope) reports
// { success, errorInfo, id }. Freedom UI uses one object for all three:
// `await sdk.Model.create("<Entity>")`, then model.insert(dto),
// model.update(dto, parameters) and model.delete(parameters). Each returns a
// promise of { success, rowsAffected, errorInfo? }.
//
// API MAP
//   Ext.create("Terrasoft.InsertQuery", { rootSchemaName: "X" })
//                                            ->  const model = await sdk.Model.create("X")
//   q.setParameterValue("UsrName", v, Terrasoft.DataValueType.TEXT)
//                                            ->  dto: { UsrName: v }          // no type argument
//   lookup: setParameterValue("UsrAccount", id, DataValueType.GUID)
//                                            ->  { UsrAccount: id }           // bare Guid
//   insertQuery.execute(cb, scope)           ->  await model.insert(dto)
//   update.filters.add("Id", ... EQUAL "Id" ...); update.execute(cb)
//                                            ->  await model.update(dto, [{ type:
//                                                    sdk.ModelParameterType.PrimaryColumnValue, value: id }])
//   delete by filter; execute(cb)            ->  await model.delete([{ type:
//                                                    sdk.ModelParameterType.Filter, value: group }])
//   response.success / response.errorInfo    ->  result.success / result.errorInfo (a string)
//   response.id (new record id)              ->  not in the typed result; send your own Id
//                                                in the dto when you need it afterwards
//                                                (@creatio/base types an internal
//                                                ɵDataSourceInsertResult { primaryAttributes },
//                                                but Model.insert is typed DataSourceSaveResult)
//   this.updateDetail({ detail: "UsrMyDetail" })
//                                            ->  executeRequest crt.LoadDataRequest for the
//                                                list's data source (loadType "reload")
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - No DataValueType: the model knows the schema. A lookup is written as the
//     bare Guid, never as { value, displayValue }, in both generations.
//   - Freedom writes go through the same rights and entity validation as the
//     page; Classic queries did too. Neither runs the PAGE's validators.
//   - model.canSave(...) / canDelete(...) exist to ask first; Classic had no
//     client equivalent.
//   - Each call is a separate request and commit. Several writes that must
//     succeed together: See: Recipes/Data/HowToMigrateBatchQuery.js
//   - Sending an Id in the insert dto to know the new id afterwards is
//     observed to work; the devkit typings only promise { success,
//     rowsAffected }. The base typings' ɵDataSourceInsertResult adds
//     primaryAttributes, which is not part of the public Model.insert type.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   An UpdateQuery / DeleteQuery without filters hits EVERY row of the table;
//   so does a Freedom update/delete whose FilterGroup ended up empty (observed;
//   an empty id list, or `value: new sdk.FilterGroup().add...()` which is
//   undefined).
//   Prefer PrimaryColumnValue for one row and guard filter lists for zero
//   items. Also: the page does not refresh by itself - without a reload the
//   user keeps seeing old values and may save them back over your change.
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model.insert/update/delete, DataSourceSaveResult)
// Source: https://www.npmjs.com/package/@creatio/base (typings: ɵDataSourceInsertResult)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/ (Terrasoft.InsertQuery, UpdateQuery, DeleteQuery)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const RowStateDone = "6f2a9c41-1b3e-4d7a-8c55-2e0f7a9b3c01";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			addDetailRow: function(comment) {
				var insert = Ext.create("Terrasoft.InsertQuery", { rootSchemaName: "UsrMyDetailEntity" });
				insert.setParameterValue("UsrMyEntity", this.get("Id"), Terrasoft.DataValueType.GUID);
				insert.setParameterValue("UsrComment", comment || "", Terrasoft.DataValueType.TEXT);
				insert.execute(function(response) {
					if (!response.success) {
						this.showInformationDialog(response.errorInfo.message);
						return;
					}
					this.set("UsrLastInsertedRowId", response.id);
					this.updateDetail({ detail: "UsrMyDetail" });
				}, this);
			},

			setRowDone: function(rowId) {
				var update = Ext.create("Terrasoft.UpdateQuery", { rootSchemaName: "UsrMyDetailEntity" });
				update.setParameterValue("UsrState", RowStateDone, Terrasoft.DataValueType.GUID);
				// Never omit: no filter = every row.
				update.filters.add("IdFilter", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "Id", rowId));
				update.execute(function(response) {
					if (response.success) {
						this.updateDetail({ detail: "UsrMyDetail" });
					}
				}, this);
			},

			removeRows: function(rowIds) {
				if (!rowIds.length) {
					return;
				}
				var del = Ext.create("Terrasoft.DeleteQuery", { rootSchemaName: "UsrMyDetailEntity" });
				del.filters.add("Ids", Terrasoft.createColumnInFilterWithParameters("Id", rowIds));
				del.execute(function(response) {
					if (response.success) {
						this.updateDetail({ detail: "UsrMyDetail" });
					}
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const RowStateDone = "6f2a9c41-1b3e-4d7a-8c55-2e0f7a9b3c01";

	async function reloadDetail(request) {
		await request.$context.executeRequest({
			type: "crt.LoadDataRequest",
			$context: request.$context,
			config: { loadType: "reload", useLastLoadParameters: true },
			dataSourceName: "GridDetail_a1b2c3dDS"
		});
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.AddDetailRowRequest",
				handler: async (request, next) => {
					const masterId = await request.$context.PDS_Id_a1b2c3d;
					const model = await sdk.Model.create("UsrMyDetailEntity");
					// Own Id, because the typed result does not return the new one.
					const newId = crypto.randomUUID();
					const result = await model.insert({
						Id: newId,
						UsrMyEntity: masterId,          // bare Guid
						UsrComment: request.comment || ""
					});
					if (!result?.success) {
						console.error(result?.errorInfo);
						return next?.handle(request);
					}
					request.$context.UsrLastInsertedRowId = newId;
					await reloadDetail(request);
					return next?.handle(request);
				}
			},
			{
				request: "usr.SetRowDoneRequest",
				handler: async (request, next) => {
					const model = await sdk.Model.create("UsrMyDetailEntity");
					// PrimaryColumnValue: exactly one row, no filter to forget.
					const result = await model.update(
						{ UsrState: RowStateDone },
						[{ type: sdk.ModelParameterType.PrimaryColumnValue, value: request.recordId }]
					);
					if (result?.success && result.rowsAffected > 0) {
						await reloadDetail(request);
					}
					return next?.handle(request);
				}
			},
			{
				request: "usr.RemoveRowsRequest",
				handler: async (request, next) => {
					const rowIds = request.rowIds || [];
					// An empty Id list would build an empty group = every row.
					if (!rowIds.length) {
						return next?.handle(request);
					}
					const filter = new sdk.FilterGroup();
					filter.addPrimarySchemaColumnInFilter(rowIds);

					const model = await sdk.Model.create("UsrMyDetailEntity");
					const result = await model.delete([{ type: sdk.ModelParameterType.Filter, value: filter }]);
					if (result?.success) {
						await reloadDetail(request);
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
