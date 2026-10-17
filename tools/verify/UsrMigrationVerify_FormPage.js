// UsrMigrationVerify_FormPage - TEST / DEV INSTANCES ONLY.
//
// Logs to the browser console what the platform ACTUALLY does for the claims the
// recipes mark "(observed)". Every line has the form
//   [verify #N] <claim> -> <result>
// where N is the claim number in tools/verify/README.md.
//
// Never install this on production: it adds handlers to a record page, writes
// test values into page attributes, and exposes window.UsrMigrationVerify.
//
// Before use, replace the placeholders marked CONFIGURE (see README.md).
define("UsrMigrationVerify_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {
	// ----- CONFIGURE ---------------------------------------------------------
	// Primary data source of the page (designer pages use "PDS").
	const PRIMARY_DS = "PDS";
	// Lookup attribute of a lookup FIELD on this page (without "_List").
	// Also replace "PDS_UsrVerifyLookup_List" in viewModelConfigDiff below.
	const LOOKUP_ATTR = "PDS_UsrVerifyLookup";
	// Collection attribute of a LIST on this page (the grid's "items" without "$").
	const LIST_ATTR = "GridDetail_xxx";
	// A TEXT field attribute of this page, used only by the manual dirty() check.
	const DIRTY_ATTR = "PDS_UsrVerifyText";
	// Any entity with an "Owner" lookup and readable rows (Contact exists in every product).
	const QUERY_ENTITY = "Contact";
	// ------------------------------------------------------------------------

	// Invented id that matches no record.
	const NO_MATCH_ID = "7e3a0c55-9b1d-4f2a-8c6e-0a1b2c3d4e5f";
	const ACTION_OK = "UsrVerifyOk";
	const ACTION_CANCEL = "UsrVerifyCancel";

	const V = window.UsrMigrationVerify = window.UsrMigrationVerify || {
		initCount: 0, resumeCount: 0, pauseCount: 0, destroyCount: 0, subs: []
	};

	function fmt(value) {
		if (value === undefined) {
			return "undefined";
		}
		try {
			const text = JSON.stringify(value);
			return text && text.length > 300 ? text.slice(0, 300) + "..." : String(text);
		} catch (e) {
			return "[" + typeof value + "]";
		}
	}

	function log(n, claim, result) {
		console.log("[verify #" + n + "] " + claim + " -> " + (typeof result === "string" ? result : fmt(result)));
	}

	function since() {
		return Math.round(performance.now() - (V.t0 || 0)) + " ms after init";
	}

	async function readMode(ctx) {
		const fn = ctx.getPrimaryModelMode;
		if (typeof fn !== "function") {
			return "(getPrimaryModelMode is " + typeof fn + ")";
		}
		try {
			return await ctx.getPrimaryModelMode();
		} catch (e) {
			return "(threw " + e.message + ")";
		}
	}

	async function checkAfterLoad(ctx, where) {
		// #2: a column without a declared attribute is not loaded.
		const bareModifiedOn = await ctx.ModifiedOn;
		const declaredCreatedOn = await ctx.UsrVerifyCreatedOn;
		log(2, "column read in code without a declared attribute is not loaded (" + where + ")",
			"ModifiedOn (undeclared) = " + fmt(bareModifiedOn) +
			"; UsrVerifyCreatedOn (declared, path " + PRIMARY_DS + ".CreatedOn) = " + fmt(declaredCreatedOn));
		// #3: Classic keys inside a Freedom attribute are ignored, no error.
		log(3, "Classic keys (dataValueType, type) in a Freedom attribute are ignored without an error (" + where + ")",
			"UsrVerifyClassicKeys = " + fmt(await ctx.UsrVerifyClassicKeys) + " (expected \"x\"; page opened = no error)");
		// #27: what $Id / Id resolves to on the page.
		log(27, "\"$Id\" resolves to the page record id (" + where + ")",
			"$context.Id = " + fmt(await ctx.Id) + "; compare with the record id in the URL");
	}

	async function dataChecks() {
		try {
			const model = await sdk.Model.create(QUERY_ENTITY);
			const page = { pagingConfig: { rowCount: 5, rowsOffset: 0 } };
			// #12: an empty FilterGroup means "no filter" (load only - no update/delete here).
			const noFilter = await model.load({ attributes: ["Id"], options: page });
			const empty = await model.load({
				attributes: ["Id"],
				parameters: [{ type: sdk.ModelParameterType.Filter, value: new sdk.FilterGroup() }],
				options: page
			});
			const noMatch = new sdk.FilterGroup();
			noMatch.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "Id", NO_MATCH_ID);
			const filtered = await model.load({
				attributes: ["Id"],
				parameters: [{ type: sdk.ModelParameterType.Filter, value: noMatch }],
				options: page
			});
			log(12, "an EMPTY sdk.FilterGroup in a load means \"no filter\" (load used as a safe proxy for update/delete)",
				"rows without filter = " + noFilter.length + ", with empty group = " + empty.length +
				", with a non-matching filter = " + filtered.length);
			// #13: a plain dotted attribute comes back under the dotted key.
			const dotted = await model.load({ attributes: ["Id", "Owner.Name"], options: page });
			const aliased = await model.load({ attributes: ["Id", { name: "UsrOwnerName", path: "Owner.Name" }], options: page });
			log(13, "attribute \"Owner.Name\" (plain string) comes back under the dotted key, not an alias",
				"keys plain = " + fmt(dotted[0] ? Object.keys(dotted[0]) : "(no rows)") +
				"; keys { name, path } = " + fmt(aliased[0] ? Object.keys(aliased[0]) : "(no rows)"));
		} catch (e) {
			log(12, "data checks", "FAILED: " + e.message + " (set QUERY_ENTITY; on devkit < 0.813.0 `options` is `loadOptions`)");
		}
		try {
			// #33: an unknown feature code reads as disabled.
			const state = await new sdk.FeatureService().getFeatureState("UsrMigrationVerifyNoSuchFeature");
			log(33, "an unknown feature code reads as disabled", fmt(state));
		} catch (e) {
			log(33, "an unknown feature code reads as disabled", "THREW " + e.message);
		}
		try {
			// #44: platform version and devkit services available at runtime.
			const sysValues = await new sdk.SysValuesService().loadSysValues();
			const services = ["DialogService", "MessageChannelService", "ProcessEngineService",
				"TransactionFactoryService", "SchemaModalService", "FeatureService", "RightsService"];
			log(44, "platform version and devkit services present on this instance",
				"coreVersion = " + fmt(sysValues.coreVersion) + "; " +
				services.map((s) => s + "=" + (typeof sdk[s] === "function")).join(", "));
		} catch (e) {
			log(44, "platform version and devkit services", "FAILED: " + e.message);
		}
	}

	function setLookupFilter(ctx, mode) {
		// #5: filter attribute value as sdk.FilterGroup vs filter.toJson().
		const filter = new sdk.FilterGroup();
		filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "Id", NO_MATCH_ID);
		if (mode === "none") {
			ctx.UsrVerifyLookupFilter = null;
		} else if (mode === "json") {
			ctx.UsrVerifyLookupFilter = typeof filter.toJson === "function" ? filter.toJson() : "(no toJson)";
		} else {
			ctx.UsrVerifyLookupFilter = filter;
		}
		log(5, "a filter attribute holding an sdk.FilterGroup filters the lookup (else use toJson())",
			"mode \"" + mode + "\" assigned; open the " + LOOKUP_ATTR + " dropdown: EMPTY list = filter applied, full list = ignored");
	}

	async function dialogCheck(ctx) {
		// #43: what crt.ShowDialogRequest resolves to on Escape / X.
		const key = await ctx.executeRequest({
			type: "crt.ShowDialogRequest",
			$context: ctx,
			dialogConfig: {
				data: {
					message: "verify #43: close this dialog with ESCAPE (then repeat with X, then with OK)",
					actions: [
						{ key: ACTION_OK, config: { color: "primary", caption: "OK" } },
						{ key: ACTION_CANCEL, config: { color: "default", caption: "Cancel" } }
					]
				}
			}
		});
		log(43, "crt.ShowDialogRequest result when closed without a button (Escape / X)",
			"resolved to " + fmt(key) + " (typeof " + typeof key + ")");
		if (typeof sdk.DialogService === "function") {
			const key2 = await new sdk.DialogService().open({
				message: "verify #43 (DialogService): close with ESCAPE",
				actions: [{ key: ACTION_OK, config: { color: "primary", caption: "OK" } }]
			});
			log(43, "sdk.DialogService.open result when closed without a button",
				"resolved to " + fmt(key2) + " (typeof " + typeof key2 + ")");
		}
	}

	// Manual checks, run from the browser console on the open page.
	V.lookupFilter = (mode) => setLookupFilter(V.ctx, mode || "group");
	V.dialog = () => dialogCheck(V.ctx);
	V.selection = async () => {
		// #36: SelectionState shape of a list.
		log(36, "list SelectionState shape { type: \"specific\", selected } | { type: \"all\", unselected }",
			fmt(await V.ctx[LIST_ATTR + "_SelectionState"]));
	};
	V.dirty = async () => {
		// #8: assigning a data-source attribute marks the page dirty. DO NOT SAVE afterwards.
		const ctx = V.ctx;
		const before = await ctx.HasUnsavedData;
		const original = await ctx[DIRTY_ATTR];
		ctx[DIRTY_ATTR] = (original || "") + " verify";
		const after = await ctx.HasUnsavedData;
		ctx[DIRTY_ATTR] = original;
		log(8, "assigning a data-source attribute marks the page dirty (HasUnsavedData)",
			"before = " + fmt(before) + ", after assign = " + fmt(after) +
			" (value restored; close the page WITHOUT saving)");
	};
	V.csrf = async () => {
		// #15: HttpClientService adds the CSRF header. Harmless POST to a missing service.
		try {
			const response = await new sdk.HttpClientService().post("/rest/UsrMigrationVerifyNoSuchService/Ping", {});
			log(15, "HttpClientService adds the BPMCSRF header",
				"status " + fmt(response && response.status) + "; check the request headers in DevTools > Network");
		} catch (e) {
			log(15, "HttpClientService adds the BPMCSRF header",
				"rejected: " + e.message + "; check the request headers in DevTools > Network");
		}
	};

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				// #41: "ActionButtonsContainer" exists in the stock form page.
				"operation": "insert",
				"name": "UsrVerifyDialogButton",
				"values": {
					"type": "crt.Button",
					"caption": "Verify #43: dialog",
					"color": "default",
					"clicked": { "request": "usr.VerifyDialogRequest" }
				},
				"parentName": "ActionButtonsContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// CONFIGURE: an existing container of the page (field area).
				"operation": "insert",
				"name": "UsrVerifyPanel",
				"values": {
					"type": "crt.FlexContainer",
					"direction": "column",
					"items": []
				},
				"parentName": "SideAreaProfileContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				// #26: bound with "value" (not "control").
				"operation": "insert",
				"name": "UsrVerifyValueInput",
				"values": {
					"type": "crt.Input",
					"label": "verify #26: value-bound (type 123)",
					"value": "$UsrVerifyValueBound"
				},
				"parentName": "UsrVerifyPanel",
				"propertyName": "items",
				"index": 0
			},
			{
				// #26: bound with "control".
				"operation": "insert",
				"name": "UsrVerifyControlInput",
				"values": {
					"type": "crt.Input",
					"label": "verify #26: control-bound (type 123)",
					"control": "$UsrVerifyControlBound"
				},
				"parentName": "UsrVerifyPanel",
				"propertyName": "items",
				"index": 1
			},
			{
				// #7: Classic keys "enabled" / "isRequired" on a Freedom element.
				"operation": "insert",
				"name": "UsrVerifyEnabledKeyInput",
				"values": {
					"type": "crt.Input",
					"label": "verify #7: enabled false + isRequired (editable? asterisk?)",
					"control": "$UsrVerifyEnabledKey",
					"enabled": false,
					"isRequired": true
				},
				"parentName": "UsrVerifyPanel",
				"propertyName": "items",
				"index": 2
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[
			{
				"operation": "merge",
				"path": ["attributes"],
				"values": {
					// #2: declared column attribute (compare with undeclared ModifiedOn).
					"UsrVerifyCreatedOn": {
						"modelConfig": { "path": "PDS.CreatedOn" }
					},
					// #3: Classic keys inside a Freedom attribute.
					"UsrVerifyClassicKeys": {
						"value": "x",
						"dataValueType": 1,
						"type": "VIRTUAL_COLUMN"
					},
					// #4: the "change" key runs a named request.
					"UsrVerifyChangeKey": {
						"value": "",
						"change": { "request": "usr.VerifyChangeKeyRequest" }
					},
					// #5: filter attribute for the lookup below.
					"UsrVerifyLookupFilter": {
						"value": null
					},
					// CONFIGURE: "<lookup attribute>_List" of a lookup field on this page.
					"PDS_UsrVerifyLookup_List": {
						"modelConfig": {
							"filterAttributes": [
								{ "name": "UsrVerifyLookupFilter", "loadOnChange": true }
							]
						}
					},
					// #26: same validator on a "value"-bound and a "control"-bound input.
					"UsrVerifyValueBound": {
						"value": "",
						"validators": {
							"NoDigits": { "type": "usr.VerifyNoDigits", "params": { "label": "value-bound" } }
						}
					},
					"UsrVerifyControlBound": {
						"value": "",
						"validators": {
							"NoDigits": { "type": "usr.VerifyNoDigits", "params": { "label": "control-bound" } }
						}
					},
					// #7
					"UsrVerifyEnabledKey": {
						"value": ""
					}
				}
			}
		]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "crt.HandleViewModelInitRequest",
				handler: async (request, next) => {
					const ctx = request.$context;
					V.t0 = performance.now();
					V.initCount++;
					V.ctx = ctx;
					// #23: getPrimaryModelMode exists at runtime (it is in no devkit typings).
					log(23, "getPrimaryModelMode() exists on $context although not in the typings",
						"typeof = " + typeof ctx.getPrimaryModelMode);
					await next?.handle(request);

					// #22: view model initialised once, RESUMED on return.
					log(22, "a view model is initialised once and resumed when the user comes back",
						"initCount = " + V.initCount + ", resumeCount = " + V.resumeCount);
					// #20: mode values.
					log(20, "getPrimaryModelMode() is \"create\" for a new record, \"update\" for an existing one (at init)",
						fmt(await readMode(ctx)));
					// #6: HasUnsavedData right after init.
					log(6, "HasUnsavedData can turn true during load (at init)", fmt(await ctx.HasUnsavedData));

					// #19 / #21: events$ and finish-load-model-attributes.
					let finishCount = 0;
					let changeKeyDone = false;
					if (ctx.events$ && typeof ctx.events$.subscribe === "function") {
						const sub = ctx.events$.subscribe(async (evt) => {
							const type = evt && evt.type;
							log(19, "events$ emits \"finish-load-model-attributes\" (8.1.3+ reported)",
								"event \"" + type + "\" " + since());
							if (type !== "finish-load-model-attributes") {
								return;
							}
							finishCount++;
							const payload = evt.payload || {};
							const keys = Object.keys(payload);
							log(21, "finish-load payload holds per-attribute true/false flags, only attributes on the page",
								"#" + finishCount + ": " + keys.length + " keys; sample " +
								fmt(keys.slice(0, 8).reduce((o, k) => { o[k] = payload[k]; return o; }, {})));
							log(20, "getPrimaryModelMode() at finish-load #" + finishCount, fmt(await readMode(ctx)));
							log(6, "HasUnsavedData at finish-load #" + finishCount, fmt(await ctx.HasUnsavedData));
							if (finishCount === 1) {
								await checkAfterLoad(ctx, "finish-load #1");
							}
							if (!changeKeyDone) {
								changeKeyDone = true;
								// #4: trigger the "change" key once.
								ctx.UsrVerifyChangeKey = "changed " + since();
							}
						});
						V.subs.push(sub);
					} else {
						log(19, "events$ exists on $context", "NO (typeof " + typeof ctx.events$ + ")");
					}
					setTimeout(async () => {
						log(19, "finish-load-model-attributes fired within 3 s", finishCount > 0 ? "yes, " + finishCount + " time(s)" : "NO");
						log(6, "HasUnsavedData 3 s after init (nobody typed)", fmt(await ctx.HasUnsavedData));
						if (finishCount === 0) {
							await checkAfterLoad(ctx, "timer 3 s");
						}
						if (!changeKeyDone) {
							changeKeyDone = true;
							ctx.UsrVerifyChangeKey = "changed " + since();
						}
					}, 3000);

					setLookupFilter(ctx, "group");
					dataChecks();
					console.log("[verify] manual checks: UsrMigrationVerify.dialog(), .lookupFilter(\"group\"|\"json\"|\"none\"), " +
						".selection(), .dirty(), .csrf() - see tools/verify/README.md");
				}
			},
			{
				request: "crt.HandleViewModelResumeRequest",
				handler: async (request, next) => {
					V.resumeCount++;
					log(18, "Resume fires on every visit (attach here)",
						"resumeCount = " + V.resumeCount + ", initCount = " + V.initCount);
					return next?.handle(request);
				}
			},
			{
				request: "crt.HandleViewModelPauseRequest",
				handler: async (request, next) => {
					V.pauseCount++;
					log(18, "Pause fires when the user navigates away (release here)",
						"pauseCount = " + V.pauseCount + ", destroyCount = " + V.destroyCount);
					return next?.handle(request);
				}
			},
			{
				request: "crt.HandleViewModelDestroyRequest",
				// Synchronous on purpose: Academy allows only synchronous code here.
				handler: (request, next) => {
					V.destroyCount++;
					log(18, "Destroy does NOT fire on ordinary navigation (only when the view model is released)",
						"Destroy fired: destroyCount = " + V.destroyCount + ", pauseCount = " + V.pauseCount);
					V.subs.forEach((s) => s && s.unsubscribe && s.unsubscribe());
					V.subs = [];
					return next?.handle(request);
				}
			},
			{
				request: "crt.LoadDataRequest",
				handler: async (request, next) => {
					// #42: data source names; #28: is the list reloaded after a row page closes?
					log(42, "data source names (<lookup attr>_List_DS, list DS, PDS) seen by crt.LoadDataRequest",
						"dataSourceName = " + fmt(request.dataSourceName) +
						", loadType = " + fmt(request.config && request.config.loadType) +
						", parameters = " + ((request.parameters || []).length) + ", " + since());
					if (request.dataSourceName === LOOKUP_ATTR + "_List_DS") {
						log(42, "lookup list data source matches LOOKUP_ATTR + \"_List_DS\"", "yes");
					}
					return next?.handle(request);
				}
			},
			{
				request: "usr.VerifyChangeKeyRequest",
				handler: async (request, next) => {
					log(4, "the \"change\" key request carries no value; read the attribute with await",
						"request keys = " + fmt(Object.keys(request)) +
						"; request.value = " + fmt(request.value) +
						"; await $context.UsrVerifyChangeKey = " + fmt(await request.$context.UsrVerifyChangeKey));
					return next?.handle(request);
				}
			},
			{
				request: "crt.HandleViewModelAttributeChangeRequest",
				handler: async (request, next) => {
					const name = request.attributeName;
					if (name === "HasUnsavedData") {
						log(6, "HasUnsavedData changed", fmt(request.oldValue) + " => " + fmt(request.value) + ", " + since());
					} else if (name === "UsrVerifyValueBound" || name === "UsrVerifyControlBound") {
						log(26, "an input bound with \"value\" does not write edits back; \"control\" does",
							name + " received " + fmt(request.value));
					} else if (name === "UsrVerifyEnabledKey") {
						log(7, "\"enabled\": false / \"isRequired\" in viewConfigDiff are ignored",
							"field accepted input " + fmt(request.value) + " => \"enabled\": false was ignored");
					}
					return next?.handle(request);
				}
			},
			{
				request: "crt.SaveRecordRequest",
				handler: async (request, next) => {
					const ctx = request.$context;
					const modeBefore = await readMode(ctx);
					const result = await next?.handle(request);
					// #17: a failed validator makes next resolve falsy.
					log(17, "a failed field validator makes `await next.handle()` resolve falsy",
						"result = " + fmt(result) + " (typeof " + typeof result + ")");
					// #24: mode becomes "update" after the first successful save.
					log(24, "after the first save of a new record the mode becomes \"update\"",
						"before = " + fmt(modeBefore) + ", after = " + fmt(await readMode(ctx)));
					return result;
				}
			},
			{
				request: "usr.VerifyDialogRequest",
				handler: async (request, next) => {
					await dialogCheck(request.$context);
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{
			"usr.VerifyNoDigits": {
				"validator": function(config) {
					return function(control) {
						const value = control.value;
						log(26, "the validator runs only for the \"control\"-bound input",
							"usr.VerifyNoDigits called for " + config.label + " with " + fmt(value));
						if (value && /\d/.test(value)) {
							return { "usr.VerifyNoDigits": { message: "verify: digits are not allowed" } };
						}
						return null;
					};
				},
				"params": [
					{ "name": "label" }
				],
				"async": false
			}
		}/**SCHEMA_VALIDATORS*/
	};
});
