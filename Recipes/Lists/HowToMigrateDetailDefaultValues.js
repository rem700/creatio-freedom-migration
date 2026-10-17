// --- How to migrate details.defaultValues (new detail record defaults) -------
// Classic UI pre-fills a new detail record from the page with `defaultValues`
// in the page's `details` entry: { "<DetailColumn>": { "masterColumn":
// "<PageColumn>" } } copies a page value, { "value": <constant> } sets a fixed
// one; the link column (detailColumn) is filled for you. Computed defaults go
// into the detail's own page, in onEntityInitialized guarded by isAddMode().
// Freedom UI passes defaults with the request that opens the new record:
// crt.CreateRecordRequest { entityName, defaultValues: [{ attributeName, value }] }
// on the list's add button, or crt.OpenPageRequest with modelInitConfigs
// [{ action: "add", defaultValues }] to open a specific page.
//
// API MAP
//   details.X.defaultValues.UsrAccount = { masterColumn: "UsrAccount" }
//                                            ->  defaultValues: [{ "attributeName": "UsrAccount",
//                                                    "value": "$PDS_UsrAccount_a1b2c3d" }]
//   details.X.defaultValues.UsrQuantity = { value: 1 }
//                                            ->  { "attributeName": "UsrQuantity", "value": 1 }
//   filter.detailColumn filled automatically ->  an explicit { "attributeName": "UsrMyEntity",
//                                                    "value": "$Id" } entry on the add button
//   open a specific page in add mode         ->  crt.OpenPageRequest { schemaName,
//                                                    modelInitConfigs: [{ action: "add", defaultValues }] }
//   onEntityInitialized + isAddMode() on the detail's page
//                                            ->  crt.HandleViewModelInitRequest on that page, guarded by
//                                                getPrimaryModelMode() === "create"
//   (inline-created editable rows)           ->  no CreateRecordRequest; set values in a
//                                                crt.SaveRecordsRequest handler
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The defaults move from the page's data declaration to the BUTTON that
//     creates the record. Every route that creates rows (list add button, a
//     header button, a custom handler) needs its own defaultValues.
//   - attributeName is the column of the NEW record's entity, as in Academy's
//     example ("Type"). If a value does not appear, the target page may bind
//     that column under a generated attribute name - check its schema.
//   - A lookup default can be a Guid or { value, displayValue }; pass the
//     object when you want the caption shown before the save.
//   - The "$Id" binding resolves to the page record id in the designer-generated
//     add button (observed); read the generated button before replacing it.
//   - Defaults apply only when a record is created; editing never re-applies
//     them, in both generations.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Replacing the generated add button with your own CreateRecordRequest and
//   porting only the Classic defaultValues (which never listed the link
//   column) creates records with an EMPTY master link: they save fine and
//   never show up in this list, because its dependency filters on that column.
//   The same happens to rows created from a header button or a handler.
//
// See: Recipes/Lists/HowToMigrateDetailToList.js
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/open-a-page-from-a-custom-handler/examples/open-a-typified-freedom-ui-page
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/references/basedetailv2
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: ModelInitConfig, ModelDefaultValue)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		details: /**SCHEMA_DETAILS*/{
			"UsrMyDetail": {
				"schemaName": "UsrMyDetail",
				"entitySchemaName": "UsrMyDetailEntity",
				"filter": {
					"detailColumn": "UsrMyEntity",
					"masterColumn": "Id"
				},
				"defaultValues": {
					"UsrAccount": { "masterColumn": "UsrAccount" },
					"UsrQuantity": { "value": 1 }
				}
			}
		}/**SCHEMA_DETAILS*/,
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// The list's add button (generated name - read yours off the schema).
				// Defaults travel with the request.
				"operation": "merge",
				"name": "GridDetailAddBtn_k7m2p9q",
				"values": {
					"clicked": {
						"request": "crt.CreateRecordRequest",
						"params": {
							"entityName": "UsrMyDetailEntity",
							"defaultValues": [
								// The master link - Classic filled it implicitly.
								{ "attributeName": "UsrMyEntity", "value": "$Id" },
								// Was { masterColumn: "UsrAccount" }.
								{ "attributeName": "UsrAccount", "value": "$PDS_UsrAccount_a1b2c3d" },
								// Was { value: 1 }.
								{ "attributeName": "UsrQuantity", "value": 1 }
							]
						}
					}
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// The same defaults when opening a SPECIFIC page from code.
				request: "usr.AddDetailRowInPageRequest",
				handler: async (request, next) => {
					const masterId = await request.$context.PDS_Id_a1b2c3d;
					const account = await request.$context.PDS_UsrAccount_a1b2c3d;
					await request.$context.executeRequest({
						type: "crt.OpenPageRequest",
						$context: request.$context,
						schemaName: "UsrMyDetailEntity_FormPage",
						modelInitConfigs: [{
							action: "add",
							defaultValues: [
								{ attributeName: "UsrMyEntity", value: masterId },
								{ attributeName: "UsrAccount", value: account },
								{ attributeName: "UsrQuantity", value: 1 }
							]
						}]
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
