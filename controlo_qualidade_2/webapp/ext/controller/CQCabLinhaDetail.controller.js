
sap.ui.define(['sap/ui/core/mvc/ControllerExtension',
	"sap/m/MessageToast",
	"sap/m/Dialog",
	"sap/ui/core/Fragment",
	'sap/ui/model/json/JSONModel'
], function (ControllerExtension, MessageToast, Dialog, Fragment, JSONModel) {
	'use strict';

	return ControllerExtension.extend('controloqualidade2.ext.controller.CQCabLinhaDetail', {
		// this section allows to extend lifecycle hooks or hooks provided by Fiori elements
		override: {
			/**
			 * Called when a controller is instantiated and its View controls (if available) are already created.
			 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
			 * @memberOf controloqualidade2.ext.controller.CQCabLinhaDetail
			 */
			onInit: function () {
				// you can access the Fiori elements extensionAPI via this.base.getExtensionAPI
				var oModel = this.base.getExtensionAPI().getModel();
				var oPesosModel = new JSONModel({
					"PesosCollection": []
				})
				this.getView().setModel(oPesosModel, "pesoUn");
				this._iTimer = null; //Timer para Pesos	
			}
		},
		//-------------------------------Hooks para encontrar o id da tabela pesos un
		//findAggregatedObjects => https://ui5.sap.com/1.120.23/#/api/sap.ui.base.ManagedObject%23methods/findAggregatedObjects
		_findPesosUnTable: function (oPath) {
			const oView = this.base.getView();
			const aControls = oView.findAggregatedObjects(true, function (oControl) {
				const oBinding = oControl.getBinding && oControl.getBinding("items");
				if (!oBinding || !oBinding.getPath()) {
					return false;
				}
				return oBinding.getPath() === oPath;
			});
			return aControls.find(function (oControl) {
				return oControl.getBinding && oControl.getBinding("items");
			}) || null;
		},

		//.------------------------------Fim Hooks ----------------------------------

		balancaPesoUn: async function (oEvent) {
			this.tableContext = this.getView().getBindingContext();
			this._oPesosUnTable = this._findPesosUnTable("_PesosUn");
			if (this._oPesosUnTable) {
				this._oPesosUnBinding = this._oPesosUnTable.getBinding("items");
			}
			// console.log(this._oPesosUnBinding);

			if (!this.balancaDialog) {
				this.balancaDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "controloqualidade2.ext.fragment.BalancaUnPeso",
					controller: this
				});
				this.getView().addDependent(this.balancaDialog);
			}
			this.balancaDialog.open();
		},

		onPressCloseDialog: function (oEvent) {
			this.balancaDialog.close();
		},

		onPressOkayDialog: async function (oEvent) {
			var oModel = this.getView().getModel("pesoUn");
			await this.createPesosUnFromDialog();

			// await Promise.resolve();
			oModel.setProperty("/PesosCollection", []);
			this.balancaDialog.close();
		},

		createPesosUnFromDialog: function () {
			var oModel = this.getView().getModel("pesoUn"),
				oData = oModel.getProperty("/PesosCollection") || [],
				oModelV4 = this.tableContext.getModel(),
				oPesosUn = this._oPesosUnBinding; // oModelV4.bindList("_PesosUn", this.tableContext);

			// Passa pesos da balança para o json
			if (oData.length > 0) {
				oData.forEach(element => {
					console.log(element);
					oPesosUn.create({ Pb: element.PB, Uom: "G" }).created();
				});
			};
		},

		onPressUnStart: function (oEvent) {
			this.getView().byId("unPesoEnd").setEnabled(true);
			this.getView().byId("unPesoStart").setEnabled(false);
			this.getView().byId("unPesoOkay").setEnabled(false);
			this.getView().byId("unPesoClose").setEnabled(false);
			this.getView().byId("unPesoDelete").setEnabled(false);
			this.addLinesPeso();
			// MessageToast.show("Start!");
		},

		onPressUnEnd: function (oEvent) {
			if (this._iTimer) {
				clearInterval(this._iTimer);
				this._iTimer = null;
			}
			this.getView().byId("unPesoEnd").setEnabled(false);
			this.getView().byId("unPesoStart").setEnabled(true);
			this.getView().byId("unPesoOkay").setEnabled(true);
			this.getView().byId("unPesoClose").setEnabled(true);
			this.getView().byId("unPesoDelete").setEnabled(true);
			MessageToast.show("End!");
		},

		addLinesPeso: function () {
			var oModel = this.getView().getModel("pesoUn");
			var pesoTeste = 200;
			if (this._iTimer) { return; }

			this._iTimer = setInterval(function () {
				var oData = oModel.getProperty("/PesosCollection") || [];
				oData.push({
					PB: parseFloat(pesoTeste).toFixed(3),
					Uom: "G"
				});
				oModel.setProperty("/PesosCollection", oData);
				pesoTeste += 105;
			}, 1000);
		},

		onPressDelete: function (oEvent) {
			var oTable = this.getView().byId("unPesoTable"),
				aSelectedContexts = oTable.getSelectedContexts(),
				oModel = this.getView().getModel("pesoUn"),
				oData = oModel.getProperty("/PesosCollection") || [];

			if (!aSelectedContexts.length) { return; }

			//Buscar indexes selecionados, de baixo para cima para apagar direito
			var aIndexes = aSelectedContexts.map(function (oContext) {
				return parseInt(oContext.getPath().split("/").pop(), 10);
			}).sort(function (a, b) {
				return b - a;
			});

			aIndexes.forEach(function (iIndex) {
				oData.splice(iIndex, 1);
			});

			oModel.setProperty("/PesosCollection", oData);
			oTable.removeSelections(true);
		}
	});
});
