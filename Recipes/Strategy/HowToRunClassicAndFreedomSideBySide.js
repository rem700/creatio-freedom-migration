// --- How to run Classic UI and Freedom UI side by side during migration -------
// Reference text. Classic UI and Freedom UI share one database, one object
// model, the same C# web services, business processes and server-side
// messaging; they do NOT share client code, sandbox messages, page schemas,
// business rules or localizable strings. Coexistence is configured, not coded:
// per user/group shell (UI Management > "UI Preferences"), per object page
// choice ("Form page preferences"), per workplace sections. Logic both UIs
// need belongs on the server; the client halves stay thin.
//
// API MAP
//   shared logic in a Classic mixin/module     ->  C# service or business process, called
//                                                 from Classic (ServiceHelper) and Freedom
//                                                 (sdk.HttpClientService / crt.RunBusinessProcessRequest)
//   Classic page <-> Freedom page messaging     ->  no client channel; server messages
//                                                 (MsgChannelUtilities) reach both, or the database
//   Classic section opening the Freedom page    ->  "Form page preferences" object exception
//   Classic-only module on a Freedom page       ->  custom view element hosting the module (see below)
//   Classic shell URL                          ->  [Creatio URL]/0/Nui/ViewModule.aspx
//   Freedom UI shell URL                       ->  [Creatio URL]/0/Shell/
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - A sandbox message published by a Classic module is never seen by a
//     Freedom UI page, and a crt./usr. request never reaches a Classic module.
//   - Freedom UI object-level business rules do not apply to Classic pages;
//     Classic businessRules do not apply to Freedom UI pages. During the
//     transition the rule exists twice - or, better, as a server-side check.
//   - Shell and page preferences take effect after the user logs out and in.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Moving a calculation to the Freedom UI page while some users still edit
//   the record on the Classic page leaves one UI enforcing it and the other
//   not: records saved from Classic skip the rule without any error.
//
// See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
// See: Recipes/Strategy/HowToPlanClassicToFreedomMigration.js
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/manage-the-form-pages-overview
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/general-procedure
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: HttpClientService, MessageChannelService, registerViewElement)

// ===== WHO SEES WHAT =========================================================
//
//   Shell        Studio > UI Management > "UI Preferences": "Switch to Freedom
//                UI for all users", or per user/group with "Freedom UI is
//                enabled" and a Priority (the lower number wins on conflict).
//   Sections     Workplace setup: a workplace can hold the Classic section,
//                another the Freedom UI section of the same object. Academy:
//                you can leave the Classic UI section in workplaces for
//                certain roles.
//   Pages        "Form page preferences": which page type opens per shell,
//                with per-object exceptions (Classic UI sections only).
//                See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js

// ===== OPENING ONE FROM THE OTHER ============================================
//
//   Classic section -> Freedom UI page
//     Configuration: an object exception in "Form page preferences" makes the
//     Classic section open the Freedom UI page (Academy). Classic CODE that
//     calls openCardInChain with a Classic schemaName keeps opening that
//     Classic schema; there is no documented Classic API that opens a Freedom
//     UI page by schema name. Rely on the configuration, and test.
//
//   Freedom UI page -> Classic page
//     No documented request opens a Classic page schema from a Freedom UI
//     handler. crt.OpenPageRequest / crt.UpdateRecordRequest target Freedom UI
//     pages. Keep the user in one shell per task.
//
//   Classic-only MODULE inside a Freedom UI page
//     A custom view element that extends the platform's Base7xViewElement gets
//     a sandbox and can sandbox.loadModule a Classic module (the usual case is
//     the Classic filter builder "FilterEditModule"), registered with
//     sdk.registerViewElement. This is a community pattern, not an Academy
//     contract (observed); unload the module in disconnectedCallback.
//     See: Recipes/UI/HowToMigrateCustomControl.js

// ===== SHARING LOGIC =========================================================
//
//   1. Server first. Validation that must hold for every UI and integration
//      goes into an entity event listener or a business process; computed
//      values into the process or the service. Both pages then only display.
//   2. One web service, two thin callers:
//        Classic:  ServiceHelper.callService({ serviceName: "UsrMyService",
//                      methodName: "GetDiscount", data, callback, scope })
//        Freedom:  await new sdk.HttpClientService().post(
//                      "/rest/UsrMyService/GetDiscount", data)
//      See: Recipes/Data/HowToMigrateServiceHelperCalls.js
//   3. Server -> clients: MsgChannelUtilities on the server reaches Classic
//      (Terrasoft.ServerChannel) and Freedom UI (sdk.MessageChannelService)
//      listeners alike - the one channel both generations hear.
//      See: Recipes/Messaging/HowToMigrateServerChannel.js
//   4. Pure client helpers: a schema of type Module whose body uses neither
//      Terrasoft/Ext nor sdk can be listed as a dependency by a Classic page
//      (define deps) and by a Freedom UI page (SCHEMA_DEPS) (observed). Keep it
//      to plain functions over plain values; anything touching the view model
//      differs between generations.

// ===== INTEROP LIMITS (CHECKLIST) ============================================
//
//   - No sandbox between generations; no shared view model.
//   - Localizable strings are per schema: the Freedom UI page needs its own.
//   - Business rules are per generation (Classic page rules vs Freedom UI
//     page/object rules).
//   - Operation permissions, system settings, feature toggles and lookups are
//     shared data: one change affects both UIs.
//   - Users switch shells only after logging out and in; plan announcements.
//   - Test every migrated object in both shells while both are in use.

// ===== ILLUSTRATION: A PURE HELPER BOTH GENERATIONS CAN LIST =================

define("UsrDiscountRules", [], function() {
	// No Terrasoft, no sdk: plain values in, plain values out.
	function calculateDiscount(amount, isVip) {
		if (!amount || amount <= 0) {
			return 0;
		}
		return isVip ? Math.min(amount * 0.1, 500) : 0;
	}
	return { calculateDiscount: calculateDiscount };
});

// Classic:  define("UsrMyEntity1Page", ["UsrDiscountRules"], function(UsrDiscountRules) { ...
//               this.set("UsrDiscount", UsrDiscountRules.calculateDiscount(
//                   this.get("UsrAmount"), this.get("UsrIsVip"))); ... });
// Freedom:  /**SCHEMA_DEPS*/["UsrDiscountRules"]/**SCHEMA_DEPS*/ ... (usrDiscountRules) ...
//               request.$context.PDS_UsrDiscount_a1b2c3d = usrDiscountRules.calculateDiscount(
//                   await request.$context.PDS_UsrAmount_b2c3d4e,
//                   await request.$context.PDS_UsrIsVip_c3d4e5f);
