// --- How to migrate onRender and DOM access to Freedom UI ----------------------
// Classic UI pages reach the rendered DOM from onRender() or from a polling
// timer started in onEntityInitialized, using the predictable element ids
// "<SchemaName><ElementName>-wrapperEl", and keep MutationObservers to re-apply
// changes. Freedom UI has NO onRender hook and no supported, stable element
// ids: the page is rendered by Angular components whose markup changes between
// releases. There is no one-to-one equivalent. Re-express the intent through
// the declarative layer, and put genuinely custom markup into a custom view
// element (web component) that owns its own DOM.
//
// API MAP
//   onRender()                              ->  no equivalent
//   document.querySelector("#...-wrapperEl") ->  no supported equivalent; do not port
//   el.style / addClass to show state        ->  bind an element property to an attribute:
//                                               "visible" / "readonly" / "disabled" / "caption"
//   computed caption written into the DOM    ->  converter: "caption": "$Attr | usr.MyConverter"
//   MutationObserver to react to UI change   ->  crt.HandleViewModelAttributeChangeRequest
//                                               or "change" on the attribute
//   click listener added to a stock button   ->  handler for the button's request
//                                               (e.g. "crt.SaveRecordRequest")
//   widget injected into a container         ->  custom view element: customElements.define
//                                               + sdk.registerViewElement, placed by
//                                               "type" in viewConfigDiff
//   "css!UsrMyEntity1PageCSS" dependency     ->  styles inside the custom element's shadow
//                                               DOM, or element properties exposed in the
//                                               designer (color, style, size)
//   destroy(): observer.disconnect()        ->  the element's disconnectedCallback()
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Element names in viewConfigDiff are NOT DOM ids. Selectors built from
//     them match nothing, or match something different after an update.
//   - A global stylesheet that restyles stock Freedom UI components targets
//     internal class names; it may work today (observed) and break on update.
//   - The custom element's module must be listed in the page's SCHEMA_DEPS,
//     and every bindable property must appear in `inputs` of
//     registerViewElement, or it is never set.
//   - A view model is paused, not destroyed, when the user navigates away:
//     timers started from handlers keep running.
//     See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   - Converters work in ONE direction and cannot be used on a `control`
//     binding (Academy).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A polling loop that waits for "#UsrMyEntity1PageUsrInfoContainer" never
//   finds the node in Freedom UI. With an attempt limit it gives up quietly;
//   without one it polls for the rest of the session.
//
// See: Recipes/UI/HowToMigrateCustomControl.js
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: registerViewElement)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/converters
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/remote-modules/freedom-ui-remote-module/overview

// ===== CLASSIC UI (7.x) =====================================================

// A status badge drawn into the DOM after render, recoloured on change.
define("UsrMyEntity1Page", ["css!UsrMyEntity1PageCSS"], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrStatus": {
				"dependencies": [
					{ "columns": ["UsrStatus"], "methodName": "paintStatusBadge" }
				]
			}
		},
		methods: {

			onRender: function() {
				this.callParent(arguments);
				this.paintStatusBadge();
			},

			paintStatusBadge: function() {
				var node = document.querySelector("#UsrMyEntity1PageUsrStatusContainer");
				if (!node || this.destroyed) {
					return;
				}
				var status = this.get("UsrStatus");
				node.setAttribute("data-usr-status", status ? status.displayValue : "");
				node.classList.toggle("usr-status-closed",
					!!status && status.displayValue === "Closed");
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// 1. The same intent declaratively: a label whose caption comes from a
//    converter and whose visibility follows an attribute. No DOM access.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["UsrStatusBadge"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrStatusLabel",
				"values": {
					"type": "crt.Label",
					"caption": "$PDS_UsrStatus_a1b2c3d | usr.StatusToCaption",
					"visible": "$UsrIsStatusClosed"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			},
			// 2. Custom markup: a registered web component placed by type.
			{
				"operation": "insert",
				"name": "UsrStatusBadgeElement",
				"values": {
					"type": "usr.StatusBadge",
					"status": "$PDS_UsrStatus_a1b2c3d"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsStatusClosed": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Was the "dependencies" + DOM repaint.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrStatus_a1b2c3d") {
						request.$context.UsrIsStatusClosed =
							request.value?.displayValue === "Closed";
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{
			"usr.StatusToCaption": function(value) {
				return value ? "Status: " + value.displayValue : "";
			}
		}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});

// The custom element, in its own schema of type Module ("UsrStatusBadge").
// It owns its DOM and styles; no selector reaches into the page.
define("UsrStatusBadge", ["@creatio-devkit/common"], function(sdk) {

	class UsrStatusBadge extends HTMLElement {
		constructor() {
			super();
			this._root = this.attachShadow({ mode: "open" });
		}
		set status(value) {
			this._status = value;
			this._render();
		}
		get status() {
			return this._status;
		}
		_render() {
			const caption = this._status ? this._status.displayValue : "";
			const closed = caption === "Closed";
			this._root.innerHTML = "<style>span{padding:2px 8px;border-radius:8px;}" +
				".closed{background:#eee;color:#888;}</style>";
			const span = document.createElement("span");
			span.className = closed ? "closed" : "";
			span.textContent = caption;
			this._root.appendChild(span);
		}
		disconnectedCallback() {
			// Release anything this element attached (was destroy()).
		}
	}

	customElements.define("usr-status-badge", UsrStatusBadge);

	sdk.registerViewElement({
		type: "usr.StatusBadge",
		selector: "usr-status-badge",
		// Only properties listed here are ever set from the page.
		inputs: { status: {} }
	});

	return UsrStatusBadge;
});
