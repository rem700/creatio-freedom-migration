// --- How to migrate Terrasoft.SysValue.CURRENT_USER_CONTACT (current user) to sdk.SysValuesService ---
// Classic UI reads the current user synchronously from the global
// Terrasoft.SysValue: CURRENT_USER (the SysAdminUnit), CURRENT_USER_CONTACT,
// CURRENT_USER_ACCOUNT, CURRENT_USER_CULTURE ..., each a lookup-shaped
// { value, displayValue }. Freedom UI has no synchronous global: create
// sdk.SysValuesService and `await loadSysValues()`, which returns one SysValues
// object with camelCase keys (user, userContact, userAccount, userCulture,
// primaryCulture, primaryLanguage, maintainer, workspace, userTimezoneCode,
// userTimezoneOffset, coreVersion ...). Role membership is still a query, now
// with sdk.Model.
//
// API MAP
//   Terrasoft.SysValue.CURRENT_USER          ->  (await new sdk.SysValuesService().loadSysValues()).user
//   Terrasoft.SysValue.CURRENT_USER_CONTACT  ->  sysValues.userContact
//   Terrasoft.SysValue.CURRENT_USER_ACCOUNT  ->  sysValues.userAccount
//   Terrasoft.SysValue.CURRENT_USER_CULTURE  ->  sysValues.userCulture
//   Terrasoft.SysValue.PRIMARY_CULTURE       ->  sysValues.primaryCulture
//   Terrasoft.SysValue.CURRENT_MAINTAINER    ->  sysValues.maintainer
//   .value / .displayValue                   ->  .value / .displayValue (same lookup shape)
//   ESQ on SysAdminUnitInRole (role check)   ->  sdk.Model.create("SysAdminUnitInRole") + load()
//   Terrasoft.createColumnInFilterWithParameters("SysAdminUnitRoleId", ids)
//                                            ->  filter.addSchemaColumnInFilterWithParameters(
//                                                    sdk.ComparisonType.Equal, "SysAdminUnitRoleId", ids)
//   attribute default = current contact      ->  prefer the column default in the Object designer
//                                                ("current user contact"); it works for both UIs
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Synchronous -> asynchronous. Every place that read SysValue inline (a
//     filter builder, a converter, a validator) must move into an async handler
//     or receive the value through an attribute set earlier.
//   - Converters are synchronous; validators are too unless declared
//     `async: true`, whose contract is undocumented. Neither should call
//     loadSysValues. Load once in crt.HandleViewModelInitRequest, keep the id in
//     a declared attribute, and bind/compare against that.
//   - "May this user do X" is better ported as a system OPERATION check than as
//     a role check. See: Recipes/Messaging/HowToMigrateOperationRights.js
//   - Reading a system SETTING (not a system value) is a different service.
//     See: Recipes/Data/HowToMigrateSysSettings.js
//   - The client check only shapes the UI; enforce the rule on the server too.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   `sysValues.CURRENT_USER_CONTACT` is undefined (the keys are camelCase), and
//   `new sdk.SysValuesService().loadSysValues().userContact` without await reads
//   a property of a Promise - also undefined. Either one, fed into a filter,
//   makes the filter compare with nothing; fed into a "mine only" check, every
//   comparison is false and the UI silently treats the user as a stranger.
//
// Applies: Creatio 8.1+ (SysValuesService in every published @creatio-devkit/common, 0.803.0+); Classic UI 7.x–8.x
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: SysValuesService, SysValues)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {

	const RoleSupervisors = "5e1d2c3b-4a59-4f68-8a7b-6c5d4e3f2a1b";

	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrIsSupervisor": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				if (this.isAddMode()) {
					var contact = Terrasoft.SysValue.CURRENT_USER_CONTACT;
					this.set("UsrResponsible", { value: contact.value, displayValue: contact.displayValue });
				}
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "SysAdminUnitInRole" });
				esq.addColumn("Id");
				esq.filters.add("User", Terrasoft.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "SysAdminUnit", Terrasoft.SysValue.CURRENT_USER.value));
				esq.filters.add("Role", Terrasoft.createColumnInFilterWithParameters(
					"SysAdminUnitRoleId", [RoleSupervisors]));
				esq.getEntityCollection(function(result) {
					if (!this.destroyed) {
						this.set("UsrIsSupervisor", result.success && result.collection.getCount() > 0);
					}
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const RoleSupervisors = "5e1d2c3b-4a59-4f68-8a7b-6c5d4e3f2a1b";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrSupervisorComment",
				"values": { "visible": "$UsrIsSupervisor" }
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsSupervisor": { "value": false },
					// Kept for synchronous converters/validators that need the id.
					"UsrCurrentContactId": {}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);

					const sysValues = await new sdk.SysValuesService().loadSysValues();
					request.$context.UsrCurrentContactId = sysValues.userContact?.value;

					const model = await sdk.Model.create("SysAdminUnitInRole");
					const filter = new sdk.FilterGroup();
					filter.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Equal, "SysAdminUnit", sysValues.user.value);
					filter.addSchemaColumnInFilterWithParameters(
						sdk.ComparisonType.Equal, "SysAdminUnitRoleId", [RoleSupervisors]);
					const rows = await model.load({
						attributes: ["Id"],
						parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
					});
					request.$context.UsrIsSupervisor = rows.length > 0;
				}
			},
			{
				// Writing the current contact into a lookup, here from a button.
				// For a NEW-record default prefer the column default (see header).
				request: "usr.AssignToMeRequest",
				handler: async (request, next) => {
					const sysValues = await new sdk.SysValuesService().loadSysValues();
					request.$context.PDS_UsrResponsible_e1f2a3b = {
						value: sysValues.userContact.value,
						displayValue: sysValues.userContact.displayValue
					};
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
