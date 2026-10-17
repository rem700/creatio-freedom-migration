// --- Schema structure mapping reference: Classic UI sections to Freedom UI ------
// Reference text. Maps every top-level section of a Classic UI client schema
// (entitySchemaName, details, attributes, messages, mixins, methods, rules,
// businessRules, diff) to where the same concern lives in a Freedom UI page
// (viewConfigDiff, viewModelConfigDiff, modelConfigDiff, handlers, converters,
// validators), with the properties.json SchemaType that tells the generations
// apart and the 8.0 vs 8.1+ section names.
//
// API MAP
//   diff                         ->  viewConfigDiff
//   attributes                   ->  viewModelConfigDiff (path ["attributes"])
//   entitySchemaName / details   ->  modelConfigDiff (path ["dataSources"])
//   methods                      ->  handlers (+ converters, validators)
//   messages                     ->  requests (crt.* / usr.*) on the same page
//   mixins                       ->  no equivalent (shared Module schema / remote module)
//   rules / businessRules        ->  Freedom UI business rules or handlers
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - A Classic schema is a class with inheritance (callParent); a Freedom UI
//     schema is a set of diffs merged into its parent plus a handler chain
//     (next?.handle).
//   - On 8.0 the attribute and data source sections are objects
//     (viewModelConfig / modelConfig); on 8.1+ they are diff arrays.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Any Classic section name (diff, attributes, methods, messages, mixins,
//   businessRules) inside a Freedom UI schema is ignored without an error.
//
// See: Recipes/Strategy/ApiMappingReference.js
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.1/front-end-development/freedom-ui/client-schema-freedomui/overview
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/classic-ui/client-schema/references/rules-and-businessrules

// ===== TELLING THE GENERATIONS APART =========================================
//
//   properties.json "SchemaType"          generation / role
//   EditViewModelSchema                   Classic page (also a mini page)
//   GridDetailViewModelSchema             Classic detail
//   ModuleViewModelSchema                 Classic section
//   AngularSchema                         Freedom UI page (form, list, mini page)
//
// In the .js body: `diff: /**SCHEMA_DIFF*/` and `methods` -> Classic;
// `viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/` and `handlers` -> Freedom UI.
// The Freedom UI define() also carries /**SCHEMA_DEPS*/ and /**SCHEMA_ARGS*/
// markers that the designer rewrites; keep them intact.

// ===== SECTION BY SECTION ====================================================
//
// entitySchemaName: "UsrMyEntity"
//   -> modelConfigDiff data source, normally "PDS":
//        { operation: "merge", path: ["dataSources"], values: {
//            PDS: { type: "crt.EntityDataSource", scope: "page",
//                   config: { entitySchemaName: "UsrMyEntity" } } } }
//      A designer-created page already has it.
//
// details: { UsrMyDetail: { schemaName, entitySchemaName, filter } }
//   -> a list element (crt.DataGrid) in viewConfigDiff + its own data source in
//      modelConfigDiff, tied to the master record by "dependencies":
//        { "<Detail>DS": [{ attributePath: "UsrMyEntity", relationPath: "PDS.Id" }] }
//      (Classic filter.detailColumn -> attributePath, masterColumn -> relationPath).
//      No separate detail schema.
//      See: Recipes/Lists/HowToMigrateDetailToList.js
//
// attributes: { X: { dataValueType, type, value, dependencies,
//                    lookupListConfig, isRequired } }
//   -> viewModelConfigDiff "merge" into ["attributes"]:
//        entity column -> { modelConfig: { path: "PDS.X" } }
//        virtual       -> { value: ... }
//        dependencies  -> "change": { request } or attribute-change handler
//        lookupListConfig -> "<attr>_List" attribute / crt.LoadDataRequest
//        isRequired    -> validators: { required: { type: "crt.Required" } }
//      See: Recipes/Attributes/HowToMigrateAttributeDeclaration.js
//
// methods: { init, onEntityInitialized, save, onSaved, asyncValidate,
//            setValidationConfig, destroy, onXClick, ... }
//   -> handlers (array of { request, handler(request, next) }):
//        init / onEntityInitialized -> crt.HandleViewModelInitRequest
//        save / onSaved / asyncValidate -> crt.SaveRecordRequest
//        destroy                -> crt.HandleViewModelPauseRequest
//        button click method    -> custom request "usr.X" named in "clicked"
//        setValidationConfig    -> validators section + attribute validators
//        a method used only to compute a display value -> converters section
//      this.callParent(arguments) -> await next?.handle(request)
//
// messages: { "UsrMessage": { mode, direction } }  (sandbox)
//   -> between a page and its details: nothing - lists are on the same page
//      and read the same $context. Elsewhere: custom requests, page parameters
//      on navigation, or the server channel.
//      See: Recipes/Messaging/HowToMigrateSandboxMessages.js
//
// mixins: { UsrMyMixin: "Terrasoft.UsrMyMixin" }
//   -> no mixin mechanism. Options: a schema of type Module that returns plain
//      functions, listed in SCHEMA_DEPS and called with $context; a custom
//      request handled once (usr.*) and dispatched with executeRequest; a
//      remote module with a global request handler for reuse across pages.
//
// rules / businessRules
//   -> Freedom UI business rules (designer, page or object level), or handlers
//      for conditions the designer cannot express.
//      See: Recipes/Attributes/HowToMigrateBusinessRules.js
//
// diff: [ { operation, name, parentName, propertyName, values } ]
//   -> viewConfigDiff: the same operation/name/parentName/propertyName/index
//      vocabulary, but different element types ("type": "crt.Input" instead
//      of "itemType": Terrasoft.ViewItemType.X), "layoutConfig" instead of
//      "layout", and bindings as "$Attr" strings instead of { bindTo }.
//
// define dependencies ["BusinessRuleModule", "ConfigurationEnums", "css!..."]
//   -> /**SCHEMA_DEPS*/["@creatio-devkit/common", "UsrMyModule"]/**SCHEMA_DEPS*/
//      with matching /**SCHEMA_ARGS*/(sdk, usrMyModule)/**SCHEMA_ARGS*/.

// ===== 8.0 VS 8.1+ SECTION NAMES =============================================
//
//   8.0                                 8.1+
//   viewModelConfig   (object)          viewModelConfigDiff   (array of operations)
//   modelConfig       (object)          modelConfigDiff       (array of operations)
//   viewConfigDiff, handlers, converters, validators - same in both.
// Marker comments: /**SCHEMA_VIEW_MODEL_CONFIG*/ vs /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/.

// ===== SKELETON OF A FREEDOM UI PAGE (8.1+) ==================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
