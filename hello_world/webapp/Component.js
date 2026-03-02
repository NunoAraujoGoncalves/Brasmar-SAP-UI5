sap.ui.define([
    "sap/ui/core/UIComponent"
], (UIComponent) => {
    "use strict";

    return UIComponent.extend("sap.training.exc.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            //this.setModel(models.createDeviceModel(), "device");

            // enable routing
            //this.getRouter().initialize();
        }
    });
});