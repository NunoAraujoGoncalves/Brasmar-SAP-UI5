sap.ui.define(
    [
        "sap/ui/core/mvc/Controller",
        "sap/ui/model/json/JSONModel"
    ],
    function(BaseController, JSONModel) {
      "use strict";
  
      return BaseController.extend("student.com.sap.training.advancedsapui5.listdetail.controller.App", {
        onInit: function() {
            var oViewModel = new JSONModel({
              layout : "OneColumn"
            });
            this.getView().setModel(oViewModel, "mainView");
        }
      });
    }
  );
  