sap.ui.define([
    "sap/m/MessageToast",
    "controloqualidade2/ext/util/BalancaClass"
], function (MessageToast, BalancaClass) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oEvent the event object provided by the event provider.
         */
        onPress: async function (oEvent) {
            var oResourceBundle = this.getModel("i18n").getResourceBundle();
            const oRowCtx = oEvent.getSource().getBindingContext();
            const oModel = oRowCtx.getModel();
            var pb = parseFloat(oRowCtx.getProperty("Pb"));

            pb = await BalancaClass.getSinglePeso();
            oRowCtx.setProperty("Pb", pb.toFixed(3));
            MessageToast.show(oResourceBundle.getText("pesoBalanca"));

            // if (!('serial' in navigator)) {
            //     MessageToast.show('Web Serial API not supported');
            // }

            // var port = await BalancaClass.getPort();
            // if (!port) {
            //     // port = await navigator.serial.requestPort();
            // }
            // await port.open({
            //     baudRate: 9600,
            //     dataBits: 8,
            //     stopBits: 1,
            //     parity: "none",
            //     flowControl: "hardware"
            // });

            // const textDecoder = new TextDecoderStream();
            // const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
            // const reader = textDecoder.readable.pipeThrough(new TransformStream(new BalancaClass.FloatTransformer())).getReader();

            // // Listen to data coming from the serial device.
            // while (true) {
            //     const { value, done } = await reader.read();
            //     if (done) {
            //         reader.releaseLock();
            //         break;
            //     }
            //     //TO DO Ver a melhor forma de apanhar o peso e registar
            //     if (BalancaClass.isFloatingString(value)) {
            //         console.log(value);
            //         pb = parseFloat(value);
            //         oRowCtx.setProperty("Pb", pb.toFixed(3));
            //         reader.cancel();
            //         MessageToast.show(oResourceBundle.getText("pesoBalanca"));
            //     }
            // }

            // reader.cancel();
            // await readableStreamClosed.catch(() => { /* Ignore the error */ });
        }
    };
});
