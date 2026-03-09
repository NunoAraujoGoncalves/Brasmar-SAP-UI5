sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox"
  ],
    function (Controller, MessageBox) {
      "use strict";

    return Controller.extend("student.com.sap.training.advancedsapui5.opa.controller.Main", {
        onInit: function () {

        },
        onPress: function (oEvent) {
            MessageBox.show("Button pressed");
        }
    });
});
