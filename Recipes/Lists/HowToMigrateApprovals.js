// --- How to migrate approvals (visa detail, VisaDetailV2, <Entity>Visa) to Freedom UI ---
// In Classic UI approvals are per section: "Enable approval in section" in the
// section wizard (7.11+) wires a <Entity>Visa object based on "Base approval"
// to the section (SysModuleVisa / SysModule.SysModuleVisaId) and the record
// page shows them in an approvals detail built on the stock VisaDetailV2
// schema; custom code added the detail by hand and created visa rows from a
// business process or an InsertQuery. In Freedom UI approvals are a no-code
// feature: the "Approvals" and "Approvals list" components are placed on a
// form page in the Freedom UI Designer (out of the box in Contracts,
// Invoices, Orders), approvals are created by the "Approval" business process
// element or by a Case Designer stage, and users approve, reject or change
// the approver in the component or the notification panel. Academy documents
// no developer API for them: no element reference, no crt.* request for
// approve / reject. Code starts the process; the designer places the
// components.
//
// API MAP
//   details: { UsrVisa: { schemaName: "VisaDetailV2", entitySchemaName: "UsrMyEntityVisa", ... } }
//                                  ->  "Approvals" / "Approvals list" component, added in the
//                                      designer (keep the JSON it generates)
//   section wizard "Enable approval in section" + SysModuleVisa row
//                                  ->  Academy's Freedom UI approvals pages do not mention it;
//                                      approvals are created by the process element (verify
//                                      whether your version still needs the section setting)
//   UsrMyEntityVisa object (inherits Base approval)
//                                  ->  a shared approval object linked by "Reference schema
//                                      name" + "Entity identifier" (community, 2024, not
//                                      Academy; verify in your configuration)
//   process "Add data" into UsrMyEntityVisa (VisaOwner, Objective, ...)
//                                  ->  "Approval" business process element (approver: an
//                                      employee or a role; email notification option)
//   button -> ProcessModuleUtilities.executeProcess(...)
//                                  ->  "clicked": { "request": "crt.RunBusinessProcessRequest", ... }
//                                      See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//   approve / reject in the detail or the notification panel
//                                  ->  the same actions in the component / notification panel;
//                                      "AcceptApprovalWithoutComment" system setting decides
//                                      whether approving needs a comment
//   custom code reacting to a visa status change (entity event, process
//   signal on <Entity>Visa.Status)  ->  the Approval element's outcome in the SAME process
//                                      (the process waits for the result)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The Freedom UI components are not a port of VisaDetailV2: there is no
//     detail schema to inherit from and no documented properties to set from
//     code. Customisations of VisaDetailV2 (extra columns, toolbar buttons,
//     menu items) have no documented equivalent; rebuild them as a list
//     (crt.DataGrid) on the approval object if they are really needed.
//   - Existing <Entity>Visa rows are not shown by the Freedom components if
//     the components read the shared approval object (community answer, not
//     verified on Academy). Check on your version before switching users;
//     plan a data migration or keep the Classic page for history.
//   - Approve / Reject / Change approver work only for approvals in "To set"
//     status that are not cancelled; Change approver needs "Delegation
//     permitted" and an empty "Delegated from" (Academy).
//   - One approval per approver: to send to several employees create one
//     approval each, or use a role as approver (Academy).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A Classic `details` block with VisaDetailV2 copied into a Freedom UI
//   schema is ignored: the page shows no approvals and raises no error. A
//   process that still inserts rows into UsrMyEntityVisa keeps "working", but
//   nothing on the Freedom page shows those rows and no one gets a Freedom UI
//   approval notification (community answer; verify).
//
// Applies: Classic UI 7.11+ (section wizard approvals); Freedom UI 8.1+ (Approvals / Approvals list components, Approval process element)
// Source: https://academy.creatio.com/guides/creatio-apps/8.1/creatio-basics/communications/approvals
// Source: https://academy.creatio.com/guides/creatio-apps/8.3/creatio-basics/communications/approvals
// Source: https://academy.creatio.com/documents/technic-sdk/7-16/how-display-custom-implementation-approving-section-wizard
// Source: https://community.creatio.com/node/39294 (shared approval object in Freedom UI, community answer)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ProcessModuleUtilities"], function(ProcessModuleUtilities) {
	return {
		entitySchemaName: "UsrMyEntity",
		details: /**SCHEMA_DETAILS*/{
			"UsrVisaDetail": {
				"schemaName": "VisaDetailV2",
				"entitySchemaName": "UsrMyEntityVisa",
				"filter": { "masterColumn": "Id", "detailColumn": "UsrMyEntity" }
			}
		}/**SCHEMA_DETAILS*/,
		methods: {
			// The process inserts a UsrMyEntityVisa row (Add data element).
			onSendForApprovalClick: function() {
				ProcessModuleUtilities.executeProcess({
					sysProcessName: "UsrSendForApprovalProcess",
					parameters: { UsrRecordId: this.get("Id") },
					callback: function() {
						this.updateDetail({ detail: "UsrVisaDetail" });
					},
					scope: this
				});
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrSendForApprovalButton",
				"parentName": "LeftContainer",
				"propertyName": "items",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": "Send for approval",
					"click": { "bindTo": "onSendForApprovalClick" }
				}
			},
			{
				"operation": "insert",
				"name": "UsrVisaDetail",
				"parentName": "GeneralInfoTab",
				"propertyName": "items",
				"values": { "itemType": Terrasoft.ViewItemType.DETAIL }
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// The "Approvals" component is added in the designer (its generated JSON is
// kept as is; it is not reproduced here because Academy documents no
// properties for it). UsrSendForApprovalProcess now uses the Approval element
// instead of inserting into UsrMyEntityVisa.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrSendForApprovalButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrSendForApprovalButton_caption)#",
					"clicked": {
						"request": "crt.RunBusinessProcessRequest",
						"params": {
							"processName": "UsrSendForApprovalProcess",
							"processRunType": "ForTheSelectedPage",
							"recordIdProcessParameterName": "UsrRecordId",
							"saveAtProcessStart": true,
							"showNotification": true
						}
					}
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
