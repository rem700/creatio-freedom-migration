// --- How to migrate attribute dependencies (change handlers) to Freedom UI -----
// Classic UI reacts to a column change with `dependencies` on an attribute
// ({ columns: [...], methodName }) or with this.on("change:Column", fn, this),
// and guards load-time firing with this.get("IsEntityInitialized"). Freedom UI
// has two routes: the "change" key on one attribute, which runs a named request,
// and crt.HandleViewModelAttributeChangeRequest, which fires for EVERY attribute
// and carries attributeName, value and oldValue. Both also fire while the
// record loads.
//
// API MAP
//   "dependencies": [{ columns: ["UsrService"], ->  attribute "change": { "request": "usr.OnServiceChange" }
//     methodName: "onUsrServiceChange" }]          + handler for "usr.OnServiceChange"
//   columns: ["UsrStatus", "UsrMethod"] (host)  ->  crt.HandleViewModelAttributeChangeRequest,
//                                                   branch on request.attributeName
//   this.on("change:UsrAmount", fn, this)       ->  same request; no subscription to remove
//   this.get("UsrService") in the handler       ->  request.value (attribute-change request)
//                                                   or await request.$context.<attr> ("change" key)
//   previous value (kept by hand in Classic) ->  request.oldValue
//   if (!this.get("IsEntityInitialized")) return ->  if (request.value === request.oldValue) return,
//                                                   or a one-shot "loaded" flag (see below)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - IsEntityInitialized has no Freedom UI counterpart. request.silent (true
//     during model load) is DEPRECATED in the typings. To keep a "clear the
//     child" reaction from wiping stored data on load, act only when the user
//     changed the value: compare value/oldValue AND check a flag set after
//     the model finished loading.
//     See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   - Do NOT filter out load-time changes for handlers that compute UI state
//     (readonly, visible, required): the load-time call is what applies the
//     state to a saved record.
//   - The "change" handler gets no value in the request; read the attribute
//     with await. It is used by designer-generated schemas but not described on
//     Academy (observed).
//   - Wiring both routes for one attribute runs both. Pick one.
//   - Attribute names are the generated ones (PDS_UsrService_a1b2c3d).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Two fields that recalculate each other (amount <-> percent) loop: each
//   write fires the other handler. Classic tolerated it when values settled;
//   in Freedom UI write only when the new value differs from the current one.
//   A handler that does not call `return next?.handle(request)` stops the
//   chain: other packages' and stock handlers for the same change never run.
//
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: HandleViewModelAttributeChangeRequest)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrService": {
				"dependencies": [
					{ "columns": ["UsrService"], "methodName": "onUsrServiceChange" }
				]
			},
			"UsrAmount": {
				"dependencies": [
					{ "columns": ["UsrAmount", "UsrPartAmount"], "methodName": "recalculatePercent" }
				]
			}
		},
		methods: {

			// Clear the dependent field, but not while the record loads.
			onUsrServiceChange: function() {
				if (!this.get("IsEntityInitialized")) {
					return;
				}
				this.set("UsrLoadType", null);
			},

			recalculatePercent: function() {
				var amount = this.get("UsrAmount");
				var part = this.get("UsrPartAmount");
				if (amount) {
					this.set("UsrPartPercent", Math.round(part / amount * 10000) / 100);
				}
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// Was "dependencies" on UsrService: one attribute, one request.
					"PDS_UsrService_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrService" },
						"change": { "request": "usr.OnServiceChange" }
					},
					// Set once the record has loaded (see the init recipe).
					"UsrIsModelLoaded": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					request.$context.events$.subscribe((evt) => {
						if (evt?.type === "finish-load-model-attributes") {
							request.$context.UsrIsModelLoaded = true;
						}
					});
				}
			},
			{
				// Was onUsrServiceChange with the IsEntityInitialized guard.
				request: "usr.OnServiceChange",
				handler: async (request, next) => {
					if (await request.$context.UsrIsModelLoaded) {
						request.$context.PDS_UsrLoadType_b2c3d4e = null;
					}
					return next?.handle(request);
				}
			},
			{
				// Was the host dependency over UsrAmount + UsrPartAmount.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					const watched = ["PDS_UsrAmount_c3d4e5f", "PDS_UsrPartAmount_d4e5f6a"];
					if (watched.includes(request.attributeName) &&
						request.value !== request.oldValue) {
						const amount = await request.$context.PDS_UsrAmount_c3d4e5f;
						const part = await request.$context.PDS_UsrPartAmount_d4e5f6a;
						if (amount) {
							const percent = Math.round(part / amount * 10000) / 100;
							// Write only on a real difference: no ping-pong.
							if (await request.$context.PDS_UsrPartPercent_e5f6a7b !== percent) {
								request.$context.PDS_UsrPartPercent_e5f6a7b = percent;
							}
						}
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
