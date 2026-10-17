// --- How to migrate init and onEntityInitialized to Freedom UI -----------------
// Classic UI splits page start-up into init() (view model exists, record NOT
// loaded: wiring only) and onEntityInitialized() (record loaded: page logic,
// defaults for a new record). Freedom UI has one start-up request,
// crt.HandleViewModelInitRequest, and it fires BEFORE the record data is
// loaded. Record-dependent logic moves to the "finish-load-model-attributes"
// event of request.$context.events$ (reported from 8.1.3; version unverified)
// or to an attribute-change handler.
//
// API MAP
//   init: function() { callParent }         ->  handler "crt.HandleViewModelInitRequest",
//                                               await next?.handle(request) FIRST
//   onEntityInitialized: function() {...}   ->  request.$context.events$.subscribe(evt =>
//                                               evt.type === "finish-load-model-attributes")
//                                               (8.1.3+ observed), guarded by a one-shot flag
//   this.isAddMode() / this.isCopyMode()    ->  await request.$context.getPrimaryModelMode()
//                                               === "create" (value observed; see
//                                               HowToMigrateNewRecordDetection)
//   this.get("UsrDueDate")                  ->  await request.$context.PDS_UsrDueDate_a1b2c3d
//   this.set("UsrDueDate", v)               ->  request.$context.PDS_UsrDueDate_a1b2c3d = v
//   Terrasoft.ServerChannel.on(...) in init ->  crt.HandleViewModelResumeRequest (attach) /
//                                               crt.HandleViewModelPauseRequest (detach)
//   this.callParent(arguments)              ->  await next?.handle(request)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - There is no "record is loaded" hook with a guaranteed contract. A value set
//     in the init handler for a data-source attribute can be OVERWRITTEN when
//     the record or its defaults arrive; a read can return undefined.
//   - "finish-load-model-attributes" is reported from 8.1.3 (observed; the
//     version is unverified). Where it does not fire, the usual route is
//     crt.HandleViewModelAttributeChangeRequest, which also fires while the
//     record loads.
//   - evt.payload holds per-attribute true/false flags, NOT values; only
//     attributes that are on the page appear in it (observed).
//   - The event fires again when a list or detail finishes loading (reported
//     on 8.3.2). Without a one-shot flag the "new record" default re-applies
//     over what the user has typed. Unsubscribing was reported not to stop it.
//   - onEntityInitialized re-ran after reloadEntity(); a Freedom UI view model
//     is initialised once and RESUMED when the user comes back (observed).
//   - Static defaults for a new record are better set as the column default in
//     the entity schema: that works in both UIs and needs no code.
//   - getPrimaryModelMode() is not in the @creatio-devkit/common typings; it
//     appears in community threads; it and its values are observed, not
//     contractual.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   Moving the body of onEntityInitialized into the init handler compiles and
//   runs, but every this.get() becomes an undefined read and every default you
//   write is replaced by the loaded record a moment later. No error appears.
//
// Applies: Creatio 8.1+ ("finish-load-model-attributes" reported from 8.1.3, unverified; getPrimaryModelMode undocumented, in no devkit typings); Classic UI 7.x–8.x
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/front-end-development/freedom-ui/client-schema-freedomui/references/handlers
// Source: https://community.creatio.com/questions/correct-way-unsubscribe-requestcontextevents-crthandleviewmodelinitrequest

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		attributes: {
			"UsrIsReadonlyMode": {
				"dataValueType": Terrasoft.DataValueType.BOOLEAN,
				"type": Terrasoft.ViewModelColumnType.VIRTUAL_COLUMN,
				"value": false
			}
		},
		methods: {

			// Wiring only: the record is not loaded yet.
			init: function() {
				this.callParent(arguments);
				this.set("UsrIsReadonlyMode", false);
			},

			// The record is loaded: page logic and new-record defaults.
			onEntityInitialized: function() {
				this.callParent(arguments);
				if (this.isAddMode() || this.isCopyMode()) {
					if (!this.get("UsrDueDate")) {
						this.set("UsrDueDate", Terrasoft.addDays(new Date(), 7));
					}
				} else {
					var name = this.get("UsrName");
					this.set("UsrIsReadonlyMode", name === "Closed");
				}
			}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/[]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/()/**SCHEMA_ARGS*/ {
	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					"UsrIsReadonlyMode": { "value": false },
					// One-shot guard: the load event fires more than once.
					"UsrIsInitialLoadHandled": { "value": false }
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					// The platform's own initialisation first (was callParent).
					await next?.handle(request);

					// Former init(): record-independent state only.
					request.$context.UsrIsReadonlyMode = false;

					// Former onEntityInitialized(): wait until the record is loaded.
					request.$context.events$.subscribe(async (evt) => {
						if (evt?.type !== "finish-load-model-attributes") {
							return;
						}
						if (await request.$context.UsrIsInitialLoadHandled) {
							return;
						}
						request.$context.UsrIsInitialLoadHandled = true;

						const mode = await request.$context.getPrimaryModelMode();
						if (mode === "create") {
							// payload carries flags, not values: is the field on the page?
							if (evt?.payload?.PDS_UsrDueDate_a1b2c3d &&
								!(await request.$context.PDS_UsrDueDate_a1b2c3d)) {
								const due = new Date();
								due.setDate(due.getDate() + 7);
								request.$context.PDS_UsrDueDate_a1b2c3d = due;
							}
						} else {
							const name = await request.$context.PDS_UsrName_b2c3d4e;
							request.$context.UsrIsReadonlyMode = name === "Closed";
						}
					});
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
