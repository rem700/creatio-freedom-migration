// --- How to migrate detail <-> page messaging (GetColumnsValues, UpdateCardProperty) ---
// In Classic UI a detail is a separate module with its own view model, so it
// talks to its page through stock sandbox messages tagged with the detail's
// sandbox id: GetColumnsValues reads page columns, UpdateCardProperty writes
// one, GetCardState asks for the card mode, and the page refreshes the detail
// with this.updateDetail({ detail: "<key>" }). In Freedom UI the list is part
// of the PAGE: its rows, the page fields and your handlers share one
// request.$context. There is nothing to publish - read and write attributes
// directly, and reload the list's data source with crt.LoadDataRequest.
//
// API MAP
//   this.sandbox.publish("GetColumnsValues", ["UsrStatus"], [this.sandbox.id])
//                                            ->  await request.$context.PDS_UsrStatus_a1b2c3d
//   this.sandbox.publish("UpdateCardProperty", { key: "UsrTotal", value: v }, [this.sandbox.id])
//                                            ->  request.$context.PDS_UsrTotal_b2c3d4e = v
//   this.sandbox.publish("GetCardState", ...) ->  await request.$context.getPrimaryModelMode()
//                                                ("create" | "update" once loaded, "init" while
//                                                loading; verified on Creatio 10.1.796, tools/verify)
//   "SaveRecord" message to the page         ->  executeRequest crt.SaveRecordRequest { preventCardClose: true }
//   page: this.updateDetail({ detail: "UsrMyDetail" })
//                                            ->  executeRequest crt.LoadDataRequest
//                                                { dataSourceName: "GridDetail_xDS", config: { loadType: "reload" } }
//   detail: this.getGridData().each(...)     ->  for (const row of await request.$context.GridDetail_x)
//                                                    await row.GridDetail_xDS_UsrAmount
//   "DetailChanged" / onGridDataLoaded hooks ->  rows.registerOnCollectionChangeCallback(cb)
//                                                (devkit 0.832.0+), or handle crt.LoadDataRequest
//   custom detail<->page message             ->  a usr.* request handled on the same page; between
//                                                SEPARATE pages: sdk.MessageChannelService
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Page columns are not read by column name: use the page's generated
//     attribute ("PDS_UsrStatus_a1b2c3d"). Read it off the schema.
//   - Every $context read is async; Classic publish returned synchronously.
//   - Writing a page attribute marks the page as changed, exactly like
//     UpdateCardProperty; the value reaches the database only on save.
//   - A record page opened FROM a list row is a separate page with its own
//     $context. When it closes, reload the list; it is not refreshed for you
//     in every case (observed).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Porting the column name as the attribute (`request.$context.UsrStatus`)
//   reads an attribute that does not exist: undefined, no error, and a check
//   like "status is closed" never fires. Forgetting await on a row cell sums
//   Promises into "[object Promise]" or NaN.
//
// See: Recipes/Lists/HowToMigrateDetailToList.js
// Applies: Creatio 8.1+ (registerOnCollectionChangeCallback needs @creatio-devkit/common 0.832.0+); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/references/basedetailv2
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: ViewModelCollection, CHANGELOG 0.832.0)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyDetail", [], function() {

	const StatusClosed = "a4b5c6d7-e8f9-4a0b-8c1d-2e3f4a5b6c01";

	return {
		entitySchemaName: "UsrMyDetailEntity",
		methods: {

			// Read page columns at the moment they matter.
			addRecord: function() {
				var master = this.sandbox.publish("GetColumnsValues",
					["UsrStatus"], [this.sandbox.id]) || {};
				if (master.UsrStatus && master.UsrStatus.value === StatusClosed) {
					this.showInformationDialog(this.get("Resources.Strings.CannotAddToClosedRecordMessage"));
					return;
				}
				this.callParent(arguments);
			},

			// Push a total into the page model.
			onRecalculateClick: function() {
				var total = 0;
				this.getGridData().each(function(row) {
					total += row.get("UsrAmount") || 0;
				}, this);
				this.sandbox.publish("UpdateCardProperty",
					{ key: "UsrTotal", value: total }, [this.sandbox.id]);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	const StatusClosed = "a4b5c6d7-e8f9-4a0b-8c1d-2e3f4a5b6c01";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// The list's add button sends crt.CreateRecordRequest; gate it here.
				request: "crt.CreateRecordRequest",
				handler: async (request, next) => {
					if (request.entityName !== "UsrMyDetailEntity") {
						return next?.handle(request);
					}
					// Was GetColumnsValues: same page, read the attribute.
					const status = await request.$context.PDS_UsrStatus_a1b2c3d;
					if (status?.value === StatusClosed) {
						await request.$context.executeRequest({
							type: "crt.ShowDialogRequest",
							$context: request.$context,
							dialogConfig: {
								data: {
									message: await request.$context.Resources.Strings.CannotAddToClosedRecordMessage,
									actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
								}
							}
						});
						return;
					}
					return next?.handle(request);
				}
			},
			{
				request: "usr.RecalculateTotalRequest",
				handler: async (request, next) => {
					const rows = await request.$context.GridDetail_k7m2p9q;
					let total = 0;
					for (const row of (rows || [])) {
						total += Number(await row.GridDetail_k7m2p9qDS_UsrAmount) || 0;
					}
					// Was UpdateCardProperty: write the page attribute.
					request.$context.PDS_UsrTotal_b2c3d4e = total;
					return next?.handle(request);
				}
			},
			{
				// Was page onSaved + updateDetail.
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "GridDetail_k7m2p9qDS"
					});
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
