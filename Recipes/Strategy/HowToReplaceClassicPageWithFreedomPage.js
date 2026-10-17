// --- How to replace a Classic UI page with a Freedom UI page -------------------
// Reference text. In Classic UI a page is replaced by a replacing client schema
// in your package, or registered for a section/type in the section wizard.
// A Freedom UI page does not replace a Classic schema; it is a separate
// AngularSchema bound to the same object. WHICH page opens is configuration:
// Freedom UI sections always open Freedom UI pages; for Classic UI sections and
// for records opened from lookups or the communication panel, the choice is
// made in Studio > UI Management > "Form page preferences" (sitewide, and per
// object as exceptions). Changes apply after the user logs out and in.
//
// API MAP
//   replacing EditViewModelSchema "UsrMyEntity1Page" -> new AngularSchema "UsrMyPage_FormPage"
//   section wizard: page per type             ->  Freedom UI typified pages (one per type)
//   which page a Classic section opens         ->  UI Management > "Form page preferences",
//                                                 "Classic UI shell" setting / object exception
//   which page a Freedom UI section opens      ->  always the Freedom UI page
//   Freedom UI shell on/off for users          ->  UI Management > "UI Preferences"
//                                                 ("Freedom UI is enabled", per user/group)
//   openCardInChain({ schemaName })            ->  crt.OpenPageRequest { schemaName } (a specific
//                                                 page) or crt.UpdateRecordRequest (default page)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - When both a Classic and a Freedom UI typified page exist for a type, the
//     Freedom UI page opens (Academy); types with only a Classic page keep it.
//   - Exceptions in "Form page preferences" apply only to Classic UI sections.
//   - Academy's "move a Classic UI section" article also names "system setting
//     values" and "an exception lookup" as the levers, without setting codes.
//     The 8.1+ UI is UI Management; check what your installation shows before
//     scripting any setting code.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Building the Freedom UI page but not switching the form page preference
//   leaves Classic sections opening the old page: users see no change, and
//   testers report the migration "does nothing". The reverse - switching the
//   preference before the Freedom page carries all customisations - silently
//   drops the Classic behaviour for every user who logs in again.
//
// See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
// Applies: Creatio 8.1+ (UI Management / Form page preferences as documented for 8.1); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/manage-the-form-pages-overview
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/appearance-customization/general-procedure
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/app-management/move-a-classic-ui-section-to-freedom-ui

// ===== WHICH PAGE OPENS (Academy, 8.1) =======================================
//
//   Only a Classic typified page exists for the type    -> Classic page
//   Classic AND Freedom UI typified pages for the type  -> Freedom UI page
//   Several types: decided per type. Classic pages for types 1 and 2 and
//   Freedom UI pages for types 2 and 3 -> type 1 opens Classic, 2 and 3 open
//   Freedom UI.
//   Freedom UI section, add / view / edit / copy        -> Freedom UI page, always
//   Record opened from a lookup or the communication panel
//                                                       -> per "Form page preferences"

// ===== SWITCHING SITEWIDE ====================================================
//
//   Studio workplace > UI Management > "Form page preferences" tab > edit:
//   choose the form page type for the Freedom UI shell, and if needed for the
//   Classic UI shell. Users log out and back in.

// ===== SWITCHING ONE OBJECT (EXCEPTION) ======================================
//
//   UI Management > "Form page preferences" > New:
//     "Object code"      UsrMyEntity
//     "Freedom UI shell" Freedom UI pages
//     "Classic UI shell" Freedom UI pages
//   Result: the UsrMyEntity Freedom UI page opens even inside the Classic UI
//   section. Useful for a page migrated ahead of its section, or A/B testing.

// ===== REPLACING THE WHOLE SECTION ===========================================
//
//   1. Application Hub > New application > "Records & Business processes",
//      Advanced parameters > "Link to an existing object" > UsrMyEntity.
//   2. Build the pages in the Freedom UI Designer.
//   3. Workplace setup: add the Freedom UI section, remove the Classic one.
//   4. Make sure Freedom UI form pages open everywhere ("Form page
//      preferences", see above).
//   Expect custom code, business rules, custom lookups and localisation not to
//   come along with the linked object (observed); port them with the recipes
//   in this repository.

// ===== OPENING A SPECIFIC PAGE FROM CODE =====================================
//
// Classic named the page schema in openCardInChain; Freedom UI either opens
// the object's default page (decided by the rules above) or a named page:
//
//   await request.$context.executeRequest({
//       type: "crt.OpenPageRequest",
//       $context: request.$context,
//       schemaName: "UsrMyPage_FormPage",
//       modelInitConfigs: [{ action: "edit", recordId: recordId }]
//   });
//
// A recordId put into `parameters` instead of modelInitConfigs is ignored and
// the page opens as a new record (reported by CustomerFX).
// Source: https://customerfx.com/article/opening-a-record-for-edit-in-a-specific-page-in-creatio-freedom-ui/
