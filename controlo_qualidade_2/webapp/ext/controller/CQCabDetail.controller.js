sap.ui.define(['sap/ui/core/mvc/ControllerExtension',
	"sap/m/MessageToast",
	"sap/m/Dialog",
	"sap/ui/core/Fragment"
], function (ControllerExtension, MessageToast, Dialog, Fragment) {
	'use strict';

	return ControllerExtension.extend('controloqualidade2.ext.controller.CQCabDetail', {
		// this section allows to extend lifecycle hooks or hooks provided by Fiori elements
		override: {
			/**
			 * Called when a controller is instantiated and its View controls (if available) are already created.
			 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
			 * @memberOf controloqualidade2.ext.controller.CQCabDetail
			 */
			onInit: function () {
				// you can access the Fiori elements extensionAPI via this.base.getExtensionAPI
				var oModel = this.base.getExtensionAPI().getModel();
			}
		},

		descodificaCaixaDialog: async function () {
			if (!this.descodificaCBDialog) {
				this.descodificaCBDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "controloqualidade2.ext.fragment.descodificaCaixa",
					controller: this
				});
				this.getView().addDependent(this.descodificaCBDialog);
			} else {

			};
			this.descodificaCBDialog.open();
		},

		onPressCloseDialog: function (oEvent) {
			this.descodificaCBDialog.close();
			this.getView().getBindingContext().refresh();
		},

		onPressDescodifica: async function (oEvent) {
			var oAction = this.getView().byId("descodificaCBDialog").getObjectBinding();
			const oList = this.getView().byId("descodificaCBList");
			oList.setBusy(true);
			await new Promise(resolve => setTimeout(resolve, 0));
			oAction.execute().then(function () {
				this.getView().getBindingContext().refresh();
				MessageToast.show("Etiqueta lida!");
				oList.setBusy(false);
			}.bind(this)).catch((err) => {
				oList.setBusy(false);
			});
		},

		descodificaUnidadeDialog: async function () {
			if (!this.descodificaUNDialog) {
				this.descodificaUNDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "controloqualidade2.ext.fragment.descodificaUnidade",
					controller: this
				});
				this.getView().addDependent(this.descodificaUNDialog);
			} else {

			};
			this.descodificaUNDialog.open();
		},

		onPressUnCloseDialog: function (oEvent) {
			this.descodificaUNDialog.close();
			this.getView().getBindingContext().refresh;
		},

		onPressDescodificaUN: async function (oEvent) {
			var oAction = this.getView().byId("descodificaUnidadeDialog").getObjectBinding();
			const oList = this.getView().byId("descodificaUnidadeList");
			oList.setBusy(true);
			await new Promise(resolve => setTimeout(resolve, 0));
			oAction.execute().then(function () {
				this.getView().getBindingContext().refresh();
				MessageToast.show("Etiqueta lida!");
				oList.setBusy(false);
			}.bind(this)).catch((err) => {
				oList.setBusy(false);
			});
		}
	});
});
