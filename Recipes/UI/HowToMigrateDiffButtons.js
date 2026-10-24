// --- How to migrate a diff BUTTON (click, enabled, style) to crt.Button ------
// Classic UI adds a button as a diff item with itemType
// Terrasoft.ViewItemType.BUTTON; `click` binds to a METHOD NAME in `methods`
// (called with no arguments), `enabled` / `visible` bind to a virtual attribute
// or even to a method, and `style` takes Terrasoft.controls.ButtonEnums.style.
// Freedom UI places a "crt.Button" in viewConfigDiff; `clicked` names a REQUEST
// ({ request, params }) and the logic lives in a handler for that request.
// There is no `methods` section to call into.
//
// API MAP
//   "itemType": Terrasoft.ViewItemType.BUTTON ->  "type": "crt.Button"
//   "click": { "bindTo": "onMyClick" }        ->  "clicked": { "request": "usr.MyClickRequest",
//                                                              "params": { ... } }
//   methods.onMyClick: function() { ... }     ->  handlers: [{ request: "usr.MyClickRequest",
//                                                  handler: async (request, next) => { ... } }]
//   "enabled": { "bindTo": "UsrCanRun" }      ->  "disabled": "$UsrCanRun | crt.InvertBooleanValue"
//   "visible": { "bindTo": "UsrIsVisible" }   ->  "visible": "$UsrIsVisible"
//   "caption": { "bindTo": "Resources.Strings.X" } ->  "caption": "#ResourceString(X)#"
//   ButtonEnums.style.GREEN / BLUE            ->  "color": "primary" or "accent" (closest; there is
//                                                  no literal green/blue)
//   ButtonEnums.style.RED                     ->  "color": "warn"
//   ButtonEnums.style.DEFAULT / GREY          ->  "color": "default"
//   parentName "LeftContainer" (command bar)  ->  parentName "ActionButtonsContainer"
//                                                  (verified on Creatio 10.1.796, tools/verify,
//                                                  in a stock form page; check the parent
//                                                  schema of YOUR page)
//   "layout": { column, row, colSpan, rowSpan, layoutName }  (0-based, 24 columns)
//                                             ->  "layoutConfig": { column, row, colSpan, rowSpan }
//                                                  (1-based CSS grid; only inside a crt.GridContainer)
//   this.isAddMode() || this.isCopyMode()     ->  await request.$context.getPrimaryModelMode() === "create"
//                                                  (after load: it is "init" in the init handler -
//                                                  observed on 10.1.796)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - crt.Button has `disabled`, not `enabled` (Academy button reference).
//     Invert the attribute with crt.InvertBooleanValue, or rename it
//     (UsrIsRunDisabled) and bind it directly.
//   - Classic can bind enabled/visible to a METHOD that is re-evaluated by the
//     binding. Freedom binds only to ATTRIBUTES (and converters). Turn the method
//     into an attribute and set it from crt.HandleViewModelInitRequest or
//     crt.HandleViewModelAttributeChangeRequest.
//   - `params` are copied onto the request object: "params": { "mode": "x" }
//     arrives as request.mode. "$Attr" values in params are resolved first.
//   - The handler must `return next?.handle(request)` for a stock request it
//     extends; for your own usr.* request it is still the polite default
//     (another package can extend it).
//   - Name custom requests with your package prefix (usr.*). Two packages that
//     handle the same name both run, in an order you do not control.
//   - The Classic "is the record saved?" guard has no Freedom twin: save from the
//     handler with crt.SaveRecordRequest (preventCardClose: true) and continue
//     only on a truthy result. See: Recipes/Lifecycle/HowToMigrateNewRecordDetection.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   "enabled": "$UsrCanRun" is an unknown property on crt.Button and is ignored:
//   the button is always clickable. "disabled": "$isRunEnabled" pointing at a
//   former METHOD name binds to an undeclared attribute (undefined) - also
//   always clickable. A `clicked.request` with no matching handler does nothing:
//   no error, no console message.
//
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/page-customization-basics/references/button
// Source: https://academy.creatio.com/docs/7-18/developer/interface_elements/record_page/button
// Source: https://community.creatio.com/node/39424
// Source: https://customerfx.com/article/saving-a-page-before-some-action-on-a-creatio-freedom-ui-page/

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ProcessModuleUtilities"], function(ProcessModuleUtilities) {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrCanRun": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				this.set("UsrCanRun", !this.isAddMode() && !this.isCopyMode());
			},
			onRunButtonClick: function() {
				ProcessModuleUtilities.executeProcess({
					sysProcessName: "UsrMyProcess",
					parameters: { UsrRecordId: this.get("Id") }
				});
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrRunButton",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.UsrRunButtonCaption" },
					"click": { "bindTo": "onRunButtonClick" },
					"enabled": { "bindTo": "UsrCanRun" },
					"style": Terrasoft.controls.ButtonEnums.style.GREEN
				},
				"parentName": "LeftContainer",
				"propertyName": "items",
				"index": 5
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
				"name": "UsrRunButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrRunButton_caption)#",
					"color": "primary",
					"size": "large",
					"iconPosition": "only-text",
					// enabled -> disabled: invert, never port the name.
					"disabled": "$UsrCanRun | crt.InvertBooleanValue",
					"visible": true,
					"clicked": {
						"request": "usr.RunButtonClickRequest",
						"params": { "mode": "full" }
					}
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// Former Classic virtual column; declared, or bindings stay empty.
					"UsrCanRun": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// onEntityInitialized -> init handler (after the base chain).
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					// The mode is "init" until the record has loaded: read it on
					// finish-load-model-attributes and skip "init".
					request.$context.events$.subscribe(async (evt) => {
						if (evt?.type !== "finish-load-model-attributes") {
							return;
						}
						const mode = await request.$context.getPrimaryModelMode();
						if (mode !== "init") {
							request.$context.UsrCanRun = mode !== "create";
						}
					});
				}
			},
			{
				// methods.onRunButtonClick -> a handler for the button's request.
				request: "usr.RunButtonClickRequest",
				handler: async (request, next) => {
					// params arrive on the request object.
					const mode = request.mode;
					await request.$context.executeRequest({
						type: "crt.RunBusinessProcessRequest",
						$context: request.$context,
						processName: "UsrMyProcess",
						processRunType: "ForTheSelectedPage",
						recordIdProcessParameterName: "UsrRecordId",
						saveAtProcessStart: true,
						showNotification: mode === "full"
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
