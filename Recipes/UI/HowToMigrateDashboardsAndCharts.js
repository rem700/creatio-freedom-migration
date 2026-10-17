// --- How to migrate dashboards, chart and indicator widgets (DashboardModule, IndicatorModule) to Freedom UI ---
// In Classic UI a dashboard is a SysDashboard record whose Items JSON lists
// widgets by widgetType ("Chart", "Indicator", "Gauge", "List", "Module",
// ...) with their parameters (schemaName, xAxisColumn, yAxisColumn, type,
// filterData, ...). Users build them in the section's analytics view; a
// developer extends them with a custom widget module (a module extending
// Terrasoft.IndicatorModule / ChartModule, driven by sandbox messages such as
// GetIndicatorConfig / GenerateIndicator) selected in the "Module" widget
// with JSON "Module parameters". In Freedom UI dashboards are no-code: Chart,
// Metric, Gauge, Sales pipeline and Full pipeline widgets are added to ANY
// Freedom UI page and configured in the Freedom UI Designer, and since 8.3.1
// a list can be added as crt.ListWidget. Academy publishes no developer
// reference (type names, properties) for the chart, metric and gauge
// widgets: configure them in the designer and keep the generated schema.
// Classic section dashboards can be moved with the "Dashboards migrator"
// Marketplace app (8.3.1+).
//
// API MAP
//   SysDashboard.Items { widgetType: "Chart", parameters: { schemaName,
//       xAxisColumn, yAxisColumn, type, filterData } }
//                                  ->  Chart widget configured in the Freedom UI Designer
//                                      ("Chart settings"); stored in the page schema, not
//                                      in SysDashboard (community, staff answer)
//   widgetType "Indicator" / "Gauge" ->  Metric / Gauge widget (designer)
//   widgetType "List" (dashboard list)
//                                  ->  crt.ListWidget (8.3.1+, Academy reference), or a
//                                      crt.DataGrid list on the page
//   Classic section dashboards (analytics view)
//                                  ->  Dashboards migrator app, System Designer > "Dashboards
//                                      migration from Classic UI to Freedom UI" (8.3.1+), or
//                                      rebuild by hand in the designer
//   custom widget module extends Terrasoft.IndicatorModule / ChartModule
//                                  ->  no extension point documented for Freedom UI widgets;
//                                      compute the value in a handler and show it in a page
//                                      element, or build a custom view element (remote module)
//                                      See: Recipes/UI/HowToMigrateCustomControl.js
//   sandbox "GenerateIndicator" / "GetIndicatorConfig" messages
//                                  ->  none; the element binds to a view-model attribute
//   "Module parameters" JSON ({ parameters: {...} })
//                                  ->  element properties in viewConfigDiff / @CrtInput properties
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Element type names for chart / metric / gauge widgets are not in the
//     Academy references (only crt.ListWidget is, from 8.3.1). Do not type
//     them by hand from memory: add the widget in the designer and keep the
//     JSON it generates. A DOM tag such as crt-indicator-widget is visible in
//     the browser (community), which is not a documented schema type.
//   - The migrator skips pivot tables, custom modules and custom components,
//     and marks such dashboards "Partially migrated". Every Classic custom
//     widget module is rebuild work.
//   - Storage changes: Freedom UI dashboards live in client schemas
//     (packaged) or, when created without changing a package, in user-level
//     schema data (SysUserLevelSchema) - community answer, 2025. A script
//     that inserted SysDashboard rows to ship a dashboard does not ship a
//     Freedom UI one; package the page schema instead.
//   - Widget previews in the setup page show part of the data and may differ
//     from the live widget (Academy).
//   - Whether a custom view element can sit inside a Freedom UI dashboard
//     component (rather than on the page next to it) is not documented.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Classic widget JSON (widgetType, parameters, configurationMessage) pasted
//   into a Freedom UI viewConfigDiff renders nothing: unknown properties are
//   ignored and there is no widgetType in Freedom UI. A custom Classic module
//   listed in SCHEMA_DEPS loads but never receives GenerateIndicator, so it
//   shows nothing.
//
// See: Recipes/Data/HowToMigrateEsqQueries.js
// Applies: Classic UI 7.x; Freedom UI 8.1+ (designer widgets); crt.ListWidget and the Dashboards migrator 8.3.1+
// Source: https://academy.creatio.com/guides/no-code-customization/8.1/customization-tools/ui-and-business-logic-customization/set-up-dashboards
// Source: https://academy.creatio.com/guides/no-code-customization/8.3/customization-tools/ui-and-business-logic-customization/analytics/migrate-dashboards-classic-to-freedom-ui
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.3/platform-customization/freedom-ui/page-customization-basics/references/list
// Source: https://academy.creatio.com/node/622669 (Classic: adding a custom dashboard widget, IndicatorModule)
// Source: https://academy.creatio.com/node/622522 (Classic: chart widget JSON, widgetType "Chart")
// Source: https://community.creatio.com/questions/scripting-freedom-ui-dashboards-sysfreedomdashboard-creatio-830

// ===== CLASSIC UI (7.x) =====================================================

// A custom indicator widget (abridged from Academy's pattern): open lines of
// the current user, shown as a number. Selected in a dashboard's "Module"
// widget with Module parameters:
//	{ "parameters": { "style": "widget-blue" }, "configurationMessage": "GetIndicatorConfig" }
define("UsrOpenLinesIndicatorModule", ["IndicatorModule"], function() {
	Ext.define("Terrasoft.configuration.UsrOpenLinesIndicatorModule", {
		extend: "Terrasoft.IndicatorModule",
		alternateClassName: "Terrasoft.UsrOpenLinesIndicatorModule",

		init: function() {
			this.callParent(arguments);
			this.sandbox.subscribe("GenerateIndicator", this.onGenerateIndicator, this, [this.sandbox.id]);
		},

		onGenerateIndicator: function() {
			var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "UsrMyDetailEntity" });
			esq.addColumn("Id");
			esq.filters.add("Mine", esq.createColumnFilterWithParameter(
				Terrasoft.ComparisonType.EQUAL, "CreatedBy", Terrasoft.SysValue.CURRENT_USER_CONTACT.value));
			esq.filters.add("Open", esq.createColumnFilterWithParameter(
				Terrasoft.ComparisonType.EQUAL, "UsrIsClosed", false));
			esq.getEntityCollection(function(result) {
				var count = result.success ? result.collection.getCount() : 0;
				this.viewModel.set("UsrOpenLinesCount", count);
			}, this);
		}
	});
	return Terrasoft.UsrOpenLinesIndicatorModule;
});

// ===== FREEDOM UI (8.1+) ====================================================

// ROUTE 1 (preferred, no code): add a Metric widget in the Freedom UI
// Designer on the page, object UsrMyDetailEntity, count, filters "Created by
// = current user" and "Is closed = false". Keep the JSON the designer writes
// into viewConfigDiff; it is not reproduced here because its element type and
// properties are not documented.
//
// ROUTE 2 (code, when the designer cannot express the value): compute it in a
// handler and bind a page element to the attribute.
define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "UsrOpenLinesLabel",
				"values": {
					"type": "crt.Label",
					"caption": "$UsrOpenLinesCaption"
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
					"UsrOpenLinesCaption": { "value": "" }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// "GenerateIndicator" -> page init.
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const result = await next?.handle(request);
					const sysValues = await new sdk.SysValuesService().loadSysValues();
					const filter = new sdk.FilterGroup();
					filter.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Equal, "CreatedBy", sysValues.userContact.value);
					filter.addSchemaColumnFilterWithParameter(
						sdk.ComparisonType.Equal, "UsrIsClosed", false);
					const model = await sdk.Model.create("UsrMyDetailEntity");
					const rows = await model.load({
						attributes: ["Id"],
						parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
					});
					request.$context.UsrOpenLinesCaption = String(rows.length);
					return result;
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
