// --- How to migrate localizable strings (Resources.Strings) to Freedom UI ------
// Classic UI binds captions in diff with { "bindTo": "Resources.Strings.X" } and
// reads a string in code with this.get("Resources.Strings.X"). The strings are
// resources of the schema, stored per culture in the package Resources folder.
// Freedom UI keeps them as schema resources too but uses three forms:
// "#ResourceString(X)#" for captions and titles in viewConfigDiff,
// "$Resources.Strings.X" as a binding (input labels), and
// `await request.$context.Resources.Strings.X` in handlers.
//
// API MAP
//   "caption": { "bindTo": "Resources.Strings.X" } (button, tab, group)
//                                            ->  "caption": "#ResourceString(X)#"
//                                               ("title" for panels and tabs)
//   "caption" of a field / label             ->  "label": "$Resources.Strings.X"
//   this.get("Resources.Strings.X")          ->  await request.$context.Resources.Strings.X
//   "tip": { "content": { "bindTo": ... } }  ->  check the element's properties in the designer;
//                                               not every Classic tip has a Freedom counterpart
//   validator message from Resources.Strings ->  "message": "#ResourceString(X)#" in params
//   Resources.Images.X                       ->  no documented schema-image binding; use the
//                                               element's icon property or a file in the package
//   resource.<culture>.xml item
//     "LocalizableStrings.X.Value"           ->  same storage; strings are copied, not shared
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - A Freedom UI page is a DIFFERENT schema: the Classic page's strings are
//     not visible to it. Re-create every key the new page uses, in every
//     culture the solution ships, or the page falls back to the primary one.
//   - The designer names keys after elements ("UsrApplyButton_caption",
//     "PDS_UsrName_a1b2c3d" for a field label). Hand-written keys work; keep
//     the element-name prefix so the key can be found from the view config.
//   - "#ResourceString(X)#" is resolved when the view is built; it is not a
//     binding and cannot change at runtime (observed). For a dynamic caption bind an
//     attribute ("caption": "$UsrCaption") and fill it from a handler.
//   - Converters are not available for resource bindings (Academy).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Forgetting `await` on Resources.Strings puts "[object Promise]" into a
//   dialog or notification. Using "$Resources.Strings.X" where the element
//   expects "#ResourceString(X)#" (or the reverse), or a key that exists only
//   in the old Classic schema, renders an empty caption or the raw key text
//   without an error (observed).
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/converters

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			onExportClick: function() {
				var message = this.get("Resources.Strings.ExportStartedMessage");
				this.showInformationDialog(message);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrExportButton",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.UsrExportButtonCaption" },
					"click": { "bindTo": "onExportClick" }
				},
				"parentName": "LeftContainer",
				"propertyName": "items",
				"index": 5
			},
			{
				"operation": "merge",
				"name": "UsrName",
				"values": {
					"caption": { "bindTo": "Resources.Strings.UsrNameCaption" }
				}
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrExportButton",
				"values": {
					"type": "crt.Button",
					// Caption: substitution form.
					"caption": "#ResourceString(UsrExportButton_caption)#",
					"iconPosition": "only-text",
					"clicked": { "request": "usr.ExportRequest" }
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "merge",
				"name": "UsrName",
				"values": {
					// Field label: binding form.
					"label": "$Resources.Strings.PDS_UsrName_a1b2c3d"
				}
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.ExportRequest",
				handler: async (request, next) => {
					// Code form: awaited.
					const message = await request.$context.Resources.Strings.ExportStartedMessage;
					await request.$context.executeRequest({
						type: "crt.NotificationRequest",
						$context: request.$context,
						message: message
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
