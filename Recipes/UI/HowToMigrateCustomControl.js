// --- How to migrate a custom Ext control (controlConfig.className) to a remote module view element ---
// Classic UI builds a custom control as an Ext class in the Terrasoft.controls
// namespace (Ext.define, extend "Terrasoft.TextEdit" etc.), places it on a page
// through `controlConfig.className`, talks to the page through bindTo and
// fireEvent, and loads whole custom modules with this.sandbox.loadModule. None
// of that exists in Freedom UI. The supported replacement is a REMOTE MODULE: an
// Angular project built against @creatio-devkit/common whose component is
// registered with @CrtViewElement({ type, selector }), exposes @CrtInput /
// @CrtOutput properties, is listed in @CrtModule({ viewElements }) and is
// placed on a page by its `type` like any crt.* element. Interim route without
// an Angular build: a plain web component in a schema of type "Module",
// registered with sdk.registerViewElement.
//
// API MAP
//   Ext.define("Terrasoft.controls.UsrX", { extend: ... })
//                                  ->  @CrtViewElement({ type: "usr.X", selector: "usr-x" })
//                                      @Component({ selector: "usr-x", ... }) export class XComponent
//   alternateClassName + controlConfig.className
//                                  ->  "type": "usr.X" in viewConfigDiff
//   config property set from controlConfig / bindTo
//                                  ->  @Input() @CrtInput() public caption!: string;
//                                      page: "caption": "$Attr"
//   this.addEvents("x"); this.fireEvent("x", ...)
//                                  ->  @Output() @CrtOutput() public x = new EventEmitter();
//                                      page: "x": { "request": "usr.XRequest" }
//   init / initDomEvents / onDestroy ->  Angular ngOnInit / ngOnDestroy (component lifecycle)
//   Terrasoft.* / Ext.* inside the control
//                                  ->  sdk.* services injected or instantiated in the component
//   dependency "UsrMyControl" in the page's define([...])
//                                  ->  nothing for a remote module (resolved by type);
//                                      the "Module" schema name in SCHEMA_DEPS for registerViewElement
//   this.sandbox.loadModule("UsrModule", { renderTo })
//                                  ->  no equivalent; a view element, or a Freedom page opened
//                                      with crt.OpenPageRequest
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Nothing is inherited: there is no "extend Terrasoft.TextEdit". Rebuild the
//     behaviour, or first check whether a stock crt.* element with a converter
//     does the job - a custom element is code you maintain across upgrades.
//   - An @Input without @CrtInput is never set from the page; a property missing
//     from registerViewElement `inputs` is never set either.
//   - Do not name inputs `readonly`, `disabled`, `hidden`, `title`, `id`, `name`
//     or `value`: they collide with native attributes on Angular custom
//     elements (use isReadOnly, ...).
//   - The component must be listed in @CrtModule({ viewElements }) or it is
//     never registered. Project layout differs between template versions;
//     copy the layout your project template generates. bootstrapCrtModule(type)
//     without the remote name is marked @deprecated in the typings.
//   - How an @CrtOutput's payload reaches the handler is not documented in the
//     typings; the request-binding shape below follows stock `clicked`.
//     Verify on your version.
//   - Deploy: build, copy dist into the package's Files/src/js, install. A stale
//     browser cache keeps serving the old bundle (hard refresh).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A `controlConfig: { className: ... }` block copied into a Freedom element is
//   ignored. A `type` that does not match @CrtViewElement exactly (or lacks the
//   usr. prefix) renders an empty unknown tag with no error. For the
//   registerViewElement route, forgetting the Module schema in the page's
//   SCHEMA_DEPS gives the same empty tag.
//
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/remote-modules/freedom-ui-remote-module/overview
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: CrtViewElement, CrtInput, CrtOutput, CrtModule, bootstrapCrtModule, registerViewElement)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrStatusBadgeControl", ["ext-base", "terrasoft"], function(Ext) {
	Ext.define("Terrasoft.controls.UsrStatusBadgeControl", {
		extend: "Terrasoft.Label",
		alternateClassName: "Terrasoft.UsrStatusBadgeControl",
		isReadOnly: false,
		init: function() {
			this.callParent(arguments);
			this.addEvents("badgeClick");
		},
		initDomEvents: function() {
			this.callParent(arguments);
			this.getEl().on("click", this.onBadgeClick, this);
		},
		onBadgeClick: function() {
			if (!this.isReadOnly) {
				this.fireEvent("badgeClick", this);
			}
		}
	});
});

define("UsrMyEntity1Page", ["UsrStatusBadgeControl"], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			onBadgeClick: function() {
				this.set("UsrIsHighlighted", true);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrStatusBadge",
				"values": {
					"layout": { "colSpan": 12, "rowSpan": 1, "column": 0, "row": 0, "layoutName": "Header" },
					"bindTo": "UsrStatus",
					"controlConfig": {
						"className": "Terrasoft.UsrStatusBadgeControl",
						"badgeClick": { "bindTo": "onBadgeClick" }
					}
				},
				"parentName": "Header",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// THE COMPONENT (TypeScript, in the remote-module Angular project):
//
//	@CrtViewElement({ selector: "usr-status-badge", type: "usr.StatusBadge" })
//	@Component({ selector: "usr-status-badge", template: "...", encapsulation: ViewEncapsulation.ShadowDom })
//	export class StatusBadgeComponent {
//		@Input() @CrtInput() public caption!: string;
//		@Input() @CrtInput() public isReadOnly = false;
//		@Output() @CrtOutput() public badgeClick = new EventEmitter<void>();
//	}
//
//	@CrtModule({ viewElements: [StatusBadgeComponent] })
//	@NgModule({ declarations: [StatusBadgeComponent] })
//	export class AppModule { /* bootstrapCrtModule("<remote name>", AppModule) per the project template */ }

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrStatusBadge",
				"values": {
					"layoutConfig": { "column": 1, "row": 1, "colSpan": 1, "rowSpan": 1 },
					// Must equal @CrtViewElement.type exactly.
					"type": "usr.StatusBadge",
					"caption": "$PDS_UsrStatus_f6a7b8c | crt.ToObjectProp : 'displayValue'",
					"isReadOnly": "$UsrIsBadgeReadOnly",
					// fireEvent("badgeClick") -> @CrtOutput bound to a request (verify).
					"badgeClick": { "request": "usr.StatusBadgeClickRequest" }
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsBadgeReadOnly": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// methods.onBadgeClick -> handler for the output's request.
				request: "usr.StatusBadgeClickRequest",
				handler: async (request, next) => {
					request.$context.PDS_UsrIsHighlighted_a7b8c9d = true;
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});

// INTERIM ROUTE without an Angular build: a schema of type "Module" with a plain
// web component. The page then lists "UsrStatusBadgeElement" in SCHEMA_DEPS.
define("UsrStatusBadgeElement", ["@creatio-devkit/common"], function(sdk) {

	class UsrStatusBadgeElement extends HTMLElement {
		constructor() {
			super();
			this._root = this.attachShadow({ mode: "open" });
			this._caption = "";
		}
		set caption(value) {
			this._caption = value || "";
			this._render();
		}
		get caption() {
			return this._caption;
		}
		_render() {
			const span = document.createElement("span");
			// textContent, never innerHTML, for bound data.
			span.textContent = this._caption;
			this._root.replaceChildren(span);
		}
	}

	customElements.define("usr-status-badge-element", UsrStatusBadgeElement);
	sdk.registerViewElement({
		type: "usr.StatusBadgeElement",
		selector: "usr-status-badge-element",
		// Only properties listed here are ever set from the page.
		inputs: { caption: {} }
	});

	return UsrStatusBadgeElement;
});
