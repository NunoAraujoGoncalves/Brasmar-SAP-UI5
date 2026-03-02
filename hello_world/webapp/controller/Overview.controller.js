sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/syncStyleClass",
    "sap/ui/model/json/JSONModel"
],
    /**
     * @param {typeof sap.ui.core.mvc.Controller} Controller
     */
    function (Controller, syncStyleClass,JSONModel) {
        "use strict"
        return Controller.extend("sap.ui.training.exc.controller.Overview", {

            onInit: function () {
                var oModel = new JSONModel();
                this.getView().setModel(oModel, "customer");
            },

            onSave: function () {
                if (!this.pDialog) {
                    this.pDialog = this.loadFragment({
                        name: "sap.training.exc.view.Dialog"
                    }).then(function (oDialog) {
                        syncStyleClass(this.getOwnerComponent().getContentDensityClass(), this.getView(), oDialog);
                        return oDialog;
                    }.bind(this));
                }
                this.pDialog.then(function (oDialog) {
                    oDialog.open();
                });
            },

            onCloseDialog: function () {
                this.byId("dialog").close();
            }

        });
    }    
);