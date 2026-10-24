// --- How to debug a migrated Freedom UI page (handlers, requests, data sources) ---
// Reference text with small snippets. Debugging a Classic UI page meant a
// breakpoint in a method and reading the view model through `this`
// (this.get("UsrX"), this.sandbox) in the console. A Freedom UI
// page has no `this` and no view model object to poke: everything that
// happens on it is a REQUEST (crt.* or usr.*) passing through a chain of
// handlers, and every value is read asynchronously from request.$context.
// So the first tool is a temporary handler that logs each request it sees,
// then the Network tab for what the data sources really sent.
//
// API MAP
//   breakpoint in a Classic method, `this.get("UsrX")` in the console
//                                  ->  breakpoint (or `debugger;`) in a handler,
//                                      `await request.$context.PDS_UsrX_a1b2c3d` in the console
//   this.sandbox.publish / subscribe tracing
//                                  ->  log request.type in a handler per request type
//   "which column changed" (dependencies / on change events)
//                                  ->  crt.HandleViewModelAttributeChangeRequest:
//                                      request.attributeName, request.value, request.oldValue
//   "which grid / lookup is loading"
//                                  ->  crt.LoadDataRequest: request.dataSourceName
//   IsDebug system setting (unminified separate files)
//                                  ->  same setting (Academy, Classic context; effect on
//                                      Freedom schemas observed)
//   ESQ request in the Network tab  ->  data source requests in the Network tab (observed:
//                                      DataService endpoints); OData only if YOUR code calls it
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - There is no console object for "the page". Inspect inside a paused
//     handler: `request` and `request.$context` are in scope, and DevTools
//     accepts `await` in the console while paused (standard browser feature).
//   - Requests are not events: a handler that forgets `return next?.handle(request)`
//     stops every handler behind it, including Creatio's own (save, load,
//     open page). Nothing logs an error.
//   - Generated names (PDS_UsrName_a1b2c3d, <list>DS, <attr>_List_DS) are the
//     usual cause of "nothing happens". Read them from the schema, never guess.
//   - The order in which several handlers for one request run (page, parent
//     schema, remote-module handlers) is not documented; observe it with the
//     logger below rather than assuming it.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A filter "silently not applied" is almost always one of: the handler checks
//   a data source name the page does not have; the filter was built from the
//   return value of addSchemaColumnFilterWithParameter (void, so undefined is
//   pushed); the parameter was pushed AFTER `next?.handle(request)` already
//   ran; the lookup list loaded once and is not reloaded (8.0.10+). The logger
//   and the request payload in the Network tab tell these apart in a minute.
//
// See: Recipes/Pitfalls/MigrationPitfalls.js
// See: Recipes/Attributes/HowToMigrateLookupFilter.js
// Applies: Freedom UI 8.1+ (the same approach works on 8.0 with viewModelConfig / modelConfig names)
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/development-tools/debugging-tools/front-end-debugging/debug-the-client-code
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: HandleViewModelAttributeChangeRequest.attributeName/value/oldValue, DataRequest.dataSourceName, BaseRequest.type/$context/scopes)

// ===== 1. SWITCH ON READABLE SCRIPTS ========================================
//
// System setting "Debug mode" (code IsDebug) = true, or in the console of the
// Classic shell, per Academy:
//
//	Terrasoft.SysSettings.postPersonalSysSettingsValue("IsDebug", true);
//
// Reload. Client scripts then load as separate, unminified files instead of
// the combined build (Academy, Classic context; effect on Freedom schemas
// observed), so Sources > search (Ctrl+Shift+F) finds your
// schema by its name and breakpoints stay where you put them. It slows the
// application down: switch it off afterwards. A `debugger;` statement in a
// handler also pauses there while DevTools is open.

// ===== 2. A TEMPORARY REQUEST LOGGER ========================================
//
// Add to the page's handlers while debugging, remove before shipping. There
// is no wildcard request type, so list the ones you care about. Each entry
// logs and passes the request on unchanged.
//
//	const usrLog = (label) => async (request, next) => {
//		console.log("[UsrDebug]", label, {
//			type: request.type,
//			attributeName: request.attributeName,     // attribute change only
//			value: request.value,
//			oldValue: request.oldValue,
//			dataSourceName: request.dataSourceName,   // crt.LoadDataRequest
//			parameters: request.parameters            // filters pushed so far
//		});
//		const result = await next?.handle(request);
//		console.log("[UsrDebug]", label, "done", result);
//		return result;
//	};
//
//	handlers: /**SCHEMA_HANDLERS*/[
//		{ request: "crt.HandleViewModelInitRequest", handler: usrLog("init") },
//		{ request: "crt.HandleViewModelAttributeChangeRequest", handler: usrLog("change") },
//		{ request: "crt.LoadDataRequest", handler: usrLog("load") },
//		{ request: "crt.SaveRecordRequest", handler: usrLog("save") },
//		{ request: "usr.ApplyDiscountRequest", handler: usrLog("custom") },
//		// ... the page's real handlers ...
//	]/**SCHEMA_HANDLERS*/,
//
// (Define usrLog inside the define(...) callback, above `return {`.)
//
// What to read in the output:
//   - "change" never shows your attribute     -> wrong generated name in your
//                                                 `if`, or the field is bound
//                                                 to another attribute.
//   - "load" shows dataSourceName "X_List_DS" -> that is the name your lookup
//                                                 filter must test for.
//   - "load" shows parameters without your    -> the filter push ran after
//     filter                                     next, or pushed undefined.
//   - "init"/"save" logs the first line but   -> a handler BEHIND the logger did
//     never "done", and the page is stuck        not return next?.handle(...) or
//                                                 threw; check the console for
//                                                 an unhandled rejection.
//   - the page never opens (splash / loading  -> on 10.1.796: "Property message
//     mask stays), no logger line                is not defined in validator
//                                                 params config" (validator type
//                                                 without "message" in params), or
//                                                 a TypeError on control.replace
//                                                 (a crt.Input without "control")
//                                                 - observed, see
//                                                 Pitfalls/MigrationPitfalls 31-32.
//   - a custom request logs twice             -> dispatched both declaratively
//                                                 (button "clicked") and from
//                                                 code (executeRequest).

// ===== 3. HANDLER CHAIN CHECKS ==============================================
//
// For every handler in the schema, check:
//   [ ] every path returns next?.handle(request) - including early `if` exits,
//       unless swallowing the request is the intended behaviour (then write a
//       comment saying so);
//   [ ] parameters (filters) are pushed BEFORE next is called; values written
//       to $context AFTER next if they must survive Creatio's own processing;
//   [ ] each $context read is awaited (a Promise compared to a value is never
//       equal, and `if (promise)` is always true);
//   [ ] a try/catch around remote calls logs the error and still decides
//       explicitly whether to call next.
// A handler that throws stops the chain like a missing next, but leaves an
// "Uncaught (in promise)" entry in the console - search for that first.

// ===== 4. FINDING THE GENERATED NAMES =======================================
//
// The names to test for are in the page schema itself, not in the Classic
// code: open the schema source (Configuration section, or the designer's
// source code view) and read
//   viewModelConfigDiff > attributes   ->  PDS_UsrName_a1b2c3d, Items, <list>_SelectionState
//   modelConfigDiff > dataSources      ->  PDS, GridDetail_x1y2z3aDS, ...
//   viewConfigDiff                     ->  "control": "$PDS_UsrName_a1b2c3d" on each field,
//                                          "items": "$GridDetail_x1y2z3a" on each list
// A lookup's list data source is "<lookup attribute>_List_DS" (documented in
// community articles; verified on Creatio 10.1.796, tools/verify). It goes
// through crt.LoadDataRequest only when the dropdown opens, and list data
// sources load after render, not with "PDS" (observed on 10.1.796). When a
// name still looks wrong, the logger in section 2 prints what the page
// actually uses.

// ===== 5. NETWORK TAB =======================================================
//
// Filter by "DataService" (observed: Freedom UI data sources post select,
// insert, update and delete queries there). For a "missing filter" or "slow
// page":
//   - open the request payload: are YOUR filter columns there? Are the
//     selected columns only the ones the page shows?
//   - count the requests for one user action: N identical selects after one
//     edit mean a reload or a load in a loop
//     (See: Recipes/Data/HowToAvoidSlowAsyncPatterns.js);
//   - service calls from sdk.HttpClientService show under their own URL
//     (rest/<Service>/<Method> or 0/rest/... - observed, depends on the URL
//     you passed); OData requests appear only if your code calls OData.
// A 200 response with success false and an errorInfo is still a failure:
// read the response body, not just the status.

// ===== 6. CLASSIC REFLEXES THAT DO NOT WORK =================================
//
//   Classic habit                           Freedom UI
//   this.get("UsrX") in the console         no `this`; await request.$context.<attr> while paused
//   Terrasoft.* inspection of the page      the page is not a Terrasoft object
//   sandbox message logging                 no sandbox; log request types (section 2)
//   "method is never called" -> check bindTo   "handler never runs" -> check request type
//                                              spelling (crt. vs usr.), scopes of remote
//                                              handlers, and that the element binds the request
//   reloading the page after a schema edit  still needed; also clear the browser cache
//                                            for remote-module bundles
