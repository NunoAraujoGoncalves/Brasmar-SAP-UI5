sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    return {

        getSinglePeso: async function () {
            if (!('serial' in navigator)) {
                MessageToast.show('Web Serial API not supported');
                return;
            }

            var port = await this.getPort();
            try {
                await port.open({
                    baudRate: 9600,
                    dataBits: 8,
                    stopBits: 1,
                    parity: "none",
                    flowControl: "hardware"
                });
            } catch (error) {
                console.log(error);
            };

            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
            const reader = textDecoder.readable.pipeThrough(new TransformStream(new this.FloatTransformer())).getReader();

            // Listen to data coming from the serial device.
            let result = '';
            let first = '';
            let second = '';
            let third = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    reader.releaseLock();
                    break;
                }
                // console.log("Value: " + value);
                result = this.balancaStrToFloat(value);
                third = second;
                second = first;
                first = result;
                // console.log("First: " + first + " ,second: " 
                //     + second + " , third: " + third
                // )
                if (result && ( first === second ) && ( second === third ))  {
                    reader.cancel();
                }
                // }
            }
            reader.cancel();
            await readableStreamClosed.catch(() => { /* Ignore the error */ });
            return result;
        },

        getPort: async function () {
            var ports = await navigator.serial.getPorts();
            if (ports) {
                return ports[0];
            } else {
                const port = await navigator.serial.requestPort();
                if (!port) {
                    MessageToast.show('Erro a conectar a balança!');
                } else {
                    MessageToast.show('Balança conectada!');
                    port.addEventListener("ondisconnect", (event) => {
                        MessageToast.show('Balança desconectada!');
                    })
                }
                await port.open({
                    baudRate: 9600,
                    dataBits: 8,
                    stopBits: 1,
                    parity: "none",
                    flowControl: "hardware"
                });
                return port;
            }
        },


        isFloatingString: function (str) {
            if (typeof str !== 'string') return false;
            const s = str.trim();
            if (s === '') return false;              // reject empty

            const n = Number(s);
            if (Number.isNaN(n)) return false;       // not numeric at all

            return !Number.isInteger(n);            // true = non‑integer number (float)
        },

        balancaStrToFloat: function (str) {
            // Remove the leading '+' and convert to float
            const numStr = str.replace(/^\+/, "");
            const result = parseFloat(numStr);

            // Check it's a valid number
            return Number.isFinite(result) ? result : null;
        },

        FloatTransformer: class {
            constructor() {
                this.chunks = "";
                this.alreadyFoundFloat = 0;
                this.maxFounds = 2;
            }

            transform(chunk, controller) {
                // Append new chunks to existing chunks.
                this.chunks += chunk;
                const regex = /\+.*\.\d{3}/;
                const floatString = this.chunks.match(regex);
                // console.log(this.chunks);
                // console.log(controller);
                // console.log(floatString);
                let match;
                //Apaga todos os registos iguais de chunks
                if (floatString) {
                    while ((match = this.chunks.match("\\" + floatString[0])) !== null) {
                        const idx = this.chunks.search("\\" + floatString[0]);
                        this.chunks = this.chunks.slice(0, idx) + this.chunks.slice(idx + match[0].length);
                    }
                    controller.enqueue(floatString[0]);
                }
            }

            flush(controller) {
                // When the stream is closed, flush any remaining chunks out.
                controller.enqueue(this.chunks);
            }
        }
    }
})  