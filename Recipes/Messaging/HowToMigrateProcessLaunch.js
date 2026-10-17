// --- How to migrate ProcessModuleUtilities.executeProcess to crt.RunBusinessProcessRequest ---
// Classic UI starts a business process with
// ProcessModuleUtilities.executeProcess({ sysProcessName, parameters, callback,
// scope }) - one config object, callback INSIDE it, firing when the START
// request returns. Freedom UI has two routes. crt.RunBusinessProcessRequest
// (declarative on a button, or via executeRequest) starts a process for the
// page record, for a list selection or with no record. When you need OUTPUT
// parameters back, sdk.ProcessEngineService.executeProcessByName(name, inputs,
// resultParameterNames) waits and returns them.
//
// API MAP
//   ProcessModuleUtilities.executeProcess({ sysProcessName: "UsrMyProcess", ... })
//                                    ->  executeRequest({ type: "crt.RunBusinessProcessRequest",
//                                            $context, processName: "UsrMyProcess", ... })
//   parameters: { UsrRecordId: this.get("Id") }
//                                    ->  processRunType: "ForTheSelectedPage",
//                                        recordIdProcessParameterName: "UsrRecordId"
//   parameters: { UsrComment: ... } (other inputs)
//                                    ->  documented: parameterMappings { <process param>: <data
//                                        source field> } (Academy: for ForTheSelectedRecords);
//                                        processParameters: { UsrComment: ... } is observed to
//                                        work but is NOT in Academy's parameter table
//   button "click" -> method -> executeProcess
//                                    ->  "clicked": { "request": "crt.RunBusinessProcessRequest",
//                                            "params": { processName, processRunType, ... } }
//   isAddMode() guard + "save first" ->  saveAtProcessStart (default true per Academy; set
//                                        it explicitly)
//   callback: function() { ... }     ->  const result = await ...; result?.isSuccess (Academy) or
//                                        result?.success (some versions) - test both
//   Terrasoft.MaskHelper around it   ->  sdk.MaskService; See: Recipes/UI/HowToMigrateBodyMask.js
//   reading outputs (no client API in Classic)
//                                    ->  await new sdk.ProcessEngineService().executeProcessByName(
//                                            "UsrMyProcess", { UsrRecordId: id }, ["UsrTotal"])
//                                        -> { success, processId, processStatus, resultParameterValues }
//   run for selected section records ->  processRunType "ForTheSelectedRecords" with the grid's
//                                        _SelectionState (and crt.SkipIfSelectionEmpty)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - "Started" is still not "finished" for crt.RunBusinessProcessRequest: it
//     resolves when the process starts. Only executeProcessByName waits (until
//     the end, or until a user task - observed).
//   - Only the outputs NAMED in resultParameterNames come back. A process with
//     output parameters must not run in the background ("Run in background"
//     off) or there is nothing to wait for.
//   - Lookup inputs are still RAW guids, not { value, displayValue }:
//     pass (await $context.PDS_X)?.value.
//   - showNotification (default true on crt.Button per Academy) shows a
//     "process started" toast that Classic did not show; set it explicitly.
//   - sdk.ProcessEngineService is absent from @creatio-devkit/common 0.820.0
//     and present in 0.823.0 (published typings); older builds have only the request.
//   - ProcessEngineService.completeExecuting(processElementUId, params) finishes
//     a waiting element - there was no Classic client equivalent.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Copying `parameters: {...}` onto crt.RunBusinessProcessRequest uses a name
//   the request does not document - expect it to be ignored. Documented inputs
//   are recordIdProcessParameterName and parameterMappings; processParameters
//   is observed, undocumented. Parameter codes are case-sensitive, and a wrong
//   one is ignored without an error (observed), so the process runs with empty
//   inputs. `saveAtProcessStart: false` (the default is true) on a new record
//   starts the process before the record is in the database: it reads
//   nothing. "ForTheSelectedRecords"
//   without crt.SkipIfSelectionEmpty turns an EMPTY selection into "every record".
//
// Applies: Creatio 8.1+ (sdk.ProcessEngineService needs @creatio-devkit/common 0.823.0+; the request needs no devkit); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/business-processes
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers (crt.RunBusinessProcessRequest parameters)
// Source: https://community.creatio.com/node/39023
// Source: https://community.creatio.com/node/31360
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: ProcessEngineService, RunProcessResponse, ProcessStatus)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", ["ProcessModuleUtilities"], function(ProcessModuleUtilities) {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			onRunProcessClick: function() {
				if (this.isAddMode() || this.isCopyMode()) {
					this.showInformationDialog(this.get("Resources.Strings.SaveRecordFirstMessage"));
					return;
				}
				var relatedEntity = this.get("UsrRelatedEntity");
				ProcessModuleUtilities.executeProcess({
					sysProcessName: "UsrMyProcess",
					parameters: {
						UsrRecordId: this.get("Id"),
						UsrRelatedEntityId: relatedEntity ? relatedEntity.value : null,
						UsrComment: this.get("UsrComment") || ""
					},
					// Inside the config. Means "the start request returned".
					callback: function() {
						this.showInformationDialog(this.get("Resources.Strings.ProcessStartedMessage"));
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
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// Declarative: no handler for the simple "run for this record".
				"operation": "insert",
				"name": "UsrRunProcessButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrRunProcessButton_caption)#",
					"iconPosition": "only-text",
					"clicked": {
						"request": "crt.RunBusinessProcessRequest",
						"params": {
							"processName": "UsrMyProcess",
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
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Imperative: several inputs, start only.
				request: "usr.RunMyProcessRequest",
				handler: async (request, next) => {
					const relatedEntity = await request.$context.PDS_UsrRelatedEntity_a1b2c3d;
					const result = await request.$context.executeRequest({
						type: "crt.RunBusinessProcessRequest",
						$context: request.$context,
						processName: "UsrMyProcess",
						processRunType: "ForTheSelectedPage",
						recordIdProcessParameterName: "UsrRecordId",
						// Observed, not in Academy's parameter table: test on your version.
						processParameters: {
							// Lookup -> raw guid, as in Classic.
							UsrRelatedEntityId: relatedEntity?.value ?? null,
							UsrComment: (await request.$context.PDS_UsrComment_b2c3d4e) || ""
						},
						saveAtProcessStart: true,
						showNotification: true
					});
					if (!(result?.isSuccess || result?.success)) {
						// The process did not start: tell the user here.
					}
					return next?.handle(request);
				}
			},
			{
				// Outputs: executeProcessByName waits and returns the named results.
				request: "usr.CalculateTotalRequest",
				handler: async (request, next) => {
					const service = new sdk.ProcessEngineService();
					const response = await service.executeProcessByName(
						"UsrCalculateTotalProcess",
						{ UsrRecordId: await request.$context.PDS_Id_a1b2c3d },
						["UsrTotal"]);
					if (response?.success && response.processStatus === sdk.ProcessStatus.Completed) {
						request.$context.PDS_UsrTotal_c9d0e1f = response.resultParameterValues?.UsrTotal;
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
