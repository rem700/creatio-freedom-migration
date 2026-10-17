// --- How to migrate sandbox messages (sandbox.publish / subscribe, tags) to Freedom UI ---
// Classic UI modules (page, detail, section, embedded module) are isolated and
// talk through the sandbox: a message is DECLARED in `messages` on both sides
// (mode PTP or BROADCAST, direction PUBLISH or SUBSCRIBE), sent with
// this.sandbox.publish(name, data, tags) and received with
// this.sandbox.subscribe(name, handler, scope, tags); a PTP publish returns the
// subscriber's return value synchronously. Freedom UI has NO sandbox and no
// message declarations. What was a message becomes, by case: a direct
// attribute read (a list/"detail" lives in the SAME view model as its page), a
// custom request handled by a handler (`usr.*`, dispatched with
// $context.executeRequest or sdk.HandlerChainService.instance.process), or -
// for decoupled notification across modules - sdk.MessageChannelService.
//
// API MAP
//   messages: { "UsrX": { mode, direction } }   ->  nothing to declare; a request name "usr.X"
//   sandbox.publish("UsrX", data) (PTP, needs the answer)
//                                     ->  const answer = await request.$context.executeRequest({
//                                             type: "usr.X", $context: request.$context, ...data })
//                                         with a handler that RETURNS the answer
//   sandbox.subscribe("UsrX", fn, this, tags)
//                                     ->  handlers: [{ request: "usr.X", handler: async (request, next) => ... }]
//   publish from code outside a handler (remote module, helper)
//                                     ->  await sdk.HandlerChainService.instance.process({ type: "usr.X", $context })
//   detail -> page: GetColumnsValues  ->  await request.$context.PDS_UsrStatus_b8c9d0e (same view model)
//   detail -> page: UpdateCardProperty ->  request.$context.PDS_UsrTotal_c9d0e1f = total
//   page -> detail: this.updateDetail({ detail })
//                                     ->  crt.LoadDataRequest { dataSourceName: "<List>DS",
//                                             config: { loadType: "reload", useLastLoadParameters: true } }
//   BROADCAST to every module in the tab
//                                     ->  no in-tab broadcast; closest: sdk.MessageChannelService
//                                         sendMessage(sender, body, sdk.MessageChannelType.PTP)
//                                         ("sent to the same user", through the server channel)
//   tags: [this.sandbox.id]           ->  no equivalent; routing is by request name plus the
//                                         $context you pass
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - No PTP-vs-BROADCAST model. A request goes through the handler chain of the
//     view model whose $context you pass (that schema, its parents, global
//     handlers from remote modules) - not to "whoever subscribed".
//   - The answer is ASYNC: executeRequest returns a promise of what the handler
//     returned. A function-style handler that returns without next?.handle
//     ends the chain there (nobody can extend it); to stay extensible write the
//     result onto request and `return next?.handle(request)`.
//   - MessageChannelService travels through the SERVER channel: PTP reaches the
//     sender (typings: PTP is "sent to the same user who sent the message
//     (client side)"), BROADCAST reaches all users.
//     It is not a cheap in-page bus; use it only for genuinely cross-page events.
//   - Subscribing to MessageChannelService belongs in Resume/Pause, not
//     Init/Destroy.
//   - Stock details are lists bound to a data source in the page; most Classic
//     detail <-> page messages simply disappear.
//     See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A `messages` block and this.sandbox calls copied into a Freedom schema are
//   ignored or throw "sandbox is undefined" only when reached. Worse, a ported
//   handler that "subscribes" by handling usr.X on page B never runs when page
//   A dispatches usr.X with ITS OWN $context: A's chain has no B handler, the
//   request resolves to undefined, and the caller treats it as "no answer".
//
// Applies: Creatio 8.1+ (the MessageChannelService route needs @creatio-devkit/common 0.820.0+); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/8.1/front-end-development/classic-ui/sandbox/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://customerfx.com/article/creating-custom-requests-and-calling-as-functions-on-a-creatio-freedom-ui-page/
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: HandlerChainService, MessageChannelService, MessageChannelType)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/platform-customization/freedom-ui/open-a-page-from-a-custom-handler/examples/open-a-freedom-ui-page (sdk.HandlerChainService.instance.process from a custom request handler)

// ===== CLASSIC UI (7.x) =====================================================

// Detail asks the page for values (PTP with an answer) and pushes a total back.
define("UsrMyDetail", [], function() {
	return {
		entitySchemaName: "UsrMyDetailEntity",
		messages: {
			"UsrGetDiscountRate": {
				"mode": Terrasoft.MessageMode.PTP,
				"direction": Terrasoft.MessageDirectionType.PUBLISH
			}
		},
		methods: {
			onRecalculateClick: function() {
				var master = this.sandbox.publish("GetColumnsValues", ["UsrStatus"], [this.sandbox.id]) || {};
				var rate = this.sandbox.publish("UsrGetDiscountRate", null, [this.sandbox.id]) || 0;
				var total = 0;
				this.getGridData().each(function(row) {
					total += (row.get("UsrAmount") || 0) * (1 - rate);
				}, this);
				if (master.UsrStatus) {
					this.sandbox.publish("UpdateCardProperty",
						{ key: "UsrTotal", value: total }, [this.sandbox.id]);
				}
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		messages: {
			"UsrGetDiscountRate": {
				"mode": Terrasoft.MessageMode.PTP,
				"direction": Terrasoft.MessageDirectionType.SUBSCRIBE
			}
		},
		methods: {
			init: function() {
				this.callParent(arguments);
				// Tag = the detail's sandbox id, so only that detail is answered.
				this.sandbox.subscribe("UsrGetDiscountRate", function() {
					return this.get("UsrDiscountRate") || 0;
				}, this, [this.getDetailId("UsrMyDetail")]);
			},
			onSaved: function() {
				this.callParent(arguments);
				this.updateDetail({ detail: "UsrMyDetail" });
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// The "detail" is a list on the same page: no messages at all.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Former PTP "UsrGetDiscountRate": a function-style request.
				request: "usr.GetDiscountRateRequest",
				handler: async (request) => {
					return (await request.$context.PDS_UsrDiscountRate_d0e1f2a) || 0;
				}
			},
			{
				request: "usr.RecalculateTotalRequest",
				handler: async (request, next) => {
					// GetColumnsValues -> read the page attribute directly.
					const status = await request.$context.PDS_UsrStatus_b8c9d0e;
					// publish(PTP) -> await the request's return value.
					const rate = await request.$context.executeRequest({
						type: "usr.GetDiscountRateRequest",
						$context: request.$context
					});
					const rows = await request.$context.UsrMyDetailList;
					let total = 0;
					for (const row of rows || []) {
						total += ((await row.UsrMyDetailListDS_UsrAmount) || 0) * (1 - rate);
					}
					if (status?.value) {
						// UpdateCardProperty -> assign the page attribute.
						request.$context.PDS_UsrTotal_c9d0e1f = total;
					}
					return next?.handle(request);
				}
			},
			{
				// onSaved + updateDetail -> reload the list's data source after save.
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					await request.$context.executeRequest({
						type: "crt.LoadDataRequest",
						$context: request.$context,
						config: { loadType: "reload", useLastLoadParameters: true },
						dataSourceName: "UsrMyDetailListDS"
					});
					return result;
				}
			},
			{
				// Cross-page notification (former BROADCAST): server channel, same user.
				request: "usr.NotifyDiscountChangedRequest",
				handler: async (request, next) => {
					const channel = new sdk.MessageChannelService();
					await channel.sendMessage("UsrDiscountChanged",
						{ recordId: await request.$context.PDS_Id_a1b2c3d },
						sdk.MessageChannelType.PTP);
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
