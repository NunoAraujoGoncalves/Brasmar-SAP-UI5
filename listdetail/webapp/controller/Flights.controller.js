sap.ui.define([
  "student/com/sap/training/advancedsapui5/listdetail/controller/BaseController"
],
  function (Controller) {
    "use strict";

    return Controller.extend("student.com.sap.training.advancedsapui5.listdetail.controller.Flights", {

      onInit: function () {
        var oRouter = this.getRouter();
        oRouter.getRoute("flights").attachMatched(this._onObjectMatched, this);

        var oModel = this.getOwnerComponent().getModel();
        oModel.attachRequestSent(function (oEvent) {
          this.getView().setBusy(true);
        }, this);
        oModel.attachRequestCompleted(function (oEvent) {
          this.getView().setBusy(false);
        }, this);
      },

      _onObjectMatched: function (oEvent) {
        var oArgs = oEvent.getParameter("arguments");
        this._sCarrierId = oArgs.carrid;
        var oView = this.getView();

        oView.getModel("mainView").setProperty("/layout", "TwoColumnsMidExpanded");

        oView.bindElement({
          path: "/UX_C_Carrier_TP('" + this._sCarrierId + "')",
          events: {
            change: this._onBindingChange.bind(this)
          }
        });
      },

      _onBindingChange: function () {
        var oView = this.getView();
        var oElementBinding = oView.getElementBinding();
        if (!oElementBinding.getBoundContext()) {
          this.getRouter().getTargets().display("notFound");
          this.getOwnerComponent().oListSelector.clearMasterListSelection();
          return;
        }
        var sPath = oElementBinding.getPath();
        this.getOwnerComponent().oListSelector.selectAListItem(sPath);
      }
    });
  });
