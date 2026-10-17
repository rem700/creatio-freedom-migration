// --- Rewrite in Freedom UI, keep in Classic UI, move logic to the backend, or hybrid: decision tree ---
// Reference text, no code. For each Classic UI (7.x) schema in the inventory,
// decide one of four routes before writing any Freedom UI (8.1+) code:
// REWRITE (new Freedom UI page/list/element), KEEP CLASSIC (leave the schema,
// keep the Classic shell or page preference for it), BACKEND (move the logic
// into a C# service, entity event or business process that both UIs use), or
// HYBRID (Freedom page now, one Classic part hosted or kept temporarily, logic
// on the server). The tree below asks the questions in the order that rules
// routes out fastest; each leaf says what follows from the choice.
//
// API MAP
//   heavy DOM / Ext controls / onRender    ->  REWRITE as a custom view element, or KEEP CLASSIC
//   mixins shared by many schemas          ->  BACKEND for the logic, REWRITE the UI
//   third-party Classic package            ->  KEEP CLASSIC until the vendor ships Freedom UI
//   rules that must hold in both UIs       ->  BACKEND (one check for every client)
//   simple field/rule logic                ->  REWRITE (often no-code business rules)
//   few users / end of life                ->  KEEP CLASSIC
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - "Keep Classic" is not free: the page stays on a shell that receives no
//     new Freedom UI features, and every shared rule exists twice until the
//     last Classic user is gone.
//   - "Backend" moves behaviour out of the page: instant feedback while typing
//     becomes a check at save time unless the page also keeps a client copy.
//   - A hybrid page that hosts a Classic module keeps sandbox messaging inside
//     that module only; it cannot talk to the Freedom page through the sandbox.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Rewriting a page while users still edit the same object on a Classic page
//   splits the rules: records saved from the Classic page skip the Freedom
//   page's checks without any error. Decide the backend route for shared
//   rules BEFORE the first Freedom page goes live.
//
// See: Recipes/Strategy/HowToPlanClassicToFreedomMigration.js
// See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
// See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
// Applies: Creatio 8.1+ (Freedom UI); Classic UI 7.x-8.x
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/app-management/move-a-classic-ui-section-to-freedom-ui
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/manage-the-form-pages-overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/remote-modules/freedom-ui-remote-module/overview

// ===== THE TREE ==============================================================
//
//  [Q1] Is the schema from a THIRD-PARTY Classic package (Marketplace, vendor)
//       that you cannot change, with no Freedom UI version announced?
//    |-- yes --> KEEP CLASSIC (L1). Ask the vendor; revisit at their release.
//    |
//    no
//    |
//  [Q2] Is the object still used by many users on Classic pages for the whole
//       migration window, AND does the schema enforce rules (validation,
//       calculated fields, status transitions) that must hold everywhere?
//    |-- yes --> BACKEND for those rules (L3) FIRST, then continue at Q3 for
//    |           the UI part.
//    |
//    no / done
//    |
//  [Q3] Does the schema depend on heavy DOM work: onRender, document.querySelector,
//       Ext.define controls, third-party JS widgets, CSS that restyles stock
//       controls?
//    |-- yes --> [Q3a] Is that part essential to the users' daily work?
//    |             |-- no  --> REWRITE (L2) without it; drop or simplify the widget.
//    |             |-- yes --> [Q3b] Can you build and maintain a remote module
//    |                           (Angular, @creatio-devkit/common) or a web component?
//    |                           |-- yes --> REWRITE (L2) with a custom view element.
//    |                           |-- no  --> HYBRID (L4): Freedom page + the Classic
//    |                                       module hosted in a view element, or
//    |                                       KEEP CLASSIC (L1) for this page.
//    |
//    no
//    |
//  [Q4] Is the logic mostly shared through mixins or base schemas reused by many
//       pages (calculations, numbering, integrations)?
//    |-- yes --> BACKEND (L3) for the shared logic (C# service, entity event
//    |           listener or business process), then REWRITE (L2) thin pages
//    |           that call it.
//    |
//    no
//    |
//  [Q5] Is the logic simple field behaviour: visible / read-only / required,
//       filtered lookups, default values, value copies?
//    |-- yes --> REWRITE (L2), preferring Freedom UI business rules (no code);
//    |           code only for queries and arithmetic.
//    |
//    no
//    |
//  [Q6] How many users open this page, and how long will it live?
//    |-- few users, or object scheduled for retirement
//    |        --> KEEP CLASSIC (L1) until retirement.
//    |-- many users, long-lived
//    |        --> REWRITE (L2).
//    |
//  [Q7] Release timing: must it ship before the rewrite can be finished and tested?
//    |-- yes --> HYBRID (L4): keep the Classic page as the preference for now,
//    |           build the Freedom page behind "Form page preferences", switch
//    |           per object when the checklist passes.
//    |-- no  --> the route chosen above stands.

// ===== CRITERIA IN DETAIL ====================================================
//
//   Criterion                     Pushes toward       Why
//   Heavy DOM / Ext controls      REWRITE (custom      Freedom UI has no onRender and no stable element
//                                 element) / KEEP      ids; DOM code has nowhere to go.
//                                 See: Recipes/Lifecycle/HowToMigrateOnRenderAndDomAccess.js
//   Custom Ext control            REWRITE as remote    controlConfig.className is ignored; the control
//                                 module               is rebuilt, not ported.
//                                 See: Recipes/UI/HowToMigrateCustomControl.js
//   Mixins                        BACKEND + REWRITE    Freedom UI has no mixins; shared client logic
//                                                      becomes a server call or a usr.* request.
//                                 See: Recipes/Strategy/SchemaStructureMappingReference.js
//   Third-party Classic packages  KEEP CLASSIC         Their schemas and sandbox messages are not
//                                                      yours to rewrite; replacing them forks the vendor.
//   Business rules (Classic)      REWRITE (no-code)    Freedom UI business rules cover visible / required
//                                 or BACKEND           / read-only / filter / set value; rules that must
//                                                      also bind Classic users belong on the server.
//                                 See: Recipes/Attributes/HowToMigrateBusinessRules.js
//   Sandbox messaging between     REWRITE (often       A detail becomes a list in the same view model;
//   page and details              disappears)          most messages turn into attribute reads.
//                                 See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//   Messaging between separate    BACKEND / HYBRID     No client channel between a Classic and a Freedom
//   Classic and Freedom pages                          page; use server messages or the database.
//                                 See: Recipes/Messaging/HowToMigrateServerChannel.js
//   User count                    many -> REWRITE      Effort pays back with use; a rarely opened admin
//                                 few  -> KEEP         page can wait.
//   Release timing                tight -> HYBRID      Page preferences let both pages exist; users
//                                                      switch per object when ready.
//                                 See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js

// ===== LEAVES: WHAT EACH CHOICE MEANS ========================================
//
//  L1 KEEP CLASSIC
//     Do: leave the schema unchanged; keep the Classic page as the object's form
//         page preference; list it as technical debt with a review date.
//     Consequences: the page gets no Freedom UI features; Freedom UI business
//         rules do not apply to it; users switch shells for this object.
//     Watch: rules shared with Freedom pages exist twice - move them to L3.
//
//  L2 REWRITE IN FREEDOM UI
//     Do: build a new page from a template; place fields in the designer; port
//         logic recipe by recipe; run the checklist; switch the preference.
//     Consequences: every line of client logic is touched (sync -> async,
//         generated names); Classic-only behaviour without an equivalent is
//         redesigned or dropped and must be agreed with users.
//     Watch: silent failures (unbound lists, unguarded clears, un-awaited reads).
//     See: Recipes/Example/HowToMigrateACompleteRecordPage.js
//     See: Recipes/Strategy/MigrationChecklists.js
//
//  L3 MOVE LOGIC TO THE BACKEND
//     Do: put the rule into a C# configuration service, an entity event
//         listener or a business process; call it from both UIs
//         (ServiceHelper / sdk.HttpClientService, process launch).
//     Consequences: one implementation for Classic, Freedom, API and imports;
//         feedback moves to save time unless a client copy is kept; needs
//         server-side deployment and tests.
//     Watch: an error returned by the server must be shown by both pages.
//     See: Recipes/Data/HowToMigrateServiceHelperCalls.js
//     See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//
//  L4 HYBRID
//     Do: Freedom page for the object, with either one Classic module hosted in
//         a custom view element, or the Classic page kept as the preference
//         until the Freedom page passes the checklist; shared rules on the server.
//     Consequences: two code bases for a while; Classic sandbox messages stay
//         inside the hosted module; preference changes apply after re-login.
//     Watch: set an end date; a hybrid without one becomes permanent.
//     See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
