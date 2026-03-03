sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel"
],
    (UIComponent, Device, JSONModel) => {
        "use strict";

        return UIComponent.extend("sap.training.exc.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // set the device model
                var oDeviceModel = new JSONModel(Device);
                oDeviceModel.setDefaultBindingMode("OneWay");
                this.setModel(oDeviceModel, "device");

                // enable routing
                //this.getRouter().initialize();
            },

            getContentDensityClass: function () {
                if (!this._sContentDensityClass) {
                    this._sContentDensityClass = 'sapUiSizeCozy';
                } else {
                    this._sContentDensityClass = 'sapUiSizeCompact';
                }
                return this._sContentDensityClass;
            }
        });
    });