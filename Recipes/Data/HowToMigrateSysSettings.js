// --- How to migrate Terrasoft.SysSettings (querySysSettingsItem) to Freedom UI ---
// Classic UI reads system settings through the global Terrasoft.SysSettings:
// querySysSettingsItem(code, callback, scope) for one value,
// querySysSettings([codes], callback, scope) for several, and
// postSysSettingsValues({ sysSettingsValues, isPersonal }, callback, scope) to
// write. Freedom UI uses sdk.SysSettingsService from a handler:
// getByCode(code) -> SysSetting, getByCodes([codes]) -> { values, notFoundSettings },
// update({ code, value }, isPersonal) and updateMany([...], isPersonal).
//
// API MAP
//   Terrasoft.SysSettings.querySysSettingsItem("Code", function(value) {...}, this)
//                                            ->  const s = await new sdk.SysSettingsService().getByCode("Code");
//                                                s?.value
//   Terrasoft.SysSettings.querySysSettings(["A", "B"], function(settings) { settings.A })
//                                            ->  const r = await service.getByCodes(["A", "B"]);
//                                                r.values.A?.value
//   (missing code: undefined in the callback) ->  r.notFoundSettings: ["B"]
//   Terrasoft.SysSettings.postSysSettingsValues({ sysSettingsValues: { A: v },
//       isPersonal: false }, cb, scope)      ->  await service.update({ code: "A", value: v }, false)
//   several values in one post               ->  await service.updateMany([{ code, value }, ...], false)
//   Terrasoft.SysSettings.getCachedSysSetting("A")
//                                            ->  no synchronous getter; await getByCode
//   Terrasoft.SysValue.CURRENT_USER_CONTACT  ->  (await new sdk.SysValuesService().loadSysValues())
//                                                .userContact   // system VALUES, not settings
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - The Classic callback receives the bare VALUE; getByCode returns a
//     SysSetting object { id, name, code, value, displayValue, dataValueType,
//     isCacheable }. Port `value` as `setting?.value`.
//   - getByCodes nests the settings under `.values`; Classic's callback object
//     was keyed by code directly.
//   - Lookup settings: Classic gave { value, displayValue } as the value. The
//     Freedom SysSetting carries value and displayValue side by side. Log one
//     lookup setting on your version before comparing ids.
//   - Writes return SaveSysSettingsResponse { success, rowsAffected,
//     saveResult, errorInfo? } - check success; Classic's callback had no flag.
//   - Both generations read with the CURRENT user's rights. A setting the user
//     may not read comes back empty, not as an error (observed).
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   `request.$context.X = await service.getByCode("Code")` stores the whole
//   SysSetting object; a numeric field bound to it shows nothing and a boolean
//   check `if (setting)` is always true, even for a setting whose value is
//   false. Likewise `r.A` on the getByCodes result is undefined (it is
//   r.values.A). Always read `.value`.
//
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: SysSettingsService, SysSetting, QuerySysSettingsResponse)
// Source: https://academy.creatio.com/api/jscoreapi/7.15.0/index.html#!/api/Terrasoft.core.SysSettings

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrMaxDiscount": {
				"dataValueType": Terrasoft.DataValueType.FLOAT,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": 0
			},
			"UsrIsAuditEnabled": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {
			onEntityInitialized: function() {
				this.callParent(arguments);
				Terrasoft.SysSettings.querySysSettingsItem("UsrMaxDiscount", function(value) {
					this.set("UsrMaxDiscount", value || 0);
				}, this);
				Terrasoft.SysSettings.querySysSettings(["UsrDefaultCurrency", "UsrIsAuditEnabled"],
					function(settings) {
						if (settings.UsrDefaultCurrency && !this.get("UsrCurrency")) {
							this.set("UsrCurrency", settings.UsrDefaultCurrency);
						}
						this.set("UsrIsAuditEnabled", !!settings.UsrIsAuditEnabled);
					}, this);
			},

			saveMaxDiscount: function(value) {
				Terrasoft.SysSettings.postSysSettingsValues({
					sysSettingsValues: { "UsrMaxDiscount": value },
					isPersonal: false
				}, function() {
					this.set("UsrMaxDiscount", value);
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrMaxDiscount": { "value": 0 },
					"UsrIsAuditEnabled": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					const service = new sdk.SysSettingsService();

					const maxDiscount = await service.getByCode("UsrMaxDiscount");
					request.$context.UsrMaxDiscount = maxDiscount?.value || 0;

					const response = await service.getByCodes(["UsrDefaultCurrency", "UsrIsAuditEnabled"]);
					const settings = response?.values || {};
					const currency = settings.UsrDefaultCurrency;
					if (currency?.value && !(await request.$context.PDS_UsrCurrency_a1b2c3d)) {
						// Shape check: see the lookup note in the header.
						request.$context.PDS_UsrCurrency_a1b2c3d = typeof currency.value === "object"
							? currency.value
							: { value: currency.value, displayValue: currency.displayValue };
					}
					request.$context.UsrIsAuditEnabled = !!settings.UsrIsAuditEnabled?.value;
					return result;
				}
			},
			{
				request: "usr.SaveMaxDiscountRequest",
				handler: async (request, next) => {
					const value = await request.$context.UsrMaxDiscount;
					const response = await new sdk.SysSettingsService()
						.update({ code: "UsrMaxDiscount", value: value }, false);
					if (!response?.success) {
						console.error(response?.errorInfo);
					}
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
