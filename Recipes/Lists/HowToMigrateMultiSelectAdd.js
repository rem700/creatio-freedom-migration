// --- How to migrate LookupMultiAddMixin (bulk add to a detail) to Freedom UI ---
// Classic UI turns a many-to-many detail's "+" into a multi-select lookup with
// Terrasoft.LookupMultiAddMixin: mixin + init, addRecord() calling
// openLookupWithMultiSelect(true), getMultiSelectLookupConfig() describing the
// link table, and onCardSaved() to reopen the window after the mixin saved a
// new master. The mixin then inserts the link rows itself. Freedom UI has no
// mixin: a button sends a custom request, the handler opens the picker with
// crt.OpenLookupPageRequest (features.select.multiple = true) and writes the
// link rows itself with sdk.Model in afterClosed, then reloads the list.
//
// API MAP
//   mixins: { LookupMultiAddMixin: "Terrasoft.LookupMultiAddMixin" }
//                                            ->  nothing; one handler does the whole flow
//   openLookupWithMultiSelect(true)          ->  executeRequest({ type: "crt.OpenLookupPageRequest",
//                                                    entitySchemaName: "UsrRelatedEntity",
//                                                    features: { select: { multiple: true,
//                                                        resultType: "lookupValues" } }, afterClosed })
//   getMultiSelectLookupConfig().relatedEntitySchemaName
//                                            ->  entitySchemaName of the request
//   rootColumnName / relatedColumnName       ->  the dto keys of model.insert({ UsrMyEntity, UsrRelatedEntity })
//   (the mixin inserts the link rows)        ->  YOU insert them: sdk.Model.create("UsrRelatedInMyEntity")
//   "true" = save a new master first         ->  getPrimaryModelMode() === "create" ->
//                                                crt.SaveRecordRequest { preventCardClose: true }
//   onCardSaved() reopening the window       ->  not needed: the same handler continues after save
//   getAdditionalLookupFilters()             ->  filtersConfig: { filterAttributes, attributesConfig }
//   reload after adding                      ->  crt.LoadDataRequest for the list's data source
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Everything the mixin did implicitly is now explicit: saving the new
//     master, inserting the links, refreshing the list.
//   - afterClosed is not called on cancel, and its array can still be empty;
//     guard both.
//   - Nothing skips records that are ALREADY linked. Load the existing links
//     and filter them out, or a unique index on the link table will reject the
//     insert (and without one you get duplicates).
//   - One model.insert per row = one request per row. For dozens of rows queue
//     them in a transaction. See: Recipes/Data/HowToMigrateBatchQuery.js
//   - The picker's own filter (filtersConfig) only narrows the window; it is
//     not the crt.LoadDataRequest route used for lookup fields.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Skipping the "save the master first" step: on a new record the Id already
//   exists on the client, so an `if (!id)` guard passes, the inserts fail on
//   the foreign key (or are rejected) and the list stays empty - nothing is
//   shown unless you check each insert's `success`. Writing `item` instead of
//   `item.value` into the lookup column sends an object, not the Guid.
//
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/examples/implement-the-bulk-addition-of-records
// Source: https://community.creatio.com/questions/filter-crtopenlookuppagerequest
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model.insert, FilterGroup)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyDetail", ["LookupMultiAddMixin", "ConfigurationEnums"], function(LookupMultiAddMixin, ConfigurationEnums) {
	return {
		entitySchemaName: "UsrRelatedInMyEntity",
		mixins: {
			LookupMultiAddMixin: "Terrasoft.LookupMultiAddMixin"
		},
		attributes: {
			"UsrIsMultiAddPending": {
				dataValueType: Terrasoft.DataValueType.BOOLEAN,
				type: Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				value: false
			}
		},
		methods: {
			init: function() {
				this.callParent(arguments);
				this.mixins.LookupMultiAddMixin.init.call(this);
			},

			addRecord: function() {
				var cardState = this.sandbox.publish("GetCardState", null, [this.sandbox.id]);
				this.set("UsrIsMultiAddPending", !!cardState && (
					cardState.state === ConfigurationEnums.CardStateV2.ADD ||
					cardState.state === ConfigurationEnums.CardStateV2.COPY));
				this.openLookupWithMultiSelect(true);
			},

			onCardSaved: function() {
				this.callParent(arguments);
				if (this.get("UsrIsMultiAddPending")) {
					this.set("UsrIsMultiAddPending", false);
					this.openLookupWithMultiSelect();
				}
			},

			getMultiSelectLookupConfig: function() {
				return {
					rootEntitySchemaName: "UsrMyEntity",
					rootColumnName: "UsrMyEntity",
					relatedEntitySchemaName: "UsrRelatedEntity",
					relatedColumnName: "UsrRelatedEntity"
				};
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrAddRelatedButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrAddRelatedButton_caption)#",
					"iconPosition": "only-text",
					"clicked": { "request": "usr.AddRelatedRecordsRequest" }
				},
				"parentName": "GridDetailToolsContainer_r4s5t6u",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.AddRelatedRecordsRequest",
				handler: async (request, next) => {
					// What openLookupWithMultiSelect(true) did: save a new master first.
					if (await request.$context.getPrimaryModelMode() === "create") {
						const saved = await request.$context.executeRequest({
							type: "crt.SaveRecordRequest",
							$context: request.$context,
							preventCardClose: true
						});
						if (!saved) {
							return next?.handle(request);
						}
					}
					const masterId = await request.$context.PDS_Id_a1b2c3d;

					await request.$context.executeRequest({
						type: "crt.OpenLookupPageRequest",
						$context: request.$context,
						entitySchemaName: "UsrRelatedEntity",
						features: {
							select: { multiple: true, selectAll: false, resultType: "lookupValues" },
							create: { enabled: false }
						},
						afterClosed: async (selectedItems) => {
							if (!selectedItems?.length) {
								return;
							}
							const linkModel = await sdk.Model.create("UsrRelatedInMyEntity");

							// Skip records that are already linked (the mixin's job before).
							const existingFilter = new sdk.FilterGroup();
							existingFilter.addSchemaColumnFilterWithParameter(
								sdk.ComparisonType.Equal, "UsrMyEntity", masterId);
							const existing = await linkModel.load({
								attributes: ["UsrRelatedEntity"],
								parameters: [{ type: sdk.ModelParameterType.Filter, value: existingFilter }]
							});
							const linked = new Set(existing.map(row => row.UsrRelatedEntity?.value));

							for (const item of selectedItems) {
								if (linked.has(item.value)) {
									continue;
								}
								const result = await linkModel.insert({
									UsrMyEntity: masterId,
									UsrRelatedEntity: item.value     // the Guid, not the item
								});
								if (!result?.success) {
									console.error(result?.errorInfo);
								}
							}

							await request.$context.executeRequest({
								type: "crt.LoadDataRequest",
								$context: request.$context,
								config: { loadType: "reload", useLastLoadParameters: true },
								dataSourceName: "GridDetail_r4s5t6uDS"
							});
						}
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
