sap.ui.define([
    "sap/ui/core/mvc/Controller"
],
    function (Controller) {
        "use strict";

        return Controller.extend("student.com.sap.training.advancedsapui5.fullscreen.controller.Flights", {
            onInit: function () {
                var oRouter = this.getRouter();
                oRouter.getRoute("flights").attachMatched(this._onObjectMatched, this);
            },


            getRouter: function () {
                return sap.ui.core.UIComponent.getRouterFor(this);
            },

            _onObjectMatched: function(oEvent) {
                var oArgs = oEvent.getParameter("arguments");
                this._sCarridId = oArgs.carrid;
                var oView = this.getView();

                oView.bindElement({
                    path: "/UX_C_Carrier_TP('" + this._sCarridId + "')",
                    events: {
                        change: this._onBindingChange.bind(this),
                        dataRequested: function () {
                            oView.setBusy(true);
                        },
                        dataReceived: function () {
                            oView.setBusy(false);
                        }
                    }
                });
            },

            _onBindingChange: function () {
                var oElementBinding;
                oElementBinding = this.getView().getElementBinding();                
                //Se element binding é vazio e nao tem contexto
                if (oElementBinding && !oElementBinding.getBoundContext()) {
                    this.getRouter().getTargets().display("notFound");
                }
            },

            onNavBack: function () {
                var oHistory, sPreviousHash;
                oHistory = sap.ui.core.routing.History.getInstance();
                sPreviousHash = oHistory.getPreviousHash();

                if (sPreviousHash !== undefined) {
                    window.history.go(-1);
                } else {
                    this.getRouter().navTo("overview",true /* nao grava no historico de calls*/);
                }
            }
        });
    });
