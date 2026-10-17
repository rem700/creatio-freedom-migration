// --- How to migrate ServiceHelper.callService to Freedom UI ------------------
// Classic UI calls a configuration web service with
// ServiceHelper.callService({ serviceName, methodName, data, callback, scope })
// (dependency "ServiceHelper"). The callback receives (response, success) on
// success AND on failure. Freedom UI calls the same service from a handler with
// sdk.HttpClientService: `await new sdk.HttpClientService().post(url, body)`
// (or get / put / patch / delete) and gets an HttpResponse
// { ok, status, statusText, headers, url, body } with the JSON body parsed.
// The C# service does not change.
//
// API MAP
//   define(..., ["ServiceHelper"], ...)      ->  SCHEMA_DEPS ["@creatio-devkit/common"], arg sdk
//   ServiceHelper.callService({ serviceName: "UsrMyService", methodName: "GetDiscount", data })
//                                            ->  await new sdk.HttpClientService().post(
//                                                    "/rest/UsrMyService/GetDiscount", data)
//   GET-style service method                 ->  httpClientService.get("/rest/UsrMyService/M?x=" +
//                                                    encodeURIComponent(x))
//   callback(response, success)             ->  const response = await ...; response.ok / status
//   success === false                        ->  !response.ok, or a rejected promise: handle both
//   response.GetDiscountResult               ->  response.body?.GetDiscountResult   (Wrapped only)
//   Terrasoft.AjaxProvider.request({ url })  ->  the same HttpClientService call
//   headers / responseType                   ->  third argument { headers, responseType:
//                                                    "json" | "text" | "blob" | "arraybuffer" }
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The result moves one level down: Classic `response.XResult`, Freedom
//     `response.body.XResult`. `response` itself is now the HTTP envelope.
//   - "<Method>Result" exists ONLY when the [WebInvoke] uses
//     BodyStyle = WebMessageBodyStyle.Wrapped (Academy's template does). With
//     Bare the value IS the body. Read the C# attribute, do not guess.
//   - Classic's single (response, success) callback becomes two failure
//     paths: a resolved response with ok === false, and a rejected promise
//     (network error). The typings do not state which non-2xx codes reject,
//     so check ok AND wrap in try/catch.
//   - The URL is relative ("/rest/..."); the client adds the application root.
//     ServiceHelper took the service and method names instead. Portal users
//     still need an [SspServiceRoute] service; test the URL prefix from a
//     portal session before relying on it.
//   - The CSRF header is added for you, like ServiceHelper did (observed).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Porting `response.GetDiscountResult` as-is reads a property of the HTTP
//   envelope: always undefined, no error, and the field simply stays empty. Same
//   result when the service is Bare and you read body.XResult. Classic code that
//   tested `success` and nothing else now passes a 500 response as success,
//   because a resolved promise is not a successful call - test response.ok.
//
// Applies: Creatio 8.1+ (HttpClientService in every published @creatio-devkit/common, 0.803.0+); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/send-a-web-service-request/examples/call-a-web-service-front-end
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: HttpClientService, HttpResponse)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/ (ServiceHelper)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ServiceHelper"], function(ServiceHelper) {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			loadDiscount: function() {
				var account = this.get("UsrAccount");
				if (!account) {
					return;
				}
				Terrasoft.MaskHelper.ShowBodyMask();
				ServiceHelper.callService({
					serviceName: "UsrMyService",
					methodName: "GetDiscount",
					data: { accountId: account.value },
					callback: function(response, success) {
						Terrasoft.MaskHelper.HideBodyMask();
						var discount = success && response ? response.GetDiscountResult : null;
						if (discount == null) {
							this.showInformationDialog(this.get("Resources.Strings.ServiceCallFailedMessage"));
							return;
						}
						this.set("UsrDiscount", discount);
					},
					scope: this
				});
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.LoadDiscountRequest",
				handler: async (request, next) => {
					const account = await request.$context.PDS_UsrAccount_a1b2c3d;
					if (!account?.value) {
						return next?.handle(request);
					}
					const maskService = new sdk.MaskService();
					const httpClientService = new sdk.HttpClientService();
					await maskService.showBodyMask();
					try {
						const response = await httpClientService.post(
							"/rest/UsrMyService/GetDiscount",
							{ accountId: account.value });
						// Wrapped BodyStyle: the value is under "<Method>Result" in body.
						const discount = response?.ok ? response.body?.GetDiscountResult : null;
						if (discount == null) {
							await request.$context.executeRequest({
								type: "crt.ShowDialogRequest",
								$context: request.$context,
								dialogConfig: {
									data: {
										message: await request.$context.Resources.Strings.ServiceCallFailedMessage,
										actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
									}
								}
							});
						} else {
							request.$context.PDS_UsrDiscount_b2c3d4e = discount;
						}
					} catch (e) {
						console.error(e);
					} finally {
						await maskService.hideBodyMask();
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
