// --- How to migrate destroy() cleanup to Freedom UI ----------------------------
// Classic UI releases what a page attached (server channel listeners, timers,
// observers, this.on("change:...") subscriptions) in an override of destroy(),
// calling the parent LAST. A Freedom UI page view model is usually not
// destroyed when the user navigates away: it is PAUSED and later RESUMED.
// Attach global listeners in crt.HandleViewModelResumeRequest and release them
// in crt.HandleViewModelPauseRequest, keeping the handle in a declared attribute.
//
// API MAP
//   init(): Terrasoft.ServerChannel.on(...) ->  crt.HandleViewModelResumeRequest (attach)
//   destroy(): ...un(...); callParent        ->  crt.HandleViewModelPauseRequest (detach)
//   destroy() for module unload              ->  crt.HandleViewModelDestroyRequest
//                                               (synchronous code only)
//   this._timerId (instance field)           ->  attribute declared in viewModelConfigDiff,
//                                               read back with await
//   this.on("change:X", fn, this) / this.un  ->  nothing to release: a change handler or
//                                               "change" key is part of the schema
//   this.destroyed check in callbacks        ->  clear the timer/listener on pause instead
//   Terrasoft.ServerChannel                  ->  sdk.MessageChannelService
//                                               (see HowToMigrateServerChannel)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Pause/resume run on EVERY visit; Classic init/destroy ran once per page
//     instance. Resume also fires on the first open, right after Init, so it
//     replaces init for the attach step (verified on Creatio 10.1.796,
//     tools/verify).
//   - Academy's WebSocket example releases resources in the PAUSE handler,
//     "called every time you open a different page", because Freedom UI keeps
//     the view model and restores its last state on return. Navigating to
//     another section runs Pause only, no Destroy; Back runs Resume on the
//     same view model with its state kept (dirty flag, typed values); the
//     page's close button runs Pause, then Destroy (verified on Creatio
//     10.1.796, tools/verify). Cleanup placed only in
//     crt.HandleViewModelDestroyRequest does not run on ordinary navigation.
//   - Leaving a page with unsaved changes through the section menu shows NO
//     unsaved-changes prompt (observed on 10.1.796); the edits wait in the
//     paused view model.
//   - Pause is not called when the user leaves before the view model is
//     attached (Academy); guard resume against a second timer anyway.
//   - Handles kept on `this` or in a closure variable are shared by every
//     instance of the schema. Store them in a declared attribute.
//   - Do not use crt.ClosePageRequest for cleanup: a page left by navigation is
//     paused, not closed.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Moving destroy() code into a crt.HandleViewModelDestroyRequest handler (the
//   name looks right) means it may not run on ordinary navigation: the interval
//   keeps reloading data for a page nobody sees, and every revisit adds one
//   more. An async destroy handler can also be cut off before it finishes.
//
// Applies: Creatio 8.1+ (Pause-handler cleanup as in Academy's 8.3 WebSocket example; Pause/Resume/Destroy sequence observed on 10.1.796); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.3/platform-customization/freedom-ui/close-the-websocket
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			init: function() {
				this.callParent(arguments);
				Terrasoft.ServerChannel.on(Terrasoft.EventName.ON_MESSAGE,
					this.onServerMessageReceived, this);
				this._refreshTimerId = setInterval(this.reloadEntity.bind(this), 60000);
			},

			onServerMessageReceived: function(channel, message) {},

			// Release in reverse order, parent LAST.
			destroy: function() {
				Terrasoft.ServerChannel.un(Terrasoft.EventName.ON_MESSAGE,
					this.onServerMessageReceived, this);
				if (this._refreshTimerId) {
					clearInterval(this._refreshTimerId);
					this._refreshTimerId = null;
				}
				this.callParent(arguments);
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
					// Was this._refreshTimerId.
					"UsrRefreshTimerId": {}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Was init(): attach. Runs on the first open and on every return.
				request: "crt.HandleViewModelResumeRequest",
				handler: async (request, next) => {
					const existing = await request.$context.UsrRefreshTimerId;
					if (existing) {
						clearInterval(existing);
					}
					request.$context.UsrRefreshTimerId = setInterval(async () => {
						await request.$context.executeRequest({
							type: "crt.LoadDataRequest",
							$context: request.$context,
							config: { loadType: "reload", useLastLoadParameters: true },
							dataSourceName: "PDS"
						});
					}, 60000);
					return next?.handle(request);
				}
			},
			{
				// Was destroy(): detach. Runs whenever the page is left.
				request: "crt.HandleViewModelPauseRequest",
				handler: async (request, next) => {
					const timerId = await request.$context.UsrRefreshTimerId;
					if (timerId) {
						clearInterval(timerId);
						request.$context.UsrRefreshTimerId = null;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
