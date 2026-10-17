// --- What does not migrate with code: user settings, list columns, filters, folders, dashboards, profile keys ---
// Reference text. A Classic UI -> Freedom UI migration moves page schemas,
// handlers and objects. What users built for themselves on top of the Classic
// pages is DATA in other places - list column profiles, quick filter values,
// saved filters, folders, section dashboards, profile keys written by custom
// code - and the new pages do not read most of it. Users notice this first
// ("my columns are gone"), so it belongs in the migration plan: inventory
// it, decide what to pre-configure centrally, what a tool can move, and what
// to announce as "set it up again".
//
// API MAP
//   Classic list columns ("Select fields to display", user profile)
//                                  ->  Freedom list settings: personal (saved automatically),
//                                      "Save list settings for all users as default"
//                                      (CanCreateDefaultGridSettings), "Overwrite current list
//                                      settings for all users", per-folder list settings
//   Classic default column set for everyone (admin profile)
//                                  ->  columns in the Freedom page schema (designer), then the
//                                      "for all users" default above
//   quick filter values remembered per user
//                                  ->  stored separately from list settings in Freedom UI
//                                      (Academy); expect users to set them again
//   section dashboards (SysDashboard)
//                                  ->  Dashboards migrator app (8.3.1+), else rebuilt in the
//                                      designer; See: Recipes/UI/HowToMigrateDashboardsAndCharts.js
//   folders (static / dynamic)      ->  Freedom Folder component; static folders need the
//                                      IsAllowUseStaticFolders feature + "Schemas for enable
//                                      static folder in folder tree" lookup (non-Marketing products)
//   Terrasoft.utils.saveUserProfile(key, value, ...) / profile reads in custom code
//                                  ->  no client profile API in @creatio-devkit/common; store the
//                                      setting yourself (a per-user record via sdk.Model) or
//                                      through a C# service (server ProfileService)
//   which UI a user / group sees    ->  "UI Preferences" + "Form page preferences"; bindable to a
//                                      package (Academy "Bind UI settings")
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Academy describes no import of Classic list profiles into Freedom UI
//     list settings. Plan for every user starting from the designer columns
//     or the "for all users" default.
//   - Freedom list settings priority: personal > default for all users >
//     designer (Academy). A personal setting made during a pilot hides every
//     later default change for that user until "Reset to default list
//     settings" or "Overwrite current list settings for all users".
//   - Folder data: Academy's Freedom UI folder pages do not say whether
//     Classic folders appear in the Freedom folder tree, nor whether filters
//     of Classic dynamic folders evaluate the same. Check both on a copy with
//     real folders (static and dynamic, shared and private).
//   - Dashboards made by users in Freedom UI without changing a package are
//     stored at user level (SysUserLevelSchema - community answer, 2025), not
//     in SysDashboard; Classic dashboard scripts and data bindings do not
//     move them.
//   - Custom profile keys: a key written by Classic code is a server-side
//     profile record. Freedom UI code cannot read it with a documented client
//     API; decide whether the setting is still needed before porting it.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Nothing in a code migration reports lost settings: the Freedom page opens
//   correctly, just with designer columns, no quick filter values, no
//   personal dashboards and default behaviour wherever custom code read a
//   profile key (the read now simply does not happen).
//
// See: Recipes/Strategy/HowToPlanClassicToFreedomMigration.js
// See: Recipes/Strategy/HowToRunClassicAndFreedomSideBySide.js
// See: Recipes/Sections/HowToMigrateGridColumns.js
// See: Recipes/Sections/HowToMigrateSectionFilters.js
// Applies: Classic UI 7.x; Freedom UI 8.1+ (list settings as described in the 8.3 user guide - check yours; Dashboards migrator 8.3.1+)
// Source: https://academy.creatio.com/guides/creatio-apps/8.3/creatio-basics/freedomUI/manage-a-freedom-ui-list
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/element-setup-examples/components/set-up-folders
// Source: https://academy.creatio.com/guides/no-code-customization/8.3/customization-tools/ui-and-business-logic-customization/analytics/migrate-dashboards-classic-to-freedom-ui
// Source: https://academy.creatio.com/guides/no-code-customization/8.3/customization-tools/appearance-customization/bind-ui-settings
// Source: https://academy.creatio.com/api/netcoreapi/7.17.0/Terrasoft.WebApp~Terrasoft.WebApp.Services.ProfileService~SaveProfileData.html
// Source: https://community.creatio.com/questions/scripting-freedom-ui-dashboards-sysfreedomdashboard-creatio-830

// ===== INVENTORY BEFORE SWITCHING A SECTION ==================================
//
//   What                         Where it lives in Classic        Ask / count
//   list column layouts          user profile (per list key)      how many users changed columns?
//   default columns for all      profile saved "for all users"    write down the column set
//   quick filter values          user profile                     which filters do users rely on?
//   saved / advanced filters     folders or profile               turn the important ones into
//                                                                  shared folders
//   static folders               <Entity>Folder + <Entity>InFolder  number, owners, sharing
//   dynamic folders              <Entity>Folder (filter data)     open each important one after
//                                                                  the switch
//   section dashboards           SysDashboard / SysDashboardItem  custom widgets, pivots (not
//                                                                  migrated by the app)
//   custom profile keys          code calling saveUserProfile     grep the packages for it
//   tabs, detail collapse state  user profile                     usually not worth moving
//
// grep for custom profile use in the package sources, for example:
//	grep -rn --include=*.js -e "saveUserProfile" -e "profile!" Pkg/

// ===== WHAT CAN BE PRE-CONFIGURED CENTRALLY ==================================
//
//   - List columns: design them in the Freedom page schema, then have one
//     admin save "list settings for all users as default". Do it BEFORE
//     users get access, or use "Overwrite current list settings for all
//     users" once (it removes personal settings - announce it).
//   - Folder-specific list settings: "Save list settings for the folder"
//     for shared folders (applies to everyone who can see the folder).
//   - Quick filters with default values: in the list page schema (designer).
//     See: Recipes/Sections/HowToMigrateSectionFilters.js
//   - Dashboards: Dashboards migrator (8.3.1+) for section dashboards, then
//     fix the "Partially migrated" ones by hand; ship designer-built
//     dashboards in a package (page schema), not as SysDashboard data.
//   - Static folders: enable the feature and the lookup entry before users
//     look for them.
//   - UI and page preferences per role: bind them to a package so test and
//     production switch the same way.

// ===== WHAT TO TELL USERS ====================================================
//
//   - Which sections switch and when; whether the Classic section stays in
//     some workplace for a while.
//   - "Your personal column layout and remembered filter values do not move.
//     The new list starts with the agreed default; change it and it is saved
//     automatically. 'Reset to default list settings' brings the default
//     back."
//   - Which folders and dashboards were checked / recreated, and whom to tell
//     about a missing one (give a date until which the Classic page stays
//     available to look things up).
//   - Personal dashboards: recreate them in Freedom UI; they are stored per
//     user.
//   - Where the Print, approval and feed functions are on the new page.
//     See: Recipes/UI/HowToMigratePrintablesAndReports.js
//     See: Recipes/Lists/HowToMigrateApprovals.js
//     See: Recipes/UI/HowToMigrateFeedAndTimeline.js
