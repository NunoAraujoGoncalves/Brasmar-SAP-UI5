sap.ui.define([
    "sap/m/MessageToast",
    "controloqualidade2/ext/util/BalancaClass"
], function(MessageToast, BalancaClass) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oEvent the event object provided by the event provider.
         */
        onPress: async function(oEvent) {
            var oResourceBundle = this.getModel("i18n").getResourceBundle();
            const oRowCtx = oEvent.getSource().getBindingContext();
            const oModel = oRowCtx.getModel();
            var pl = parseFloat(oRowCtx.getProperty("Pl"));

            pl = await BalancaClass.getSinglePeso();
            oRowCtx.setProperty("Pl", pl.toFixed(3));
            MessageToast.show(oResourceBundle.getText("pesoBalanca"));
        }
    };
});
