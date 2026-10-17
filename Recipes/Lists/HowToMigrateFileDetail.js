// --- How to migrate the file detail (FileDetailV2, attachments) to Freedom UI ---
// Classic UI shows attachments with the stock FileDetailV2 detail, usually
// keyed "Files" in the page's `details` and bound to the file entity
// <Entity>File (UsrMyEntityFile, link column UsrMyEntity). Files dropped on it
// are uploaded by the detail; code that uploads a generated file posts to
// FileApiService/UploadFile and calls updateDetail({ detail: "Files" }).
// Freedom UI shows attachments with the Attachments component (crt.FileList),
// added in the designer together with its collection attribute and data
// source. Its own toolbar uploads, downloads and deletes; a custom button
// triggers crt.UploadFileRequest { viewElementName: "<FileList name>" }.
//
// API MAP
//   details.Files { schemaName: "FileDetailV2", entitySchemaName: "UsrMyEntityFile" }
//                                            ->  crt.FileList element + designer-generated data source
//   diff insert itemType DETAIL name "Files" ->  viewConfigDiff insert "type": "crt.FileList"
//   remove inherited "Files" detail          ->  remove the crt.FileList element by its name
//   detail "add file" button / drag and drop ->  built into crt.FileList
//   custom "upload" button                   ->  "clicked": { "request": "crt.UploadFileRequest",
//                                                    "params": { "viewElementName": "FileList_9ko9jdd" } }
//   fetch("../rest/FileApiService/UploadFile?...") with BPMCSRF header
//                                            ->  same endpoint via sdk.HttpClientService.post
//                                                (no dedicated upload API in the devkit typings)
//   updateDetail({ detail: "Files" })        ->  crt.LoadDataRequest for the file list's data source
//   ESQ count on UsrMyEntityFile             ->  sdk.Model.load on the entity the list really uses
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - WHERE FILES LIVE. Academy: custom apps use the generic "Uploaded file"
//     object (SysFile, columns RecordSchemaName + RecordId) automatically;
//     objects that came from Classic are observed to keep their <Entity>File
//     table - check your object. Check which one the Freedom list is bound to
//     before porting any query or upload: they are different tables.
//   - The data source the designer generates for crt.FileList is version
//     specific; copy what it emits instead of writing it by hand.
//   - The record must be saved before a file can be attached, in both
//     generations. In Freedom test getPrimaryModelMode() === "create", not an
//     empty Id.
//   - HttpClientService.post with a Blob body and the CSRF header added for
//     you is observed, not documented; the endpoint parameters are the same
//     as Classic's.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   viewElementName that does not match the crt.FileList `name` exactly: the
//   button does nothing and no error appears. A "has attachments?" check ported
//   from Classic that queries UsrMyEntityFile while the Freedom list stores into
//   SysFile always finds zero files (or old Classic files only).
//
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/8.3/back-end-development/api-for-file-management/entity-file-api
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/back-end-development/api-for-file-management/file-api/references/endpoints
// Source: https://academy.creatio.com/guides/creatio-apps/creatio-basics/freedomUI/attachments-and-notes

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		details: /**SCHEMA_DETAILS*/{
			"Files": {
				"schemaName": "FileDetailV2",
				"entitySchemaName": "UsrMyEntityFile",
				"filter": {
					"detailColumn": "UsrMyEntity",
					"masterColumn": "Id"
				}
			}
		}/**SCHEMA_DETAILS*/,
		methods: {
			// "Submit" only with at least one attachment.
			onSubmitClick: function() {
				var esq = Ext.create("Terrasoft.EntitySchemaQuery", { rootSchemaName: "UsrMyEntityFile" });
				esq.addColumn("Id");
				esq.filters.addItem(esq.createColumnFilterWithParameter(
					Terrasoft.ComparisonType.EQUAL, "UsrMyEntity", this.get("Id")));
				esq.getEntityCollection(function(result) {
					if (!result.success || !result.collection.getCount()) {
						this.showInformationDialog(this.get("Resources.Strings.NoFilesAttachedMessage"));
						return;
					}
					this.set("UsrIsSubmitted", true);
					this.save();
				}, this);
			}
		},
		diff: /**SCHEMA_DIFF*/[
			{
				"operation": "insert",
				"name": "Files",
				"values": { "itemType": Terrasoft.ViewItemType.DETAIL },
				"parentName": "UsrAttachmentsTab",
				"propertyName": "items",
				"index": 0
			}
		]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	// Set to what the designer bound the crt.FileList to (see header).
	const FileEntityName = "SysFile";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[
			{
				"operation": "insert",
				"name": "FileList_9ko9jdd",
				"values": {
					"type": "crt.FileList",
					"items": "$FileList_9ko9jdd",
					"visible": true,
					"fitContent": true
				},
				"parentName": "UsrAttachmentsTabContainer",
				"propertyName": "items",
				"index": 0
			},
			{
				"operation": "insert",
				"name": "UsrUploadFileButton",
				"values": {
					"type": "crt.Button",
					"caption": "#ResourceString(UsrUploadFileButton_caption)#",
					"iconPosition": "only-text",
					"clicked": {
						"request": "crt.UploadFileRequest",
						// Must equal the crt.FileList name above.
						"params": { "viewElementName": "FileList_9ko9jdd" }
					}
				},
				"parentName": "UsrAttachmentsTabContainer",
				"propertyName": "items",
				"index": 1
			}
		]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				request: "usr.SubmitRequest",
				handler: async (request, next) => {
					const recordId = await request.$context.PDS_Id_a1b2c3d;
					const filter = new sdk.FilterGroup();
					if (FileEntityName === "SysFile") {
						filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "RecordId", recordId);
						filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "RecordSchemaName", "UsrMyEntity");
					} else {
						filter.addSchemaColumnFilterWithParameter(sdk.ComparisonType.Equal, "UsrMyEntity", recordId);
					}
					const files = await (await sdk.Model.create(FileEntityName)).load({
						attributes: ["Id"],
						parameters: [{ type: sdk.ModelParameterType.Filter, value: filter }]
					});
					if (!files.length) {
						await request.$context.executeRequest({
							type: "crt.ShowDialogRequest",
							$context: request.$context,
							dialogConfig: {
								data: {
									message: await request.$context.Resources.Strings.NoFilesAttachedMessage,
									actions: [{ key: "OK", config: { color: "primary", caption: "OK" } }]
								}
							}
						});
						return;
					}
					request.$context.PDS_UsrIsSubmitted_c3d4e5f = true;
					await request.$context.executeRequest({
						type: "crt.SaveRecordRequest",
						$context: request.$context,
						preventCardClose: true
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
