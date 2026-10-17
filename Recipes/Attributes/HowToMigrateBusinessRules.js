// --- How to migrate businessRules (BusinessRuleModule) to Freedom UI -----------
// Classic UI page business rules live in the page schema's `businessRules`
// section as numeric JSON (BusinessRuleModule.enums: BINDPARAMETER with
// property VISIBLE / ENABLED / REQUIRED / READONLY, and FILTRATION). They are
// NOT migrated: Academy says business rules must be recreated when a section
// moves to Freedom UI. Freedom UI has its own no-code business rules, set up
// in the designer at page level or object level, with actions "Show elements",
// "Make elements required", "Make elements read-only", "Apply static filter",
// "Apply filter" and "Set values". Recreate each rule there; port to handlers
// only what the designer cannot express.
//
// API MAP
//   ruleType BINDPARAMETER, property VISIBLE  ->  rule action "Show elements"
//   property REQUIRED                         ->  "Make elements required"
//   property ENABLED / READONLY               ->  "Make elements read-only" (inverted meaning
//                                                for ENABLED)
//   ruleType FILTRATION                       ->  "Apply filter" ("Clear value..." = autoClean,
//                                                "Populate value..." = autocomplete)
//   rule with a SYSSETTING / SYSVALUE operand,
//     arithmetic, or a query                   ->  handlers: change handler + bound attribute
//                                                or enable/disableAttributeValidator
//   businessRules in the page schema           ->  page-level rule (this page only) or
//                                                object-level rule (every Freedom UI page of
//                                                the object, editable lists included)
//   column default / "set value" in code       ->  "Set values" (object-level rules only)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Nothing is converted automatically; the Classic JSON is not read by
//     Freedom UI pages.
//   - "Show elements" hides the element when the IF condition is NOT met;
//     there is no separate "hide" action.
//   - When several rules affect the same element, only the first is
//     activated (Academy). Classic evaluated each rule on its own.
//   - Object-level rules also apply to other Freedom UI pages and editable
//     lists of the object: a rule that was page-specific in Classic belongs at
//     page level.
//   - Where the designer stores Freedom UI rules is not part of the page's
//     handlers; do not hand-edit them into the schema. Use the designer.
//   - Do not implement the same rule as a designer rule AND a handler: they
//     fight over the same property.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Pasting the Classic `businessRules` block into a Freedom UI schema is
//   ignored without an error: the section does not exist in a Freedom UI
//   page, so the field is never hidden, never required, the lookup never
//   filtered. Porting a REQUIRED rule as a "visible"-style binding changes
//   only the look; use a required rule or the crt.Required validator.
//
// See: Recipes/Attributes/HowToMigrateEnabledVisibleRequired.js
// See: Recipes/Attributes/HowToMigrateDependentLookup.js
// Applies: Creatio 8.1+ (Freedom UI business rules as documented for 8.1); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/freedom-ui-business-rules
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/app-management/move-a-classic-ui-section-to-freedom-ui
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/classic-ui/client-schema/references/rules-and-businessrules

// ===== CLASSIC UI (7.x) =====================================================

// "UsrOwner is required while UsrAccount is filled in" and
// "UsrResult is editable while UsrIsClosed is false".
define("UsrMyEntity1Page", ["BusinessRuleModule"], function(BusinessRuleModule) {

	// Invented rule ids.
	const UsrOwnerRequiredRuleId = "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a81";
	const UsrResultEnabledRuleId = "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a82";

	return {
		entitySchemaName: "UsrMyEntity",
		businessRules: /**SCHEMA_BUSINESS_RULES*/{
			"UsrOwner": {
				"UsrOwnerRequiredRule": {
					"uId": UsrOwnerRequiredRuleId,
					"enabled": true,
					"removed": false,
					"invalid": false,
					"ruleType": BusinessRuleModule.enums.RuleType.BINDPARAMETER,
					"property": BusinessRuleModule.enums.Property.REQUIRED,
					"logical": Terrasoft.LogicalOperatorType.AND,
					"conditions": [
						{
							"comparisonType": Terrasoft.ComparisonType.IS_NOT_NULL,
							"leftExpression": {
								"type": BusinessRuleModule.enums.ValueType.ATTRIBUTE,
								"attribute": "UsrAccount"
							}
						}
					]
				}
			},
			"UsrResult": {
				"UsrResultEnabledRule": {
					"uId": UsrResultEnabledRuleId,
					"enabled": true,
					"removed": false,
					"invalid": false,
					"ruleType": 0,        // BINDPARAMETER
					"property": 1,        // ENABLED
					"logical": 0,         // AND
					"conditions": [
						{
							"comparisonType": 3,   // EQUAL
							"leftExpression": { "type": 1, "dataValueType": 12, "attribute": "UsrIsClosed" },
							"rightExpression": { "type": 0, "dataValueType": 12, "value": false }
						}
					]
				}
			}
		}/**SCHEMA_BUSINESS_RULES*/,
		methods: {},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

// Preferred: recreate both rules in the Freedom UI Designer (no code):
//   IF "Account" is filled in          THEN "Make elements required": Owner
//   IF "Is closed" = true              THEN "Make elements read-only": Result
//
// The code route below is for conditions the designer cannot express. It is
// the same two rules as handlers.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {

	async function applyRules($context) {
		const account = await $context.PDS_UsrAccount_a1b2c3d;
		if (account?.value) {
			$context.enableAttributeValidator("PDS_UsrOwner_b2c3d4e", "required");
		} else {
			$context.disableAttributeValidator("PDS_UsrOwner_b2c3d4e", "required");
		}
		$context.UsrIsResultReadonly = Boolean(await $context.PDS_UsrIsClosed_c3d4e5f);
	}

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"name": "UsrResult",
				"values": { "readonly": "$UsrIsResultReadonly" }
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsResultReadonly": { "value": false },
					"PDS_UsrOwner_b2c3d4e": {
						"modelConfig": { "path": "PDS.UsrOwner" },
						"validators": { "required": { "type": "crt.Required" } }
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					const drivers = ["PDS_UsrAccount_a1b2c3d", "PDS_UsrIsClosed_c3d4e5f"];
					if (drivers.includes(request.attributeName)) {
						await applyRules(request.$context);
					}
					return next?.handle(request);
				}
			},
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					await next?.handle(request);
					await applyRules(request.$context);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
