// --- How to migrate a Classic mini page to Freedom UI ------------------------
// A Classic UI mini page ("<Entity>MiniPage", EditViewModelSchema) is a compact
// page with its own layout rules: the root container "MiniPage", every control
// with "isMiniPageModelItem": true and "layoutName": "MiniPage". The Section
// Wizard enables it in two modes: ADD (opens when the user clicks Add/New) and
// VIEW (pops up when the user hovers over a record link in any list). Freedom UI
// has mini pages too: a page created from the mini page template
// ("UsrMyEntity_MiniPage"), shown as a pop-up window over the list page, built
// with the same viewConfigDiff / handlers as any Freedom page. It is wired as
// the object's "Page for adding records", opened by the list page's
// crt.CreateRecordRequest, or opened from code with crt.OpenPageRequest.
//
// API MAP
//   UsrMyEntityMiniPage (EditViewModelSchema)->  UsrMyEntity_MiniPage (mini page template)
//   Section Wizard "add" mode                ->  Pages tab: "Page for adding records" = the mini page
//   parentName "MiniPage", isMiniPageModelItem, layoutName
//                                            ->  ordinary viewConfigDiff inserts into the template's
//                                                containers (no mini-page-specific flags)
//   "visible": { "bindTo": "isAddMode" }     ->  attribute set in crt.HandleViewModelInitRequest from
//                                                getPrimaryModelMode() === "create", bound as "$UsrIsNew"
//   open the mini page from code             ->  crt.OpenPageRequest { schemaName: "UsrMyEntity_MiniPage",
//                                                    modelInitConfigs: [{ action: "add" | "edit", recordId,
//                                                    defaultValues }] }
//                                                or new sdk.SchemaModalService().show({ schemaName, action,
//                                                    recordId, defaultValues })  (present in devkit 0.1000.x
//                                                    typings - check your version)
//   VIEW mode on link hover                  ->  NO documented Freedom equivalent (see below)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - HOVER PREVIEW: Academy documents Freedom mini pages for adding and
//     quick editing; it documents no "pop up on hover" view mode. The closest
//     working routes are a row action that opens the mini page in "edit" mode,
//     or showValueAsLink on a lookup (opens the record's page on click).
//   - The mini page canvas is smaller and cannot be resized (Academy).
//   - Classic mini pages had their own base schema and layout rules; Freedom
//     mini pages are "functionally identical to full Freedom UI pages", so
//     handlers, validators and converters port as on any page.
//   - A recordId placed in crt.OpenPageRequest `parameters` instead of
//     modelInitConfigs is ignored: the mini page opens as an empty new record.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Copying "isMiniPageModelItem" / "layoutName" / "parentName": "MiniPage" into
//   a Freedom viewConfigDiff: the keys are ignored and an insert into a parent
//   that does not exist puts the field nowhere - it simply does not render.
//   Expecting hover previews after migration: users get none, and no error.
//
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/set-up-the-app/set-up-mini-pages
// Source: https://academy.creatio.com/docs/user/customization_tools/ui_and_business_logic_customization/section_setup/mini_pages
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/open-a-page-from-a-custom-handler/examples/open-a-typified-freedom-ui-page
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: SchemaModalService, ModelInitConfig)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntityMiniPage", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {},
		methods: {},
		diff: /**SCHEMA_DIFF*/[
			{
				// Shown only while the record is created from the mini page.
				"operation": "insert",
				"name": "UsrIndustry",
				"values": {
					"layout": { "colSpan": 24, "rowSpan": 1, "column": 0, "row": 3, "layoutName": "MiniPage" },
					"isMiniPageModelItem": true,
					"bindTo": "UsrIndustry",
					"visible": { "bindTo": "isAddMode" }
				},
				"parentName": "MiniPage",
				"propertyName": "items",
				"index": 2
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyEntity_MiniPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// An ordinary field; the parent is the template's container.
				"operation": "insert",
				"name": "UsrIndustry",
				"values": {
					"layoutConfig": { "column": 1, "row": 3, "colSpan": 2, "rowSpan": 1 },
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrIndustry_a1b2c3d",
					"control": "$PDS_UsrIndustry_a1b2c3d",
					// Was { bindTo: "isAddMode" }.
					"visible": "$UsrIsNew"
				},
				"parentName": "MainContainer",
				"propertyName": "items",
				"index": 2
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsNew": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					request.$context.UsrIsNew =
						await request.$context.getPrimaryModelMode() === "create";
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});

// The closest route to Classic's VIEW mode: open it for a row from the list page.
define("UsrMyEntity_ListPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Row action with "recordId": "$Items.PDS_Id".
				request: "usr.QuickViewRequest",
				handler: async (request, next) => {
					await request.$context.executeRequest({
						type: "crt.OpenPageRequest",
						$context: request.$context,
						schemaName: "UsrMyEntity_MiniPage",
						modelInitConfigs: [{ action: "edit", recordId: request.recordId }]
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
