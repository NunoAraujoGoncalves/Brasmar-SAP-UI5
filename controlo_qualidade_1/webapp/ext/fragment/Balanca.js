sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oEvent the event object provided by the event provider.
         */
        onPress: function (oEvent) {
            if (!('serial' in navigator)) {
                console.log('Web Serial API not supported');
            }

            console.log(this);

            //para debug usar about://device-log
            // Let user pick the COM/USB-serial device
            if (1 === 2) {
                navigator.serial.requestPort().then(async (result) => {
                    var port = result;
                    await port.open({ baudRate: 9600 });
                    const textDecoder = new TextDecoderStream();
                    const readableClosed = port.readable.pipeTo(textDecoder.writable);
                    const reader = textDecoder.readable.getReader();

                    try {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            if (value) log(value);
                        }
                    } catch (e) {
                        log('Error: ' + e);
                    } finally {
                        reader.releaseLock();
                        await readableClosed.catch(() => { });
                        await port.close();
                    }

                }).catch((err) => {
                    MessageToast.show(err);
                });
            }
        }
    };
});
