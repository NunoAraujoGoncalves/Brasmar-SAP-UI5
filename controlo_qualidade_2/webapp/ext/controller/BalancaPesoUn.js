sap.ui.define([
    "sap/m/MessageToast",
    "controloqualidade2/ext/util/BalancaClass"
], function(MessageToast, BalancaClass) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
         * @param aSelectedContexts the selected contexts of the table rows.
         */
        multiplePesosUn: function(oContext, aSelectedContexts) {
            console.log(oContext);
            var oData = oContext.getModel().getData();
            console.log(oModel);
            // oModel.create({
            //     Ple: "10",
            //     Uom: "G"
            // })
            MessageToast.show("Custom handler invoked.");
        }
    };
});
