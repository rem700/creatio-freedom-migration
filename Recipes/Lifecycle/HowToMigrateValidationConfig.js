// --- How to migrate setValidationConfig / addColumnValidator to Freedom UI -----
// Classic UI binds per-column validators in an override of
// setValidationConfig() with this.addColumnValidator(column, fn); the function
// returns { fullInvalidMessage, invalidMessage } and empty strings mean valid.
// Freedom UI declares a validator TYPE in the `validators` section and attaches
// it to an attribute under `validators` in viewModelConfigDiff. The function
// returns null when valid, or { "<type>": { message } } when not.
//
// API MAP
//   setValidationConfig() + callParent      ->  validators: { "usr.X": { validator, params, async } }
//   this.addColumnValidator("UsrPhone", fn)  ->  viewModelConfigDiff attribute
//                                               "validators": { "<key>": { "type": "usr.X", "params": {...} } }
//   fn(value) with this = view model         ->  validator(config) returns function(control);
//                                               control.value is the field value
//   return { invalidMessage: "" }            ->  return null
//   return { invalidMessage: msg, ... }      ->  return { "usr.X": { message: msg } }
//   isRequired / required column             ->  validator "required": { "type": "crt.Required" }
//   this.validateColumn("UsrOwner")          ->  enableAttributeValidator / disableAttributeValidator
//   this.get("Resources.Strings.Msg")        ->  pass the text in params, e.g.
//                                               "message": "#ResourceString(Msg)#"
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - A Freedom UI validator sees ONLY its own control's value and its params.
//     There is no `this`: a cross-field check (due date after start date)
//     cannot read the other field. Move it to a crt.SaveRecordRequest handler,
//     or recalculate a flag attribute in a change handler and validate that.
//   - A validator bound to two columns (to re-run when either changes) has no
//     equivalent; the save handler re-checks both at save time.
//   - The type name carries your prefix ("usr.*"); the attribute key
//     ("ValidatePhone") is what enable/disableAttributeValidator take.
//   - The input must bind the attribute with "control"; a field bound with
//     "value" is not validated and shows no error (observed).
//   - A message is localised with "#ResourceString(X)#" in the attribute's
//     validator params (Academy); a `message` set there wins over the one the
//     validator function builds. A literal also works.
//   - A validator can be switched off declaratively with "disabled": true on
//     the attribute's validator entry.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   A validator function that still returns the Classic object
//   { invalidMessage: "", fullInvalidMessage: "" } for VALID input is truthy,
//   so Freedom UI treats every value as invalid; returning it with a message
//   for invalid input shows no text. A validator declared in `validators` but
//   never attached to an attribute never runs.
//
// See: Recipes/Lifecycle/HowToMigrateAsyncValidate.js
// See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
// Applies: Creatio 8.1+; Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/customize-page-fields/overview
// Source: https://academy.creatio.com/node/541750 (Classic UI: validate a field on a record page)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {

			setValidationConfig: function() {
				this.callParent(arguments);
				this.addColumnValidator("UsrPhone", this.phoneValidator);
			},

			phoneValidator: function(value) {
				var phone = value || this.get("UsrPhone");
				var message = "";
				if (phone && !/^\+?[0-9\s\-()]{7,20}$/.test(phone)) {
					message = this.get("Resources.Strings.WrongPhoneFormatMessage");
				}
				return { fullInvalidMessage: message, invalidMessage: message };
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrPhoneInput",
				"values": {
					"type": "crt.Input",
					"label": "$Resources.Strings.PDS_UsrPhone_a1b2c3d",
					// "control", not "value": only a control binding is validated.
					"control": "$PDS_UsrPhone_a1b2c3d"
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"PDS_UsrPhone_a1b2c3d": {
						"modelConfig": { "path": "PDS.UsrPhone" },
						// Was: addColumnValidator("UsrPhone", this.phoneValidator)
						"validators": {
							"ValidatePhone": {
								"type": "usr.PhoneFormat",
								"params": {
									"message": "#ResourceString(WrongPhoneFormatMessage)#"
								}
							}
						}
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{
			"usr.PhoneFormat": {
				"validator": function(config) {
					return function(control) {
						const phone = control.value;
						// null = valid (Classic: empty invalidMessage).
						if (!phone || /^\+?[0-9\s\-()]{7,20}$/.test(phone)) {
							return null;
						}
						return { "usr.PhoneFormat": { message: config.message } };
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
