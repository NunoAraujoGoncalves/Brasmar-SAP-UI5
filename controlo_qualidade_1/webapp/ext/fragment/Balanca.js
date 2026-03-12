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
        onPress: async function (oEvent) {
            if (!('serial' in navigator)) {
                console.log('Web Serial API not supported');
            }

            var oResourceBundle = this.getModel("i18n").getResourceBundle();
            const oRowCtx = oEvent.getSource().getBindingContext();
            const oModel = oRowCtx.getModel();
            var pb = parseFloat(oRowCtx.getProperty("Pb"));

            //para debug usar about://device-log
            // Let user pick the COM/USB-serial device
            _getPort().then((result) => {
                var port = result;
                port.open({
                    baudRate: 9600,
                    dataBits: 8,
                    stopBits: 1,
                    parity: "none",
                    flowControl: "hardware"
                }).then(async (result) => {
                    const textDecoder = new TextDecoderStream();
                    const readableClosed = port.readable.pipeTo(textDecoder.writable);
                    const reader = textDecoder.readable.getReader();

                    const signals = await port.getSignals();
                    console.log(signals);

                    try {
                        while (true) {
                            const { value, done } = await reader.read();
                            console.log("done: " + done + ",value: " + value)
                            if (done) break;
                            if (_isFloatString(value)) {
                                console.log(value);
                                pb = parseFloat(value);
                                oRowCtx.setProperty("Pb", pb.toFixed(3));
                                reader.cancel();
                                MessageToast.show(oResourceBundle.getText("pesoBalanca"));                                
                            }
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
            }).catch((err) => {
                MessageToast.show(err);
            });

            async function _getPort() {
                var ports = await navigator.serial.getPorts();
                if (ports) {
                    return ports[1];
                } else {
                    return await navigator.serial.requestPort();
                }
            }

            function _isFloatString(str) {
                if (typeof str !== 'string') return false;
                const s = str.trim();
                if (s === '') return false;              // reject empty

                const n = Number(s);
                if (Number.isNaN(n)) return false;       // not numeric at all

                return !Number.isInteger(n);            // true = non‑integer number (float)
            }

        }
    };
});
