// --- How to migrate printables and the Print menu (ReportService, preparePrintFormsMenuCollection) to Freedom UI ---
// In Classic UI a printable (MS Word or FastReport) is configured in the
// Printables setup and appears by itself in the "Print" menu of the section
// and of the record page; code only adjusts that menu (override
// preparePrintFormsMenuCollection on the page, isSectionPrintFormEnabled on
// the section) or generates a file directly through the stock ReportService
// (CreateReportsList, then GetReportFile). In Freedom UI the printable itself
// is configured the same way, but nothing appears until a button with the
// "Print report" action is placed on the Freedom UI page in the designer
// (Academy, Word report procedure, 8.1). The handlers reference lists the
// request behind it as crt.PrintablesRequest ("Print a report."), with no
// documented parameters. Per-record filtering of the menu has no documented
// hook; the workarounds are separate buttons shown by business rules, or a
// custom button that calls ReportService itself.
//
// API MAP
//   Printables setup (template, object, MS Word / FastReport)
//                                  ->  unchanged; configure the printable as before
//   automatic "Print" menu on the Classic page / section
//                                  ->  a button with the "Print report" action, added in the
//                                      Freedom UI Designer (request crt.PrintablesRequest;
//                                      copy the JSON the designer generates)
//   preparePrintFormsMenuCollection(printForms) - hide items per record
//                                  ->  no documented equivalent; community answer (node/41554,
//                                      Oct 2025): "In Freedom UI you can't hide individual reports
//                                      inside the Print report menu". Workaround: one button per
//                                      report, visibility by business rule;
//                                      See: Recipes/Attributes/HowToMigrateBusinessRules.js
//   isSectionPrintFormEnabled(reportId) on the section
//                                  ->  same gap on the list page; same workaround
//   ServiceHelper.callService("ReportService", "CreateReportsList", ...)
//                                  ->  await new sdk.HttpClientService().post(
//                                          "/rest/ReportService/CreateReportsList", { templateId, recordIds })
//                                      (CustomerFX; the Freedom variant is marked untested by its author)
//   "../rest/ReportService/GetReportFile/" + key  (anchor download)
//                                  ->  the same URL, opened from the handler; test the relative
//                                      prefix from the Freedom UI shell
//   Process "Process file" element generating the document
//                                  ->  unchanged; a Freedom button runs the process
//                                      (See: Recipes/Messaging/HowToMigrateProcessLaunch.js)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Printables do not show up on a Freedom UI page by themselves: no
//     button, no printing. This is the most common "lost feature" report after
//     switching a section to Freedom UI.
//   - Before 8.1.1 Freedom UI had no printables at all (community, Creatio
//     support 2023: printables "will be available in the 8.1.1 version");
//     the documented workaround then was a business process (e.g. Process
//     file element).
//   - crt.PrintablesRequest has no documented parameters. Do not hand-write
//     them: add the button in the designer and keep what it generates.
//   - ReportService is an internal service: its method names and payload
//     (templateId, recordIds) come from a community article, not from an API
//     reference. Check them against your version before relying on them.
//   - The printable's Id (templateId) is a record Id of your environment.
//     Keep it in a named constant or, better, a system setting, because it
//     differs between environments unless the printable is shipped in a
//     package with a fixed Id.
//   - Access: a printable hidden for a role in Classic by code was a UI-only
//     restriction. Use the printable's own access settings / operation
//     permissions if it must really be restricted.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A Classic preparePrintFormsMenuCollection override copied into a
//   Freedom UI schema is simply never called: every printable stays visible.
//   A custom ReportService call whose response shape you guessed
//   (CreateReportsListResult[0] vs body.CreateReportsListResult[0]) builds a
//   download URL ending in "undefined" and the browser downloads an error
//   page.
//
// Applies: Classic UI 7.x; Freedom UI 8.1.1+ for the "Print report" button (none on 8.0 / 8.1.0 - community); the DialogService call needs @creatio-devkit/common 0.814.0+; ReportService: internal API (observed)
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/print-ready-reports/set-up-ms-word-report---general-procedure
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://customerfx.com/article/running-and-downloading-a-printable-via-javascript-in-creatio/
// Source: https://community.creatio.com/questions/hideshow-print-button-items-based-specific-condition (Classic UI only: preparePrintFormsMenuCollection)
// Source: https://community.creatio.com/node/41554
// Source: https://community.creatio.com/node/38599

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ServiceHelper", "MaskHelper"], function(ServiceHelper, MaskHelper) {
	// Invented: the printable's Id in THIS environment.
	var USR_CONTRACT_PRINTABLE_ID = "7d3e1a52-4b6c-4e8f-9a1d-2c5b8e7f0a13";

	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			// Hide one printable from the page's Print menu unless the record is approved.
			preparePrintFormsMenuCollection: function(printForms) {
				this.callParent(arguments);
				printForms.each(function(item) {
					if (item.get("Id") === USR_CONTRACT_PRINTABLE_ID) {
						item.set("Visible", this.get("UsrIsApproved") === true);
					}
				}, this);
			},

			// A dedicated button that generates and downloads one printable.
			onPrintContractClick: function() {
				MaskHelper.ShowBodyMask();
				ServiceHelper.callService("ReportService", "CreateReportsList", function(response) {
					MaskHelper.HideBodyMask();
					var keys = response && response.CreateReportsListResult;
					if (!keys || !keys.length) {
						this.showInformationDialog("The document could not be generated.");
						return;
					}
					var link = document.createElement("a");
					link.href = "../rest/ReportService/GetReportFile/" + keys[0];
					link.download = "Contract";
					link.click();
				}, { templateId: USR_CONTRACT_PRINTABLE_ID, recordIds: [this.get("Id")] }, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrPrintContractButton",
				"parentName": "LeftContainer",
				"propertyName": "items",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": "Print contract",
					"click": { "bindTo": "onPrintContractClick" },
					"visible": { "bindTo": "UsrIsApproved" }
				}
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	// Invented: the printable's Id in THIS environment (prefer a system setting).
	const USR_CONTRACT_PRINTABLE_ID = "7d3e1a52-4b6c-4e8f-9a1d-2c5b8e7f0a13";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// ROUTE 1 (no code): the stock Print report button. Add it in the
				// designer ("Print report" action) and keep the generated values;
				// the request name is from Academy, its parameters are not
				// documented, so none are written here.
				"operation": "insert",
				"name": "UsrPrintButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrPrintButton_caption)#",
					"clicked": { "request": "crt.PrintablesRequest" }
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// ROUTE 2: one button per report, shown by a business rule or a
				// bound attribute instead of filtering the menu.
				"operation": "insert",
				"name": "UsrPrintContractButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrPrintContractButton_caption)#",
					"visible": "$PDS_UsrIsApproved_a1b2c3d",
					"clicked": { "request": "usr.PrintContractRequest" }
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// Bound to UsrPrintContractButton.visible above.
					"PDS_UsrIsApproved_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrIsApproved" }
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Generates one printable through the internal ReportService
				// (community-documented payload; verify on your version).
				request: "usr.PrintContractRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.Id;
					// See: Recipes/UI/HowToMigrateBodyMask.js
					const mask = new sdk.MaskService();
					let keys = null;
					await mask.showBodyMask({ delay: 300 });
					try {
						const response = await new sdk.HttpClientService().post(
							"/rest/ReportService/CreateReportsList",
							{ templateId: USR_CONTRACT_PRINTABLE_ID, recordIds: [recordId] });
						keys = response?.ok ? response.body?.CreateReportsListResult : null;
					} catch (error) {
						console.error(error);
					} finally {
						await mask.hideBodyMask();
					}
					if (!keys?.length) {
						// Hide the mask first, then ask (dialog would sit under it).
						await new sdk.DialogService().open({
							message: "The document could not be generated.",
							actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
						});
						return next?.handle(request);
					}
					const link = document.createElement("a");
					// Relative prefix: test it from the Freedom UI shell URL.
					link.href = "../rest/ReportService/GetReportFile/" + keys[0];
					link.download = "Contract";
					link.click();
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
