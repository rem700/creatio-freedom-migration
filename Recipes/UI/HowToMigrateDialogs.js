// --- How to migrate Terrasoft.showConfirmation / showInformationDialog to Freedom UI dialogs ---
// Classic UI shows a modal with this.showConfirmationDialog(message, callback,
// buttons) or the global Terrasoft.showConfirmation / Terrasoft.showInformation,
// and receives the pressed button's RETURN CODE ("yes", "no", "ok", "cancel")
// in a CALLBACK. Freedom UI has two routes that both return a PROMISE of the
// clicked action's `key`: the crt.ShowDialogRequest request (config NESTED in
// dialogConfig.data) and sdk.DialogService.open (config FLAT). For a
// non-blocking message use the crt.NotificationRequest toast.
//
// API MAP
//   this.showConfirmationDialog(msg, cb, [YES, NO])
//                                  ->  await request.$context.executeRequest({
//                                          type: "crt.ShowDialogRequest", $context,
//                                          dialogConfig: { data: { message, actions } } })
//   Terrasoft.showConfirmation(msg, cb, buttons, scope)
//                                  ->  await new sdk.DialogService().open({ title?, message, actions })
//   this.showInformationDialog(msg) / Terrasoft.showInformation(msg)
//                                  ->  either route with ONE action ({ key: "OK", ... })
//   Terrasoft.MessageBoxButtons.YES.returnCode ("yes")
//                                  ->  your own action key, e.g. "Yes" (case-sensitive string)
//   custom button { returnCode, caption, style }
//                                  ->  { key, config: { caption, color } }
//   callback(returnCode)           ->  const key = await ...; if (key === "Yes") { ... }
//   button style GREEN / RED / default ->  color "primary" / "warn" / "default"
//                                      (ButtonColor: "primary" | "accent" | "warn" | "default" |
//                                       "outline" | "plain-white" | "outline-white")
//   short "done" message nobody must confirm
//                                  ->  crt.NotificationRequest { message } (toast, 8.0.10+,
//                                      community-documented)
//
// DOES NOT CARRY OVER ONE-TO-ONE
//   - Callback -> await. Classic code AFTER the call ran immediately; in a
//     Freedom handler code after `await` runs only once the user has clicked.
//     Code that relied on "the dialog does not block" must move above the await.
//   - There are no predefined button constants: every button is an action you
//     declare, and the result is that action's `key`, compared as a string.
//   - There is no "danger" or "red" colour; ButtonColor has "warn".
//   - sdk.DialogService first appears in @creatio-devkit/common 0.814.0
//     (absent in 0.811.0); crt.ShowDialogRequest needs no devkit at all.
//   - What the promise resolves to when the user closes the dialog without a
//     button (X / Escape) is not documented: treat anything but your
//     affirmative key as "no".
//   - A message from resources is a promise: `await request.$context.Resources.Strings.X`,
//     or the dialog reads "[object Promise]".
//   - The toast's parameters (message, duration...) come from community testing,
//     not from Academy's request list; verify on your version.
//
// SILENT FAILURE WHEN PORTED MECHANICALLY
//   crt.ShowDialogRequest with `message` and `actions` FLAT on the request (the
//   DialogService shape) opens an EMPTY dialog with no buttons. The typed
//   DialogService.open takes only the flat { title?, message, actions }; do not
//   hand it the nested request shape. Comparing the result with "yes" when the key is "Yes", or with
//   Terrasoft.MessageBoxButtons.YES.returnCode, is always false: the action
//   never runs and nothing is reported.
//
// Source: https://academy.creatio.com/guides/dev/development-on-creatio-platform/platform-customization/freedom-ui/dialog-window/overview
// Source: https://customerfx.com/article/showing-a-message-dialog-or-confirmation-prompts-in-a-creatio-freedom-ui-page/
// Source: https://customerfx.com/article/displaying-toast-message-popups-from-creatio-freedom-ui-pages/
// Source: https://www.npmjs.com/package/@creatio-devkit/common (typings: DialogService, BaseDialogConfig, ButtonColor)

// ===== CLASSIC UI (7.x) =====================================================

define("UsrMyEntity1Page", [], function() {
	return {
		entitySchemaName: "UsrMyEntity",
		methods: {
			// Yes / No question, answer in the callback.
			onDeleteLinesClick: function() {
				this.showConfirmationDialog(
					this.get("Resources.Strings.ConfirmDeleteMessage"),
					function(returnCode) {
						if (returnCode === Terrasoft.MessageBoxButtons.YES.returnCode) {
							this.deleteLines();
						}
					},
					[Terrasoft.MessageBoxButtons.YES.returnCode, Terrasoft.MessageBoxButtons.NO.returnCode],
					this);
				// Runs at once, before the user answers.
			},

			// Global form, custom button.
			askArchive: function() {
				Terrasoft.showConfirmation(
					this.get("Resources.Strings.ArchiveQuestion"),
					function(returnCode) {
						if (returnCode === "archive") {
							this.archiveRecord();
						}
					},
					[
						{
							className: "Terrasoft.Button",
							returnCode: "archive",
							style: Terrasoft.controls.ButtonEnums.style.RED,
							caption: this.get("Resources.Strings.ArchiveButtonCaption")
						},
						Terrasoft.MessageBoxButtons.CANCEL.returnCode
					],
					this);
			},

			// One OK button.
			onSavedInfo: function() {
				this.showInformationDialog(this.get("Resources.Strings.SavedMessage"));
			},

			deleteLines: function() {},
			archiveRecord: function() {}
		},
		diff: /**SCHEMA_DIFF*/[]/**SCHEMA_DIFF*/
	};
});

// ===== FREEDOM UI (8.1+) ====================================================

define("UsrMyPage_FormPage", /**SCHEMA_DEPS*/["@creatio-devkit/common"]/**SCHEMA_DEPS*/, function/**SCHEMA_ARGS*/(sdk)/**SCHEMA_ARGS*/ {

	const ActionYes = "Yes";
	const ActionNo = "No";
	const ActionArchive = "Archive";
	const ActionCancel = "Cancel";

	return {
		viewConfigDiff: /**SCHEMA_VIEW_CONFIG_DIFF*/[]/**SCHEMA_VIEW_CONFIG_DIFF*/,
		viewModelConfigDiff: /**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/[]/**SCHEMA_VIEW_MODEL_CONFIG_DIFF*/,
		modelConfigDiff: /**SCHEMA_MODEL_CONFIG_DIFF*/[]/**SCHEMA_MODEL_CONFIG_DIFF*/,
		handlers: /**SCHEMA_HANDLERS*/[
			{
				// Route 1: crt.ShowDialogRequest - config NESTED in dialogConfig.data.
				request: "usr.DeleteLinesRequest",
				handler: async (request, next) => {
					const key = await request.$context.executeRequest({
						type: "crt.ShowDialogRequest",
						$context: request.$context,
						dialogConfig: {
							data: {
								message: await request.$context.Resources.Strings.ConfirmDeleteMessage,
								actions: [
									{ key: ActionYes, config: { color: "primary", caption: "Yes" } },
									{ key: ActionNo, config: { color: "default", caption: "No" } }
								]
							}
						}
					});
					if (key === ActionYes) {
						await request.$context.executeRequest({
							type: "usr.DeleteLinesConfirmedRequest",
							$context: request.$context
						});
					}
					return next?.handle(request);
				}
			},
			{
				// Route 2: sdk.DialogService - config FLAT, optional title.
				request: "usr.ArchiveRequest",
				handler: async (request, next) => {
					const dialogService = new sdk.DialogService();
					const key = await dialogService.open({
						title: await request.$context.Resources.Strings.ArchiveTitle,
						message: await request.$context.Resources.Strings.ArchiveQuestion,
						actions: [
							{ key: ActionArchive, config: { color: "warn", caption: "Archive" } },
							{ key: ActionCancel, config: { color: "default", caption: "Cancel" } }
						]
					});
					// X / Escape: result undocumented - only the explicit key proceeds.
					if (key !== ActionArchive) {
						return next?.handle(request);
					}
					request.$context.PDS_UsrIsArchived_e5f6a7b = true;
					return next?.handle(request);
				}
			},
			{
				// showInformationDialog -> a toast when nobody has to confirm it.
				request: "usr.SavedInfoRequest",
				handler: async (request, next) => {
					// Not awaited on purpose: the handler goes on while the toast shows.
					request.$context.executeRequest({
						type: "crt.NotificationRequest",
						$context: request.$context,
						message: await request.$context.Resources.Strings.SavedMessage
					});
					return next?.handle(request);
				}
			}
		]/**SCHEMA_HANDLERS*/,
		converters: /**SCHEMA_CONVERTERS*/{}/**SCHEMA_CONVERTERS*/,
		validators: /**SCHEMA_VALIDATORS*/{}/**SCHEMA_VALIDATORS*/
	};
});
