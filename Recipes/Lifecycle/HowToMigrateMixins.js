// --- How to migrate mixins (mixins property, Ext.define mixin classes) to Freedom UI ---
// Classic UI shares behaviour between page schemas with mixins: an Ext class
// (Ext.define("Terrasoft.configuration.mixins.UsrX", { alternateClassName:
// "Terrasoft.UsrX", ... })) listed in the schema's `mixins` property, whose
// methods then run as if they were the page's own (`this.get`, `this.set`,
// `this.someMixinMethod()`), and which the page overrides by declaring a
// method with the same name. Freedom UI has NO mixin mechanism: there is no
// `mixins` key, no `this`, and no method merging into a view model. Shared
// logic is split by what it does: pure calculations go to a plain module,
// page behaviour goes to a custom request (usr.*) handled once - on each page
// or, for real reuse, by a request handler in a remote module - and rules
// that must hold for every UI and integration go to the server.
//
// API MAP
//   mixins: { UsrDiscountable: "Terrasoft.UsrDiscountableMixin" }
//                                  ->  no equivalent key; pick one of the routes below
//   pure helper methods (no this.get / this.set)
//                                  ->  a schema of type "Module" returning plain functions,
//                                      listed in SCHEMA_DEPS (observed pattern, see below)
//   method that reads/writes the page (this.get / this.set)
//                                  ->  custom request "usr.ApplyDiscountRequest" + handler that
//                                      reads/writes request.$context (await every read)
//   one mixin reused by many pages ->  remote module: @CrtRequestHandler({ type, requestType,
//                                      scopes: ["<page code>", ...] }) extends BaseRequestHandler,
//                                      listed in @CrtModule({ requestHandlers })
//   this.applyDiscount() called from page code
//                                  ->  await request.$context.executeRequest({
//                                          type: "usr.ApplyDiscountRequest", $context: request.$context })
//   overriding a mixin method in the page (same name)
//                                  ->  a page handler for the same request type; call
//                                      next?.handle(request) to also run the shared one
//   this.mixins.UsrX.method.call(this, ...)  (calling the original)
//                                  ->  return next?.handle(request)
//   mixin init(callback) hooked into the page init
//                                  ->  handler for crt.HandleViewModelInitRequest (in the page
//                                      or a scoped remote handler)
//   logic every UI and integration must obey
//                                  ->  C# service / entity event listener / business process;
//                                      See: Recipes/Data/HowToMigrateServiceHelperCalls.js
//   stock mixins: LookupMultiAddMixin, ConfigurationGridUtilitiesV2
//                                  ->  See: Recipes/Lists/HowToMigrateMultiSelectAdd.js
//                                      See: Recipes/Lists/HowToMigrateEditableDetail.js
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Nothing is merged into the page. A mixin method that called `this.get`
//     cannot be moved into a plain module as is: pass values in as arguments,
//     or turn it into a request handler that reads `request.$context`.
//   - Attribute names change (Classic "UsrAmount" -> Freedom "PDS_UsrAmount_..."
//     generated per page). A shared handler used by several pages must not
//     hard-code one page's generated names: give the pages the same
//     view-model attribute names (declare your own attributes bound to the
//     data source columns) or pass the names as request parameters.
//   - Remote-module handlers: CrtRequestHandler exists since
//     @creatio-devkit/common 0.804.0. Without `scopes` the handler is global
//     and runs on EVERY Freedom UI page (Academy); always scope it to the page
//     codes that used the mixin.
//   - The order between a page-schema handler and a remote-module handler for
//     the same request is not documented. Do not rely on it; test it on your
//     version.
//   - Inherited stock mixins (BasePageV2, BaseSectionV2, detail base schemas)
//     are NOT ported: their behaviour is built into the Freedom UI templates
//     (save, validation, lists). Port only what YOUR code added or overrode.
//   - A plain-functions Module schema is an AMD pattern: Academy documents a
//     Module schema in SCHEMA_DEPS for custom view elements
//     (registerViewElement); returning plain helpers from it is observed to
//     work, not documented. Keep it free of $context and sdk state.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A `mixins: {...}` block copied into a Freedom UI schema is ignored, and so
//   are the mixin's methods: the button or change handler that called them now
//   calls nothing, with no error. A handler written for a custom request that
//   never returns next?.handle(request) also swallows the request for every
//   handler behind it (including the remote-module one). A remote handler
//   whose `scopes` lists a wrong page code never runs.
//
// HOW TO INVENTORY THE MIXINS OF A SCHEMA
//   1. In the Classic schema: the `mixins` property, every `this.mixins.X`
//      call, and dependencies in define([...]) whose name ends in "Mixin" or
//      "-able" (Academy naming advice for mixin schemas).
//   2. Methods the schema CALLS but does not DEFINE: each one comes from a
//      mixin or a parent schema. Look them up in the parent chain.
//   3. Across the package (development in the file system), search the source
//      tree for mixin declarations and their users, for example:
//          grep -rn --include=*.js -e "mixins:" -e "Ext.define(\"Terrasoft.configuration.mixins" Pkg/
//          grep -rln "Terrasoft.UsrDiscountableMixin" Pkg/
//      The second list is the set of pages that need the replacement, and
//      therefore the `scopes` of a remote-module handler.
//   4. For each mixin method, write down: pure / reads the page / writes the
//      page / calls the server. That classification picks the route above.
//
// See: Recipes/Strategy/SchemaStructureMappingReference.js
// See: Recipes/UI/HowToMigrateCustomControl.js
// Applies: Classic UI 7.x; Freedom UI 8.1+ (page handlers); remote-module request handlers need @creatio-devkit/common 0.804.0+
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/classic-ui/client-schema/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/remote-module/custom-request-handler/overview
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: CrtRequestHandler, RequestHandlerDefinition.scopes, BaseRequestHandler, ModuleDefinition.requestHandlers; CHANGELOG 0.804.0)

// ===== CLASSIC UI (7.x) =====================================================

// The mixin: one schema, one Ext class.
define("UsrDiscountableMixin", [], function() {
	Ext.define("Terrasoft.configuration.mixins.UsrDiscountableMixin", {
		alternateClassName: "Terrasoft.UsrDiscountableMixin",

		// Pure calculation.
		calculateDiscountedAmount: function(amount, percent) {
			var value = (amount || 0) * (1 - (percent || 0) / 100);
			return Math.round(value * 100) / 100;
		},

		// Reads and writes the page it is mixed into.
		applyDiscount: function() {
			var total = this.calculateDiscountedAmount(this.get("UsrAmount"), this.get("UsrDiscount"));
			this.set("UsrTotal", total);
		}
	});
	return Ext.create(Terrasoft.UsrDiscountableMixin);
});

// One of several pages using it.
define("UsrMyEntity1Page", ["UsrDiscountableMixin"], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		mixins: {
			UsrDiscountable: "Terrasoft.UsrDiscountableMixin"
		},
		attributes: {
			"UsrAmount": { dependencies: [{ columns: ["UsrAmount", "UsrDiscount"], methodName: "applyDiscount" }] }
		},
		methods: {
			// Override: same name as the mixin method, original called explicitly.
			applyDiscount: function() {
				if (this.get("UsrIsFixedPrice")) {
					return;
				}
				this.mixins.UsrDiscountable.applyDiscount.call(this);
			}
		}
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// ROUTE A - pure helpers: a schema of type "Module" returning plain functions
// (observed pattern). No $context, no sdk state inside.
define("UsrDiscountUtils", [], function() {
	return {
		calculateDiscountedAmount: function(amount, percent) {
			const value = (Number(amount) || 0) * (1 - (Number(percent) || 0) / 100);
			return Math.round(value * 100) / 100;
		}
	};
});

// ROUTE B - page behaviour as a custom request, handled on the page.
// The attribute change handler replaces `dependencies` + methodName and
// dispatches the shared request; the override becomes a guard before next.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["UsrDiscountUtils"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(discountUtils)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrAmount_a1b2c3d" ||
							request.attributeName === "PDS_UsrDiscount_b2c3d4e") {
						await request.$context.executeRequest({
							type: "usr.ApplyDiscountRequest",
							$context: request.$context
						});
					}
					return next?.handle(request);
				}
			},
			{
				// The former page override: runs first, decides whether the
				// shared logic runs at all.
				request: "usr.ApplyDiscountRequest",
				handler: async (request, next) => {
					if (await request.$context.PDS_UsrIsFixedPrice_c3d4e5f) {
						return;
					}
					return next?.handle(request);
				}
			},
			{
				// The former mixin method. With ROUTE C below this handler is
				// deleted from every page and lives once in the remote module.
				request: "usr.ApplyDiscountRequest",
				handler: async (request, next) => {
					const amount = await request.$context.PDS_UsrAmount_a1b2c3d;
					const percent = await request.$context.PDS_UsrDiscount_b2c3d4e;
					request.$context.PDS_UsrTotal_d4e5f6a = discountUtils.calculateDiscountedAmount(amount, percent);
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});

// ROUTE C - one shared handler for every page that had the mixin
// (TypeScript, in a remote-module Angular project):
//
//	@CrtRequestHandler({
//		type: "usr.ApplyDiscountHandler",
//		requestType: "usr.ApplyDiscountRequest",
//		// Page codes that used the mixin. Empty = every Freedom UI page.
//		scopes: ["UsrMyPage_FormPage", "UsrOtherPage_FormPage"]
//	})
//	export class ApplyDiscountHandler extends BaseRequestHandler {
//		public async handle(request: BaseRequest): Promise<unknown> {
//			// Same attribute names on every scoped page (see header).
//			const amount = await request.$context["UsrAmountValue"];
//			const percent = await request.$context["UsrDiscountValue"];
//			request.$context["UsrTotalValue"] = calculateDiscountedAmount(amount, percent);
//			return this.next?.handle(request);
//		}
//	}
//
//	@CrtModule({ requestHandlers: [ApplyDiscountHandler] })
//	@NgModule({ ... })
//	export class AppModule { /* bootstrapCrtModule("<remote name>", AppModule) per the project template */ }
