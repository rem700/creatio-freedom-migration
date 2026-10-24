// --- How to migrate Terrasoft.ServerChannel.on / un listeners to sdk.MessageChannelService ---
// Classic UI receives messages pushed by the server
// (MsgChannelUtilities.PostMessage / PostMessageToAll) by attaching
// Terrasoft.ServerChannel.on(Terrasoft.EventName.ON_MESSAGE, handler, this) in
// init and detaching with .un(...) - same handler, same scope - in destroy; the
// handler filters on message.Header.Sender and decodes message.Body (a JSON
// string). Freedom UI's typed route is sdk.MessageChannelService:
// `await channel.subscribe(sender, callback)` filters by sender for you and
// resolves to a Subscription; unsubscribe through that object. Subscribe in
// crt.HandleViewModelResumeRequest and unsubscribe in
// crt.HandleViewModelPauseRequest.
//
// API MAP
//   Terrasoft.ServerChannel.on(Terrasoft.EventName.ON_MESSAGE, fn, this)
//                                   ->  const sub = await new sdk.MessageChannelService()
//                                           .subscribe("UsrSender", (event) => { ... })
//   Terrasoft.ServerChannel.un(Terrasoft.EventName.ON_MESSAGE, fn, this)
//                                   ->  sub.unsubscribe()   (on the Subscription, not the service)
//   if (message.Header.Sender !== "UsrSender") return;
//                                   ->  the `sender` argument of subscribe
//   message.Header.Sender           ->  event.header.sender   (lower case)
//   Ext.decode(message.Body)        ->  event.body; JSON.parse only if it is still a string
//   subscribe in init()             ->  crt.HandleViewModelResumeRequest
//   unsubscribe in destroy()        ->  crt.HandleViewModelPauseRequest
//   handler kept as a method        ->  the Subscription kept in a DECLARED attribute,
//                                       read back with await on pause
//   if (this.destroyed) return;     ->  not needed once pause unsubscribes
//   client -> server / other users  ->  channel.sendMessage(sender, body, sdk.MessageChannelType.PTP |
//                                       BROADCAST | SERVER)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Destroy is not where cleanup goes: Academy puts listener cleanup in the
//     Pause handler, and crt.HandleViewModelDestroyRequest does not fire on
//     navigation to another section: only Pause does, and Back resumes the
//     same view model; the close button runs Pause, then Destroy (verified on
//     Creatio 10.1.796, tools/verify).
//     See: Recipes/Lifecycle/HowToMigrateDestroyAndCleanup.js
//   - subscribe() is async. Store the RESOLVED Subscription, not the promise,
//     or `unsubscribe is not a function` on pause.
//   - The Subscription is an object, not a function reference: nothing has to be
//     "the same function" any more, which removes the classic scope bug.
//   - Terrasoft.ServerChannel still exists in the browser and a Freedom page can
//     reach it (CustomerFX shows that route), but it is a Classic global; use
//     the devkit service in new code. MessageChannelService is absent from
//     @creatio-devkit/common 0.815.0 and present from 0.820.0 (published
//     typings): on an older build check that sdk.MessageChannelService exists.
//   - The server side does not change: MsgChannelUtilities.PostMessage with the
//     same sender name.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Subscribing in crt.HandleViewModelInitRequest and unsubscribing in Destroy
//   adds one more listener on every visit to the page; each server message is
//   then handled N times (N reloads, N dialogs). Porting the filter as
//   `event.Header.Sender` reads undefined - with subscribe(sender, ...) that
//   check is redundant anyway, but a copied `if (... !== ...) return;` makes the
//   callback ignore every message.
//
// Applies: Creatio 8.1+ (needs @creatio-devkit/common 0.820.0+ for MessageChannelService); Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: MessageChannelService, MessageChannelEvent, Subscription)
// Source: https://customerfx.com/article/receiving-server-side-messages-in-a-creatio-freedom-ui-page/
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.3/platform-customization/freedom-ui/close-the-websocket

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const SenderStatusChanged = "UsrMyEntityStatusChanged";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			init: function() {
				this.callParent(arguments);
				Terrasoft.ServerChannel.on(Terrasoft.EventName.ON_MESSAGE,
					this.onServerMessageReceived, this);
			},
			onServerMessageReceived: function(channel, message) {
				if (this.destroyed || !message || !message.Header ||
					message.Header.Sender !== SenderStatusChanged) {
					return;
				}
				var payload = Ext.decode(message.Body);
				if (payload.recordId !== this.get("Id")) {
					return;
				}
				this.reloadEntity();
			},
			destroy: function() {
				Terrasoft.ServerChannel.un(Terrasoft.EventName.ON_MESSAGE,
					this.onServerMessageReceived, this);
				this.callParent(arguments);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const SenderStatusChanged = "UsrMyEntityStatusChanged";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// Holds the Subscription between resume and pause.
					"UsrStatusSubscription": {}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelResumeRequest",
				handler: async (request, next) => {
					// Guard against a double resume leaving two subscriptions.
					(await request.$context.UsrStatusSubscription)?.unsubscribe();
					const channel = new sdk.MessageChannelService();
					request.$context.UsrStatusSubscription = await channel.subscribe(
						SenderStatusChanged,
						async (event) => {
							const body = typeof event.body === "string"
								? JSON.parse(event.body)
								: event.body;
							if (body?.recordId !== await request.$context.PDS_Id_a1b2c3d) {
								return;
							}
							await request.$context.executeRequest({
								type: "crt.LoadDataRequest",
								$context: request.$context,
								config: { loadType: "reload", useLastLoadParameters: true },
								dataSourceName: "PDS"
							});
						});
					return next?.handle(request);
				}
			},
			{
				request: "crt.HandleViewModelPauseRequest",
				handler: async (request, next) => {
					const subscription = await request.$context.UsrStatusSubscription;
					subscription?.unsubscribe();
					request.$context.UsrStatusSubscription = null;
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
