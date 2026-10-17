// --- How to migrate a complete record page to Freedom UI (worked example, end to end) ---
// One realistic Classic UI record page for an order-like entity, UsrMyEntity,
// migrated as a whole. The Classic page combines the techniques a real page
// mixes: a City lookup filtered by Country, City cleared when Country changes,
// an Owner that is required only "In work", a format validator on Number, a
// save-time server check that Number is unique, a button that asks for
// confirmation and starts an approval process for the record, a detail
// (UsrMyDetailEntity) with default values for new rows, a sandbox message from
// the detail that pushes a total into the page, and localizable strings. The
// Freedom UI half is the COMPLETE equivalent page built with the same patterns
// as the per-topic recipes; read those for the details of each step.
//
// MIGRATION ORDER FOR THIS PAGE (each step is one per-topic recipe)
//   1. Create UsrMyPage_FormPage for UsrMyEntity in the Freedom UI designer and
//      place the fields there; never hand-write the generated attribute names.
//      See: Recipes/Strategy/HowToFindGeneratedNamesInFreedomSchema.js
//   2. Turn the detail into a list on the page, bound to the record by
//      `dependencies` on its data source.
//      See: Recipes/Lists/HowToMigrateDetailToList.js
//   3. Move details.defaultValues onto the list's add button, link column first.
//      See: Recipes/Lists/HowToMigrateDetailDefaultValues.js
//   4. Re-create every resource string the new page uses (other schema).
//      See: Recipes/Attributes/HowToMigrateLocalizableStrings.js
//   5. Filter City by Country with filterAttributes + loadOnChange.
//      See: Recipes/Attributes/HowToMigrateDependentLookup.js
//      See: Recipes/Attributes/HowToMigrateLookupFilter.js
//   6. Clear City on a USER change of Country only (loaded-flag guard).
//      See: Recipes/Attributes/HowToMigrateAttributeDependencies.js
//      See: Recipes/Lifecycle/HowToMigrateInitAndOnEntityInitialized.js
//   7. Make Owner conditionally required: crt.Required + enable/disable.
//      See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
//   8. Port addColumnValidator to a validator type attached to the attribute.
//      See: Recipes/Lifecycle/HowToMigrateValidationConfig.js
//   9. Move asyncValidate into crt.SaveRecordRequest, before next; reload the
//      list after next (was onSaved + updateDetail).
//      See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
//      See: Recipes/Lifecycle/HowToMigrateSaveOverride.js
//  10. Drop the detail -> page sandbox message: the list is in the same view
//      model, so the page reads the rows itself after the list loads.
//      See: Recipes/Lists/HowToMigrateDetailPageMessaging.js
//      See: Recipes/Messaging/HowToMigrateSandboxMessages.js
//  11. Rebuild the button: crt.Button -> usr.* request -> crt.ShowDialogRequest
//      -> crt.RunBusinessProcessRequest.
//      See: Recipes/UI/HowToMigrateDiffButtons.js
//      See: Recipes/UI/HowToMigrateDialogs.js
//      See: Recipes/Messaging/HowToMigrateProcessLaunch.js
//  12. Run the record-page checklist, then switch "Form page preferences".
//      See: Recipes/Strategy/MigrationChecklists.js
//      See: Recipes/Strategy/HowToReplaceClassicPageWithFreedomPage.js
//
// API MAP
//   details.UsrMyDetail { filter }           ->  crt.DataGrid "GridDetail_k7m2p9q" + data source
//                                                "GridDetail_k7m2p9qDS" + modelConfigDiff dependencies
//   details.UsrMyDetail.defaultValues        ->  add button crt.CreateRecordRequest defaultValues
//                                                (UsrMyEntity = "$Id" added explicitly)
//   UsrCity lookupListConfig.filter          ->  "PDS_UsrCity_a1b2c3d_List" filterAttributes
//                                                [{ name: "UsrCity_Filter", loadOnChange: true }]
//   UsrCountry dependencies -> clear City    ->  "change": { request: "usr.CountryChangedRequest" }
//                                                + UsrIsModelLoaded flag
//   columns.UsrOwner.isRequired + validateColumn
//                                            ->  "required": { type: "crt.Required" } +
//                                                enable/disableAttributeValidator in a change handler
//   setValidationConfig + addColumnValidator ->  validators section "usr.MyNumberFormat" +
//                                                attribute "validators"
//   asyncValidate + Terrasoft.chain + ESQ    ->  crt.SaveRecordRequest before next + sdk.Model.load
//   onSaved + this.updateDetail              ->  after next: crt.LoadDataRequest loadType "reload"
//   messages UsrDetailTotalChanged (detail PUBLISH, page SUBSCRIBE, tagged)
//                                            ->  crt.LoadDataRequest handler for "GridDetail_k7m2p9qDS":
//                                                after next, read rows, write PDS_UsrTotal_f6a7b8c
//   showConfirmationDialog(msg, cb)          ->  await executeRequest crt.ShowDialogRequest,
//                                                compare the returned key
//   ProcessModuleUtilities.executeProcess    ->  crt.RunBusinessProcessRequest "ForTheSelectedPage"
//   isAddMode() -> "save the record first"   ->  saveAtProcessStart: true
//   "caption": { bindTo: "Resources.Strings.X" } / this.get(...)
//                                            ->  "#ResourceString(X)#" / await $context.Resources.Strings.X
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Two schemas become one: the detail's methods (onGridDataLoaded) are page
//     handlers now, and its message declarations disappear.
//   - Every value read is awaited and every attribute name is the GENERATED
//     one; the suffixes below are placeholders - take yours from the schema.
//   - The required toggle runs on load AND on change; the City clear runs on
//     user change only. Do not share one guard between them.
//   - The save handler runs your query BEFORE field validators (Classic ran
//     it after); the empty-Number case skips the query so the format and
//     required errors still show.
//   - The process launch saves the record itself (saveAtProcessStart), so the
//     Classic "save first" dialog is gone; showNotification replaces the
//     Classic "process started" message.
//   - Writing the total marks the page as changed, like UpdateCardProperty did;
//     write only when the value differs. Both halves sum only the rows the
//     list has loaded - a stored total belongs on the server.
//   - finish-load-model-attributes is reported from 8.1.3 (observed); the
//     attribute-change route also works where it does not fire.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   The page opens, saves and looks finished, yet: the list shows every row of
//   UsrMyDetailEntity (no dependencies); rows added by a hand-made add button
//   vanish from it (no link default); City keeps a value from the old Country
//   (no clear) or loses its stored value on every open (unguarded clear);
//   Owner stays required after the status changes back (one-sided toggle); the
//   uniqueness check is skipped (un-awaited load, or a chained void add*
//   filter); the dialog opens empty (flat request shape) or "Yes" never
//   matches; a `messages` block copied over is ignored and the total never
//   updates. None of these raises an error.
//
// Applies: Creatio 8.1+ (Freedom UI); Classic UI 7.x-8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/platform-customization/classic-ui/detail/references/basedetailv2
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: Model, FilterGroup, ComparisonType, HandleViewModelAttributeChangeRequest)

// ===== CLASSIC UI (7.x) =====================================================

// The detail: sums its rows and pushes the total to the page.
define("UsrMyDetail", [], function() {
	return {
		entitySchemaName: "UsrMyDetailEntity",
		messages: {
			"UsrDetailTotalChanged": {
				"mode": Terrasoft.MessageMode.PTP,
				"direction": Terrasoft.MessageDirectionType.PUBLISH
			}
		},
		methods: {
			onGridDataLoaded: function() {
				this.callParent(arguments);
				var total = 0;
				this.getGridData().each(function(row) {
					total += row.get("UsrAmount") || 0;
				}, this);
				this.sandbox.publish("UsrDetailTotalChanged", { total: total }, [this.sandbox.id]);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// The record page.
define("UsrMyEntity1Page", ["ProcessModuleUtilities"], function(ProcessModuleUtilities) {

	// Invented id of a UsrStatus record.
	const StatusInWork = "3c9f1a72-5b0e-4d8a-9e6f-7a2b1c0d9e31";

	return {
		entitySchemaName: "UsrMyEntity",
		messages: {
			"UsrDetailTotalChanged": {
				"mode": Terrasoft.MessageMode.PTP,
				"direction": Terrasoft.MessageDirectionType.SUBSCRIBE
			}
		},
		details: /**SCHEMA_DETAILS*/{
			"UsrMyDetail": {
				"schemaName": "UsrMyDetail",
				"entitySchemaName": "UsrMyDetailEntity",
				"filter": {
					"detailColumn": "UsrMyEntity",
					"masterColumn": "Id"
				},
				"defaultValues": {
					"UsrCurrency": { "masterColumn": "UsrCurrency" },
					"UsrQuantity": { "value": 1 }
				}
			}
		}/**SCHEMA_DETAILS*/,
		attributes: {
			// Lookup filtered by another field.
			"UsrCity": {
				"dataValueType": Terrasoft.DataValueType.LOOKUP,
				"lookupListConfig": {
					"filter": function() {
						var filters = Terrasoft.createFilterGroup();
						var country = this.get("UsrCountry");
						if (country) {
							filters.add("ByCountry", Terrasoft.createColumnFilterWithParameter(
								Terrasoft.ComparisonType.EQUAL, "UsrCountry", country.value));
						}
						return filters;
					}
				}
			},
			// Dependent field cleared on change.
			"UsrCountry": {
				"dependencies": [
					{ "columns": ["UsrCountry"], "methodName": "onCountryChanged" }
				]
			},
			// Drives the conditional requirement.
			"UsrStatus": {
				"dependencies": [
					{ "columns": ["UsrStatus"], "methodName": "applyOwnerRequired" }
				]
			}
		},
		methods: {

			init: function() {
				this.callParent(arguments);
				// Detail -> page, tagged with the detail's sandbox id.
				this.sandbox.subscribe("UsrDetailTotalChanged", function(args) {
					this.set("UsrTotal", args.total);
				}, this, [this.getDetailId("UsrMyDetail")]);
			},

			onEntityInitialized: function() {
				this.callParent(arguments);
				this.applyOwnerRequired();
			},

			onCountryChanged: function() {
				if (!this.get("IsEntityInitialized")) {
					return;
				}
				this.set("UsrCity", null);
			},

			applyOwnerRequired: function() {
				var status = this.get("UsrStatus");
				this.columns.UsrOwner.isRequired = !!status && status.value === StatusInWork;
				this.validateColumn("UsrOwner");
			},

			setValidationConfig: function() {
				this.callParent(arguments);
				this.addColumnValidator("UsrNumber", this.numberFormatValidator);
			},

			numberFormatValidator: function(value) {
				var number = value || this.get("UsrNumber");
				var message = "";
				if (number && !/^[A-Z]{2,5}-[0-9]{1,8}$/.test(number)) {
					message = this.get("Resources.Strings.WrongNumberFormatMessage");
				}
				return { fullInvalidMessage: message, invalidMessage: message };
			},

			// Save-time server check: Number must be unique.
			asyncValidate: function(callback, scope) {
				this.callParent([function(response) {
					if (!this.validateResponse(response)) {
						return;
					}
					Terrasoft.chain(
						function(next) {
							this.validateNumberIsUnique(function(stepResponse) {
								if (this.validateResponse(stepResponse)) {
									next();
								}
							}, this);
						},
						function() {
							callback.call(scope, response);
						},
						this);
				}, this]);
			},

			validateNumberIsUnique: function(callback, scope) {
				var number = this.get("UsrNumber");
				if (!number) {
					callback.call(scope, { success: true });
					return;
				}
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "UsrMyEntity" });
				esq.addColumn("Id");
				esq.filters.addItem(esq.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrNumber", number));
				esq.filters.addItem(esq.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.NOT_EQUAL, "Id", this.get("Id")));
				esq.getEntityCollection(function(result) {
					if (result.success && result.collection.getCount() > 0) {
						callback.call(scope, {
							success: false,
							message: this.get("Resources.Strings.NumberNotUniqueMessage")
						});
						return;
					}
					callback.call(scope, { success: true });
				}, this);
			},

			onSaved: function() {
				this.callParent(arguments);
				this.updateDetail({ detail: "UsrMyDetail" });
			},

			// Custom button: confirm, then run a process for this record.
			onRunApprovalClick: function() {
				if (this.isAddMode() || this.isCopyMode()) {
					this.showInformationDialog(this.get("Resources.Strings.SaveRecordFirstMessage"));
					return;
				}
				this.showConfirmationDialog(
					this.get("Resources.Strings.ConfirmRunApprovalMessage"),
					function(returnCode) {
						if (returnCode !== Terrasoft.MessageBoxButtons.YES.returnCode) {
							return;
						}
						ProcessModuleUtilities.executeProcess({
							sysProcessName: "UsrApproveMyEntityProcess",
							parameters: { UsrRecordId: this.get("Id") },
							callback: function() {
								this.showInformationDialog(this.get("Resources.Strings.ApprovalStartedMessage"));
							},
							scope: this
						});
					},
					[Terrasoft.MessageBoxButtons.YES.returnCode, Terrasoft.MessageBoxButtons.NO.returnCode],
					this);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrRunApprovalButton",
				"values": {
					"itemType": Terrasoft.ViewItemType.BUTTON,
					"caption": { "bindTo": "Resources.Strings.UsrRunApprovalButtonCaption" },
					"click": { "bindTo": "onRunApprovalClick" },
					"style": Terrasoft.controls.ButtonEnums.style.GREEN
				},
				"parentName": "LeftContainer",
				"propertyName": "items",
				"index": 5
			},
			{
				"operation": "insert",
				"name": "UsrMyDetail",
				"values": {
					"itemType": Terrasoft.ViewItemType.DETAIL,
					"markerValue": "added-detail"
				},
				"parentName": "GeneralInfoTab",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// One page. The detail's code lives here too: the list shares the page's view model.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	// Invented id of a UsrStatus record.
	const StatusInWork = "3c9f1a72-5b0e-4d8a-9e6f-7a2b1c0d9e31";
	// Column ids are generated by the designer; these are invented placeholders.
	const ColumnNameId = "6f1a2b3c-4d5e-4f60-8a71-b2c3d4e5f601";
	const ColumnAmountId = "6f1a2b3c-4d5e-4f60-8a71-b2c3d4e5f602";
	const ActionYes = "Yes";
	const ActionNo = "No";

	// Step 7. Both branches, always (was applyOwnerRequired).
	async function applyOwnerRequired($context) {
		const status = await $context.PDS_UsrStatus_c3d4e5f;
		if (status?.value === StatusInWork) {
			$context.enableAttributeValidator("PDS_UsrOwner_d4e5f6a", "required");
		} else {
			$context.disableAttributeValidator("PDS_UsrOwner_d4e5f6a", "required");
		}
	}

	// Step 9. The former validateNumberIsUnique. true = passes.
	async function numberIsUnique(number, recordId) {
		const model = await sdk.Model.create("UsrMyEntity");
		const filter = new sdk.FilterGroup();
		// add* returns void: build first, then pass the variable.
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "UsrNumber", number);
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Not_equal, "Id", recordId);
		const records = await model.load({
			attributes: ["Id"],
			parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
		});
		return records.length === 0;
	}

	// Step 10. The former detail onGridDataLoaded + page subscriber, in one place.
	async function recalculateTotal($context) {
		const rows = await $context.GridDetail_k7m2p9q;
		let total = 0;
		for (const row of (rows || [])) {
			total += Number(await row.GridDetail_k7m2p9qDS_UsrAmount) || 0;
		}
		// Write only on a real difference: a write marks the page as changed.
		if ((await $context.PDS_UsrTotal_f6a7b8c) !== total) {
			$context.PDS_UsrTotal_f6a7b8c = total;
		}
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// Step 11. Was the BUTTON diff item + onRunApprovalClick.
				"operation": "insert",
				"name": "UsrRunApprovalButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrRunApprovalButton_caption)#",
					"color": "primary",
					"iconPosition": "only-text",
					"clicked": { "request": "usr.RunApprovalRequest" }
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// Fields as the designer places them (step 1). "control", not "value".
				"operation": "insert",
				"name": "UsrNumber",
				"values": {
					"type": "crt.Input",
					"label": "$Resources.Strings.PDS_UsrNumber_e1f2a3b",
					"control": "$PDS_UsrNumber_e1f2a3b"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "UsrCountry",
				"values": {
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrCountry_b2c3d4e",
					"control": "$PDS_UsrCountry_b2c3d4e"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 1
			},
			{
				"operation": "insert",
				"name": "UsrCity",
				"values": {
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrCity_a1b2c3d",
					"control": "$PDS_UsrCity_a1b2c3d"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 2
			},
			{
				"operation": "insert",
				"name": "UsrStatus",
				"values": {
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrStatus_c3d4e5f",
					"control": "$PDS_UsrStatus_c3d4e5f"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 3
			},
			{
				"operation": "insert",
				"name": "UsrOwner",
				"values": {
					"type": "crt.ComboBox",
					"label": "$Resources.Strings.PDS_UsrOwner_d4e5f6a",
					"control": "$PDS_UsrOwner_d4e5f6a"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 4
			},
			{
				// A tab to hold the list (the Classic detail sat on a stock tab).
				"operation": "insert",
				"name": "UsrItemsTab",
				"values": {
					"type": "crt.TabContainer",
					"caption": "#ResourceString(UsrItemsTab_caption)#",
					"items": []
				},
				"parentName": "Tabs",
				"propertyName": "items",
				"index": 1
			},
			{
				// Step 3. The list's add button. Defaults travel with the request.
				"operation": "insert",
				"name": "GridDetailAddBtn_k7m2p9q",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(GridDetailAddBtn_k7m2p9q_caption)#",
					"iconPosition": "only-text",
					"clicked": {
						"request": "crt.CreateRecordRequest",
						"params": {
							"entityName": "UsrMyDetailEntity",
							"defaultValues": [
								// The master link - Classic filled it implicitly.
								{ "attributeName": "UsrMyEntity", "value": "$Id" },
								// Was { masterColumn: "UsrCurrency" }.
								{ "attributeName": "UsrCurrency", "value": "$PDS_UsrCurrency_a7b8c9d" },
								// Was { value: 1 }.
								{ "attributeName": "UsrQuantity", "value": 1 }
							]
						}
					}
				},
				"parentName": "UsrItemsTab",
				"propertyName": "items",
				"index": 0
			},
			{
				// Step 2. Was the DETAIL diff item.
				"operation": "insert",
				"name": "GridDetail_k7m2p9q",
				"values": {
					"type": "crt.DataGrid",
					"items": "$GridDetail_k7m2p9q",
					"primaryColumnName": "GridDetail_k7m2p9qDS_Id",
					"visible": true,
					"fitContent": true,
					"columns": [
						{
							"id": ColumnNameId,
							"code": "GridDetail_k7m2p9qDS_UsrName",
							"caption": "#ResourceString(GridDetail_k7m2p9qDS_UsrName)#",
							"dataValueType": 1
						},
						{
							"id": ColumnAmountId,
							"code": "GridDetail_k7m2p9qDS_UsrAmount",
							"caption": "#ResourceString(GridDetail_k7m2p9qDS_UsrAmount)#",
							"dataValueType": 6
						}
					]
				},
				"parentName": "UsrItemsTab",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"PDS_UsrNumber_e1f2a3b": {
						"modelConfig": { "path": "PDS.UsrNumber" },
						// Step 8. Was addColumnValidator("UsrNumber", ...).
						"validators": {
							"ValidateNumberFormat": {
								"type": "usr.MyNumberFormat",
								"params": {
									"message": "#ResourceString(WrongNumberFormatMessage)#"
								}
							}
						}
					},
					// Step 5/6. The parent: its change rebuilds the filter and clears City.
					"PDS_UsrCountry_b2c3d4e": {
						"modelConfig": { "path": "PDS.UsrCountry" },
						"change": { "request": "usr.CountryChangedRequest" }
					},
					"PDS_UsrCity_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrCity" }
					},
					// Step 5. The child's LIST attribute: "<lookup attribute>_List".
					"PDS_UsrCity_a1b2c3d_List": {
						"modelConfig": {
							"filterAttributes": [
								{ "loadOnChange": true, "name": "UsrCity_Filter" }
							]
						}
					},
					// Holds the City filter; null = no restriction.
					"UsrCity_Filter": { "value": null },
					// Step 6. Set once the record has loaded: guards the City clear.
					"UsrIsModelLoaded": { "value": false },
					"PDS_UsrStatus_c3d4e5f": {
						"modelConfig": { "path": "PDS.UsrStatus" }
					},
					// Step 7. Declared here, switched on/off at runtime.
					"PDS_UsrOwner_d4e5f6a": {
						"modelConfig": { "path": "PDS.UsrOwner" },
						"validators": {
							"required": { "type": "crt.Required" }
						}
					},
					// Read by the add button's defaults; not shown on the page.
					"PDS_UsrCurrency_a7b8c9d": {
						"modelConfig": { "path": "PDS.UsrCurrency" }
					},
					"PDS_UsrTotal_f6a7b8c": {
						"modelConfig": { "path": "PDS.UsrTotal" }
					},
					// Step 2. The list's rows: one attribute per column a handler reads.
					"GridDetail_k7m2p9q": {
						"isCollection": true,
						"modelConfig": { "path": "GridDetail_k7m2p9qDS" },
						"viewModelConfig": {
							"attributes": {
								"GridDetail_k7m2p9qDS_Id": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.Id" } },
								"GridDetail_k7m2p9qDS_UsrName": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.UsrName" } },
								"GridDetail_k7m2p9qDS_UsrAmount": { "modelConfig": { "path": "GridDetail_k7m2p9qDS.UsrAmount" } }
							}
						}
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[
			{
				// Step 2. The Classic detail `filter`: without it the list shows ALL rows.
				"operation": "merge",
				"path": [],
				"values": {
					"dependencies": {
						"GridDetail_k7m2p9qDS": [
							{ "attributePath": "UsrMyEntity", "relationPath": "PDS.Id" }
						]
					}
				}
			},
			{
				// The record's own data source "PDS" is generated with the page; not repeated.
				"operation": "merge",
				"path": ["dataSources"],
				"values": {
					"GridDetail_k7m2p9qDS": {
						"type": "crt.EntityDataSource",
						"scope": "viewElement",
						"config": {
							"entitySchemaName": "UsrMyDetailEntity",
							"attributes": {
								"UsrName": { "path": "UsrName" },
								"UsrAmount": { "path": "UsrAmount" }
							}
						}
					}
				}
			}
		]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Was init + onEntityInitialized.
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					request.$context.events$.subscribe((evt) => {
						if (evt?.type === "finish-load-model-attributes") {
							request.$context.UsrIsModelLoaded = true;
						}
					});
					// Step 7. Covers a status that never changes on this open.
					await applyOwnerRequired(request.$context);
					return result;
				}
			},
			{
				// Step 7. Was "dependencies" on UsrStatus. Runs on load too, on purpose.
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					if (request.attributeName === "PDS_UsrStatus_c3d4e5f") {
						await applyOwnerRequired(request.$context);
					}
					return next?.handle(request);
				}
			},
			{
				// Steps 5 and 6. Was lookupListConfig.filter + onCountryChanged.
				request: "usr.CountryChangedRequest",
				handler: async (request, next) => {
					const country = await request.$context.PDS_UsrCountry_b2c3d4e;
					if (!country?.value) {
						request.$context.UsrCity_Filter = null;
					} else {
						const filter = new sdk.FilterGroup();
						filter.addSchemaColumnFilterWithParameter(
							sdk.ComparisonType.Equal, "UsrCountry", country.value);
						request.$context.UsrCity_Filter = filter;
					}
					// Was the IsEntityInitialized guard: only after a user edit.
					const city = await request.$context.PDS_UsrCity_a1b2c3d;
					if (city && await request.$context.UsrIsModelLoaded) {
						request.$context.PDS_UsrCity_a1b2c3d = null;
					}
					return next?.handle(request);
				}
			},
			{
				// Step 9. Was asyncValidate (before next) + onSaved/updateDetail (after).
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const number = await request.$context.PDS_UsrNumber_e1f2a3b;
					// Empty Number: leave it to the field validators inside next.
					if (number && !(await numberIsUnique(number, await request.$context.Id))) {
						await request.$context.executeRequest({
							type: "crt.NotificationRequest",
							$context: request.$context,
							message: await request.$context.Resources.Strings.NumberNotUniqueMessage
						});
						// Was callback({ success: false }): next is not called.
						return false;
					}
					const result = await next?.handle(request);
					// Reload the detail only if the save went through.
					if (result) {
						await request.$context.executeRequest({
							type: "crt.LoadDataRequest",
							$context: request.$context,
							config: { loadType: "reload", useLastLoadParameters: true },
							dataSourceName: "GridDetail_k7m2p9qDS"
						});
					}
					return result;
				}
			},
			{
				// Step 10. Was the UsrDetailTotalChanged message. Rows are read after
				// next resolves (observed: the collection is filled by then).
				request: "crt.LoadDataRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					if (request.dataSourceName === "GridDetail_k7m2p9qDS") {
						await recalculateTotal(request.$context);
					}
					return result;
				}
			},
			{
				// Step 11. Was onRunApprovalClick: confirm, then start the process.
				request: "usr.RunApprovalRequest",
				handler: async (request, next) => {
					// Config NESTED in dialogConfig.data; the result is the action key.
					const key = await request.$context.executeRequest({
						type: "crt.ShowDialogRequest",
						$context: request.$context,
						dialogConfig: {
							data: {
								message: await request.$context.Resources.Strings.ConfirmRunApprovalMessage,
								actions: [
									{ key: ActionYes, config: { color: "primary", caption: "Yes" } },
									{ key: ActionNo, config: { color: "default", caption: "No" } }
								]
							}
						}
					});
					if (key !== ActionYes) {
						return next?.handle(request);
					}
					// Was executeProcess + the isAddMode "save first" guard.
					// showNotification: true reports the start to the user.
					await request.$context.executeRequest({
						type: "crt.RunBusinessProcessRequest",
						$context: request.$context,
						processName: "UsrApproveMyEntityProcess",
						processRunType: "ForTheSelectedPage",
						recordIdProcessParameterName: "UsrRecordId",
						saveAtProcessStart: true,
						showNotification: true
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{
			// Step 8. Was numberFormatValidator. null = valid.
			"usr.MyNumberFormat": {
				"validator": function(config) {
					return function(control) {
						const number = control.value;
						if (!number || /^[A-Z]{2,5}-[0-9]{1,8}$/.test(number)) {
							return null;
						}
						return { "usr.MyNumberFormat": { message: config.message } };
					};
				},
				"params": [
					{ "name": "message" }
				],
				"async": false
			}
		}/**SCHEMA_VALIDATORS*/
	};
});
