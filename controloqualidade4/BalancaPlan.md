# BalancaPlan: serial-port (weight scale) connection dialog on CQLinhaDetail

## Context
Users weigh products on a scale connected to the PC through a serial port (USB-serial). The app has to read those weights. This change adds the **configuration and connection** part. A new button next to **Calcular** (`CQDetailLinha_dynamicPage_Calcular`) on `CQLinhaDetail` opens a dialog where the user can:
- change the port settings: `baudRate`, `dataBits`, `stopBits`, `parity`, `flowControl`;
- connect to a port. Ports the browser has already authorised come from `navigator.serial.getPorts()`;
- disconnect from the connected port;
- test a value received from the scale. The value is converted to a **number with 2 decimals**;
- see whether a port is connected. This shows in the dialog and also on the header button itself.

The port is **read-only**: nothing is ever written to `port.writable`.

### Lessons from the earlier implementation (`controlo_qualidade_2/webapp/ext/util/BalancaClass.js`)
- **Fixed settings:** the settings were hard-coded (`9600/8/1/none/hardware`). Those values become the **defaults** here, and the user can change them.
- **Bug in the port lookup:** `if (ports)` is always true because `getPorts()` returns an array, even an empty one. So `requestPort()` was never reached on a PC whose port hadn't been authorised yet.
- **Port opened per reading:** the port was opened and closed on every reading, and the regex was tied to one scale's format (`/\+.*\.\d{3}/`). Here the port stays open with **one continuous read loop**. Each frame (one line) is parsed with a generic number regex.
- **Scattered state:** `port2`, `reader2` and `inputDone` were kept as loose variables. Here the state lives in one shared service with a JSON model, so every view sees the same connection state.

### Web Serial constraints the design follows
- **Browsers:** only **Chromium desktop browsers** (Chrome or Edge 89+), and only over **HTTPS or localhost**. The dialog shows an error strip when `navigator.serial` isn't available.
- **Authorising a port:** `getPorts()` only returns ports this site was **already authorised** for. The first time on a PC, the browser's port chooser (`navigator.serial.requestPort()`) must be opened **directly from a user click**. The dialog therefore has an **Adicionar porta** button, and **Ligar** uses the authorised ports from `getPorts()`.
- **One open connection per port:** a port can be open in only one place at a time, so another browser tab or another program blocks it. Opening the same port again fails with `InvalidStateError` or `NetworkError`, and the dialog explains this. The connection is a **single shared instance (singleton)** for the whole app, so it survives moving between lines (`CQCab(...)/_linhas(...)`). It closes when the browser tab closes.
- **Embedding in an iframe:** if the app ever runs inside an iframe, for example in SAP Build Work Zone, the iframe needs `allow="serial"`. Otherwise the browser throws `SecurityError`, and the dialog shows a message for that case too.

## Approach
1. **New module `ext/modules/SerialScale.ts`**, a shared service (singleton) written in TypeScript with no UI:
   - It holds a `JSONModel` with `supported`, `connected`, `busy`, `portLabel`, `ports`, `selectedPort`, `settings` and `lastReading`. The views use it under the model name **`serial`**. The name `balanca` is already used by the weighing table model in `onInit`.
   - **`refreshPorts()`** reads `getPorts()` and pre-selects the last port used, matched by USB vendor/product ID.
   - **`addPort()`** opens the browser's port chooser.
   - **`connect()`** opens the port with the settings, saves the settings, and starts the read loop.
   - **`disconnect()`** cancels the reader, waits for the loop to end, and closes the port. The browser's `disconnect` event (cable unplugged) does the same automatically.
   - **The read loop** works like this:
     - incoming data → `TextDecoderStream` → `FrameTransformer`, which splits frames on CR, LF, CRLF or ETX;
     - each frame → `parseWeight()`;
     - the result is stored in `/lastReading` and passed to anyone waiting for a value;
     - non-fatal parity or framing errors end only the current stream. The outer `while (port.readable)` loop starts again, as recommended in the Web Serial documentation.
   - **`parseWeight(raw)`** takes the first signed number in the frame, so `"+ 12.345 kg"`, `"ST,GS,+0012.345kg"` and `"  1,239 kg"` all work. It treats `,` as the decimal separator and **rounds to 2 decimals**. It rounds half away from zero and adds an EPSILON correction, so `1.005` becomes `1.01`. `toFixed` alone gives `1.00`.
   - **`readNext(timeout)`** returns a promise for the **next** value. It is used by the test button now, and later by the weighing dialogs.
   - **Saved settings:** the settings and the last port's USB IDs are saved in `localStorage`, for each PC and browser. That is the right scope, because each PC has its own scale. Reads and writes are wrapped in try/catch, and the defaults apply when storage isn't available.
2. **New fragment `ext/fragments/BalancaConfig.fragment.xml`**, built from sap.m controls, as on the other custom pages:
   - a status strip (connected to X / disconnected) and an "unsupported browser" strip;
   - a port select with an **Adicionar porta** button;
   - the 5 setting selects. They are **locked while connected**, because settings only apply when the port opens, and a hint says so;
   - a test area showing the last value (2 decimals), the raw text received and the time;
   - the dialog buttons: **Ligar**, **Desligar**, **Testar leitura** and **Fechar**, each enabled according to the state.
3. **`CQLinhaDetail.view.xml`**: a new header button before Calcular. Its icon and type follow `serial>/connected`, so a connected port is visible at a glance.
4. **`CQLinhaDetail.controller.ts`**:
   - `onInit` sets `SerialScale.model` as `serial` on the view;
   - new handlers `onBalancaConfig`, `onSerialAddPort`, `onSerialConnect`, `onSerialDisconnect`, `onSerialTest` and `onSerialClose`;
   - `showSerialError`, which maps the errors to i18n messages.
5. **Type definitions for Web Serial:** add `@types/w3c-web-serial` as a dev dependency and add it to `tsconfig.json`'s `types`. The standard TypeScript DOM library doesn't include Web Serial yet.
6. **i18n** keys for all texts.

**Out of scope, next step:** filling the weight fields from the scale. Examples are the existing weighing dialog `Balanca.fragment.xml`, with its `onPressBalancaStart` and `onPressBalancaEnd` stubs, and the PB/PL fields. Those will call `SerialScale.readNext()` and write `reading.text` (the 2-decimal string expected by `Edm.Decimal`) with `context.setProperty(...)`. This plan only builds what they need.

## Files
| File | Change |
|---|---|
| `controloqualidade4/package.json` | devDependency `@types/w3c-web-serial` |
| `controloqualidade4/tsconfig.json` | `types` += `@types/w3c-web-serial` |
| `controloqualidade4/webapp/ext/modules/SerialScale.ts` | **new** |
| `controloqualidade4/webapp/ext/fragments/BalancaConfig.fragment.xml` | **new** |
| `controloqualidade4/webapp/ext/view/CQLinhaDetail.view.xml` | header button before Calcular |
| `controloqualidade4/webapp/ext/view/CQLinhaDetail.controller.ts` | model and handlers (full source below) |
| `controloqualidade4/webapp/i18n/i18n.properties` | `CQLinhaDetail.btn.Balanca` and `balancaCfg.*` keys |

## 1. Type definitions for Web Serial

```
npm install --save-dev @types/w3c-web-serial
```

`tsconfig.json`, `compilerOptions.types`:

```json
"types": ["./node_modules/@sapui5/types", "@types/qunit", "@types/w3c-web-serial"]
```

## 2. New file: `webapp/ext/modules/SerialScale.ts`

```ts
import Log from "sap/base/Log";
import JSONModel from "sap/ui/model/json/JSONModel";

/** Port settings as kept in the "serial" model (sap.m.Select keys are strings) */
export type SerialSettings = {
    baudRate: string;
    dataBits: string;
    stopBits: string;
    parity: ParityType;
    flowControl: FlowControlType;
};

/** One value received from the scale */
export type ScaleReading = {
    weight: number;   // rounded to 2 decimals
    text: string;     // weight.toFixed(2): ready to write into an Edm.Decimal property
    raw: string;      // frame as received, without the line end
    time: string;
};

export type SerialScaleErrorCode = "notSupported" | "noPort" | "notConnected" | "timeout";

export class SerialScaleError extends Error {
    public readonly code: SerialScaleErrorCode;

    constructor(code: SerialScaleErrorCode) {
        super(code);
        this.code = code;
    }
}

type PortItem = { key: string; label: string };
type StoredSettings = Partial<SerialSettings> & { usbVendorId?: number; usbProductId?: number };

const STORAGE_KEY = "brasmar.bm01.controloqualidade4.serialSettings";
const LOG_COMPONENT = "brasmar.bm01.controloqualidade4.SerialScale";
const FRAME_END = /\r\n|\r|\n|\u0003/;      // CR, LF, CRLF or ETX ends a frame
const NUMBER = /[-+]?\s*\d+(?:[.,]\d+)?/;    // first signed number of a frame, e.g. "ST,GS,+0012.345kg"
const MAX_BUFFER = 256;                       // safety for devices that never send a frame end

export const DEFAULT_SETTINGS: SerialSettings = {
    baudRate: "9600",
    dataBits: "8",
    stopBits: "1",
    parity: "none",
    flowControl: "hardware"
};

/**
 * Divide o texto recebido em frames (uma pesagem por linha)
 */
class FrameTransformer implements Transformer<string, string> {
    private buffer = "";

    public transform(chunk: string, controller: TransformStreamDefaultController<string>): void {
        this.buffer += chunk;
        const frames = this.buffer.split(FRAME_END);
        this.buffer = (frames.pop() ?? "").slice(-MAX_BUFFER);
        frames
            .map((frame) => frame.trim())
            .filter((frame) => frame !== "")
            .forEach((frame) => controller.enqueue(frame));
    }

    public flush(controller: TransformStreamDefaultController<string>): void {
        if (this.buffer.trim() !== "") {
            controller.enqueue(this.buffer.trim());
        }
    }
}

/**
 * Ligação (só leitura) a uma balança por porta série, através da Web Serial API.
 * Uma única instância para toda a app: uma porta só pode estar aberta uma vez.
 * O estado é exposto no JSONModel `model` (usado nas views com o nome "serial").
 */
export class SerialScale {
    public readonly model: JSONModel;
    private port?: SerialPort;
    private grantedPorts: SerialPort[] = [];
    private reader?: ReadableStreamDefaultReader<string>;
    private readLoop?: Promise<void>;
    private keepReading = false;
    private waiters: ((reading: ScaleReading) => void)[] = [];

    constructor() {
        this.model = new JSONModel({
            supported: SerialScale.isSupported(),
            connected: false,
            busy: false,
            portLabel: "",
            ports: [] as PortItem[],
            selectedPort: "",
            settings: this.loadSettings(),
            lastReading: null
        });

        if (SerialScale.isSupported()) {
            // cabo desligado / balança desligada: fecha a ligação e atualiza o estado
            navigator.serial.addEventListener("disconnect", (event) => {
                if (event.target === this.port) {
                    void this.disconnect();
                }
            });
        }
    }

    public static isSupported(): boolean {
        return typeof navigator !== "undefined" && "serial" in navigator;
    }

    /**
     * Arredonda para 2 casas decimais (meio para longe do zero; EPSILON evita 1.005 -> 1.00)
     */
    public static round2(value: number): number {
        return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
    }

    /**
     * Extrai o primeiro número de um frame da balança ("+ 12.345 kg", "ST,GS,+0012.345kg", "1,239 kg").
     * A vírgula é tratada como separador decimal. undefined = frame sem número (cabeçalhos, estados).
     */
    public static parseWeight(raw: string): number | undefined {
        const match = NUMBER.exec(raw);
        if (!match) {
            return undefined;
        }
        const value = Number(match[0].replace(/\s+/g, "").replace(",", "."));
        return Number.isFinite(value) ? SerialScale.round2(value) : undefined;
    }

    /* ---------- ports ---------- */

    /**
     * Portas já autorizadas neste site (navigator.serial.getPorts).
     * Pré-seleciona a última porta usada (pelos ids USB guardados).
     */
    public async refreshPorts(): Promise<void> {
        if (!SerialScale.isSupported()) {
            return;
        }
        this.grantedPorts = await navigator.serial.getPorts();
        const ports: PortItem[] = this.grantedPorts.map((port, index) => ({
            key: String(index),
            label: this.describePort(port, index)
        }));
        this.model.setProperty("/ports", ports);

        const selected = this.model.getProperty("/selectedPort") as string;
        if (!ports.some((port) => port.key === selected)) {
            this.model.setProperty("/selectedPort", this.findPreferredPort());
        }
    }

    /**
     * Abre o seletor de portas do browser (navigator.serial.requestPort).
     * Tem de ser chamado diretamente a partir de um clique do utilizador.
     */
    public async addPort(): Promise<void> {
        if (!SerialScale.isSupported()) {
            throw new SerialScaleError("notSupported");
        }
        const port = await navigator.serial.requestPort();
        await this.refreshPorts();
        const index = this.grantedPorts.indexOf(port);
        this.model.setProperty("/selectedPort", String(index >= 0 ? index : this.grantedPorts.length - 1));
    }

    /* ---------- connection ---------- */

    public isConnected(): boolean {
        return this.port !== undefined;
    }

    public async connect(): Promise<void> {
        if (!SerialScale.isSupported()) {
            throw new SerialScaleError("notSupported");
        }
        if (this.port) {
            return;
        }
        const port = this.grantedPorts[Number(this.model.getProperty("/selectedPort"))];
        if (!port || this.model.getProperty("/selectedPort") === "") {
            throw new SerialScaleError("noPort");
        }

        const settings = this.model.getProperty("/settings") as SerialSettings;
        this.setBusy(true);
        try {
            await port.open({
                baudRate: Number(settings.baudRate),
                dataBits: Number(settings.dataBits),
                stopBits: Number(settings.stopBits),
                parity: settings.parity,
                flowControl: settings.flowControl
            });
        } finally {
            this.setBusy(false);
        }

        this.port = port;
        this.saveSettings(settings, port.getInfo());
        this.model.setProperty("/connected", true);
        this.model.setProperty("/portLabel", this.describePort(port, this.grantedPorts.indexOf(port)));

        this.keepReading = true;
        this.readLoop = this.read(port);
    }

    public async disconnect(): Promise<void> {
        const port = this.port;
        if (!port) {
            return;
        }
        this.setBusy(true);
        this.keepReading = false;
        try {
            await this.reader?.cancel().catch(() => undefined);
            await this.readLoop;
            await port.close().catch((error: unknown) => Log.warning("Serial port close failed", String(error), LOG_COMPONENT));
        } finally {
            this.port = undefined;
            this.reader = undefined;
            this.readLoop = undefined;
            this.model.setProperty("/connected", false);
            this.model.setProperty("/portLabel", "");
            this.setBusy(false);
        }
    }

    /* ---------- reading ---------- */

    /**
     * Devolve o PRÓXIMO valor recebido da balança (não o último já recebido).
     */
    public readNext(timeoutMs = 5000): Promise<ScaleReading> {
        if (!this.port) {
            return Promise.reject(new SerialScaleError("notConnected"));
        }
        return new Promise((resolve, reject) => {
            const waiter = (reading: ScaleReading): void => {
                clearTimeout(timer);
                resolve(reading);
            };
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter((w) => w !== waiter);
                reject(new SerialScaleError("timeout"));
            }, timeoutMs);
            this.waiters.push(waiter);
        });
    }

    /**
     * Ciclo de leitura contínuo (só leitura, nunca escreve na porta).
     * Erros não fatais (paridade, framing, overrun) terminam só o stream atual:
     * port.readable devolve um novo e o ciclo continua.
     */
    private async read(port: SerialPort): Promise<void> {
        while (port.readable && this.keepReading) {
            const decoder = new TextDecoderStream();
            // TextDecoderStream accepts any BufferSource; Uint8Array is one (TS 5.7+ typed-array generics need the cast)
            const piped = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => undefined);
            const reader = decoder.readable.pipeThrough(new TransformStream(new FrameTransformer())).getReader();
            this.reader = reader;
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (value) {
                        this.onFrame(value);
                    }
                }
            } catch (error) {
                Log.warning("Serial read error", String(error), LOG_COMPONENT);
            } finally {
                reader.releaseLock();
                await piped;
            }
        }
    }

    private onFrame(raw: string): void {
        const weight = SerialScale.parseWeight(raw);
        if (weight === undefined) {
            return;
        }
        const reading: ScaleReading = {
            weight,
            text: weight.toFixed(2),
            raw,
            time: new Date().toLocaleTimeString()
        };
        this.model.setProperty("/lastReading", reading);

        const waiters = this.waiters;
        this.waiters = [];
        waiters.forEach((waiter) => waiter(reading));
    }

    /* ---------- helpers ---------- */

    private setBusy(busy: boolean): void {
        this.model.setProperty("/busy", busy);
    }

    private describePort(port: SerialPort, index: number): string {
        const { usbVendorId, usbProductId } = port.getInfo();
        const hex = (id?: number): string => (id ?? 0).toString(16).padStart(4, "0").toUpperCase();
        return usbVendorId !== undefined
            ? `${index + 1}: USB ${hex(usbVendorId)}:${hex(usbProductId)}`
            : `${index + 1}: Serial`;
    }

    private findPreferredPort(): string {
        if (this.grantedPorts.length === 0) {
            return "";
        }
        const stored = this.readStorage();
        const index = this.grantedPorts.findIndex((port) => {
            const info = port.getInfo();
            return stored?.usbVendorId !== undefined
                && info.usbVendorId === stored.usbVendorId
                && info.usbProductId === stored.usbProductId;
        });
        return String(index >= 0 ? index : 0);
    }

    private loadSettings(): SerialSettings {
        const stored = this.readStorage();
        return {
            baudRate: stored?.baudRate ?? DEFAULT_SETTINGS.baudRate,
            dataBits: stored?.dataBits ?? DEFAULT_SETTINGS.dataBits,
            stopBits: stored?.stopBits ?? DEFAULT_SETTINGS.stopBits,
            parity: stored?.parity ?? DEFAULT_SETTINGS.parity,
            flowControl: stored?.flowControl ?? DEFAULT_SETTINGS.flowControl
        };
    }

    private readStorage(): StoredSettings | undefined {
        try {
            const text = window.localStorage.getItem(STORAGE_KEY);
            return text ? (JSON.parse(text) as StoredSettings) : undefined;
        } catch {
            return undefined;
        }
    }

    private saveSettings(settings: SerialSettings, info: SerialPortInfo): void {
        try {
            const stored: StoredSettings = { ...settings, usbVendorId: info.usbVendorId, usbProductId: info.usbProductId };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {
            // storage not available (private mode, policy): defaults are used next time
        }
    }
}

export default new SerialScale();
```

## 3. New file: `webapp/ext/fragments/BalancaConfig.fragment.xml`

```xml
<core:FragmentDefinition xmlns:core="sap.ui.core"
    xmlns="sap.m"
    xmlns:form="sap.ui.layout.form">
    <Dialog id="BalancaConfigDialog" title="{i18n>balancaCfg.title}" contentWidth="34rem" draggable="true" resizable="true" busy="{serial>/busy}" busyIndicatorDelay="0">
        <content>
            <MessageStrip id="BalancaConfig_notSupported" type="Error" showIcon="true" text="{i18n>balancaCfg.notSupported}" visible="{= !${serial>/supported} }" class="sapUiSmallMargin"/>
            <MessageStrip id="BalancaConfig_status" showIcon="true" visible="{serial>/supported}" class="sapUiSmallMargin"
                type="{= ${serial>/connected} ? 'Success' : 'Warning' }"
                text="{= ${serial>/connected} ? ${i18n>balancaCfg.status.connected} + ': ' + ${serial>/portLabel} : ${i18n>balancaCfg.status.disconnected} }"/>

            <form:SimpleForm id="BalancaConfig_form" editable="true" layout="ColumnLayout" columnsM="1" columnsL="1" columnsXL="1" visible="{serial>/supported}">
                <form:content>
                    <core:Title id="BalancaConfig_title_port" text="{i18n>balancaCfg.section.port}"/>
                    <Label id="BalancaConfig_port_label" text="{i18n>balancaCfg.port}" labelFor="BalancaConfig_port"/>
                    <Select id="BalancaConfig_port" forceSelection="false" width="100%" items="{serial>/ports}" selectedKey="{serial>/selectedPort}"
                        enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_port_item" key="{serial>key}" text="{serial>label}"/>
                    </Select>
                    <Button id="BalancaConfig_port_add" text="{i18n>balancaCfg.port.add}" icon="sap-icon://add" press=".onSerialAddPort" enabled="{= !${serial>/connected} }"/>
                    <!-- sap.m.Select has no noDataText: show the hint while no port is authorised -->
                    <Text id="BalancaConfig_port_none" text="{i18n>balancaCfg.port.none}" visible="{= ${serial>/ports}.length === 0 }"/>

                    <core:Title id="BalancaConfig_title_settings" text="{i18n>balancaCfg.section.settings}"/>
                    <Label id="BalancaConfig_baudRate_label" text="{i18n>balancaCfg.baudRate}" labelFor="BalancaConfig_baudRate"/>
                    <Select id="BalancaConfig_baudRate" width="100%" selectedKey="{serial>/settings/baudRate}" enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_baud_1200" key="1200" text="1200"/>
                        <core:Item id="BalancaConfig_baud_2400" key="2400" text="2400"/>
                        <core:Item id="BalancaConfig_baud_4800" key="4800" text="4800"/>
                        <core:Item id="BalancaConfig_baud_9600" key="9600" text="9600"/>
                        <core:Item id="BalancaConfig_baud_19200" key="19200" text="19200"/>
                        <core:Item id="BalancaConfig_baud_38400" key="38400" text="38400"/>
                        <core:Item id="BalancaConfig_baud_57600" key="57600" text="57600"/>
                        <core:Item id="BalancaConfig_baud_115200" key="115200" text="115200"/>
                    </Select>
                    <Label id="BalancaConfig_dataBits_label" text="{i18n>balancaCfg.dataBits}" labelFor="BalancaConfig_dataBits"/>
                    <Select id="BalancaConfig_dataBits" width="100%" selectedKey="{serial>/settings/dataBits}" enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_dataBits_7" key="7" text="7"/>
                        <core:Item id="BalancaConfig_dataBits_8" key="8" text="8"/>
                    </Select>
                    <Label id="BalancaConfig_stopBits_label" text="{i18n>balancaCfg.stopBits}" labelFor="BalancaConfig_stopBits"/>
                    <Select id="BalancaConfig_stopBits" width="100%" selectedKey="{serial>/settings/stopBits}" enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_stopBits_1" key="1" text="1"/>
                        <core:Item id="BalancaConfig_stopBits_2" key="2" text="2"/>
                    </Select>
                    <Label id="BalancaConfig_parity_label" text="{i18n>balancaCfg.parity}" labelFor="BalancaConfig_parity"/>
                    <Select id="BalancaConfig_parity" width="100%" selectedKey="{serial>/settings/parity}" enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_parity_none" key="none" text="{i18n>balancaCfg.parity.none}"/>
                        <core:Item id="BalancaConfig_parity_even" key="even" text="{i18n>balancaCfg.parity.even}"/>
                        <core:Item id="BalancaConfig_parity_odd" key="odd" text="{i18n>balancaCfg.parity.odd}"/>
                    </Select>
                    <Label id="BalancaConfig_flowControl_label" text="{i18n>balancaCfg.flowControl}" labelFor="BalancaConfig_flowControl"/>
                    <Select id="BalancaConfig_flowControl" width="100%" selectedKey="{serial>/settings/flowControl}" enabled="{= !${serial>/connected} }">
                        <core:Item id="BalancaConfig_flowControl_none" key="none" text="{i18n>balancaCfg.flowControl.none}"/>
                        <core:Item id="BalancaConfig_flowControl_hardware" key="hardware" text="{i18n>balancaCfg.flowControl.hardware}"/>
                    </Select>
                    <Text id="BalancaConfig_settings_hint" text="{i18n>balancaCfg.settings.hint}" visible="{serial>/connected}"/>

                    <core:Title id="BalancaConfig_title_test" text="{i18n>balancaCfg.section.test}"/>
                    <Label id="BalancaConfig_lastValue_label" text="{i18n>balancaCfg.lastValue}" labelFor="BalancaConfig_lastValue"/>
                    <ObjectNumber id="BalancaConfig_lastValue" number="{serial>/lastReading/text}" emphasized="true" emptyIndicatorMode="On"/>
                    <Label id="BalancaConfig_rawValue_label" text="{i18n>balancaCfg.rawValue}" labelFor="BalancaConfig_rawValue"/>
                    <Text id="BalancaConfig_rawValue" emptyIndicatorMode="On" renderWhitespace="true"
                        text="{= ${serial>/lastReading} ? ${serial>/lastReading/raw} + '  (' + ${serial>/lastReading/time} + ')' : '' }"/>
                </form:content>
            </form:SimpleForm>
        </content>
        <buttons>
            <Button id="BalancaConfig_btn_connect" text="{i18n>balancaCfg.btn.connect}" icon="sap-icon://connected" type="Emphasized" press=".onSerialConnect"
                enabled="{= ${serial>/supported} &amp;&amp; !${serial>/connected} }"/>
            <Button id="BalancaConfig_btn_disconnect" text="{i18n>balancaCfg.btn.disconnect}" icon="sap-icon://disconnected" press=".onSerialDisconnect"
                enabled="{serial>/connected}"/>
            <Button id="BalancaConfig_btn_test" text="{i18n>balancaCfg.btn.test}" icon="sap-icon://measure" press=".onSerialTest"
                enabled="{serial>/connected}"/>
            <Button id="BalancaConfig_btn_close" text="{i18n>balancaCfg.btn.close}" press=".onSerialClose"/>
        </buttons>
    </Dialog>
</core:FragmentDefinition>
```

## 4. `CQLinhaDetail.view.xml`: header actions (inside `<f:actions>`, before the Calcular button)

```xml
<Button id="CQDetailLinha_dynamicPage_Balanca" text="{i18n>CQLinhaDetail.btn.Balanca}" press=".onBalancaConfig"
    icon="{= ${serial>/connected} ? 'sap-icon://connected' : 'sap-icon://disconnected' }"
    type="{= ${serial>/connected} ? 'Success' : 'Default' }"
    tooltip="{= ${serial>/connected} ? ${i18n>balancaCfg.status.connected} + ': ' + ${serial>/portLabel} : ${i18n>balancaCfg.status.disconnected} }"/>
<Button id="CQDetailLinha_dynamicPage_Calcular" ... (unchanged)/>
```

The button is visible in both display and edit mode, because configuring or checking the scale doesn't depend on editing. If it should only appear in edit mode, add `visible="{ui>/isEditable}"`.

## 5. Full source: `webapp/ext/view/CQLinhaDetail.controller.ts`

The changes are the `SerialScale`, `MessageBox` and `MessageToast` imports, the `serialDialog` field, `setModel(SerialScale.model, "serial")` in `onInit`, the new section "Configuração da balança (porta série)" and `showSerialError`. Everything else is the current code, unchanged.

```ts
import Controller from "sap/fe/core/PageController";
import Formatter from "../modules/Formatter";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import ScrollContainer from "sap/m/ScrollContainer";
import UI5Element from "sap/ui/core/Element";
import EditHelper from "../modules/EditHelper";
import { Actions } from "../modules/Constants";
import Context from "sap/ui/model/odata/v4/Context";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Event from "sap/ui/base/Event";
import Button, { Button$PressEvent } from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Input from "sap/m/Input";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/m/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import SerialScale, { SerialScaleError } from "../modules/SerialScale";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQLinhaDetail extends Controller {
    formatter = new Formatter();
    editHelper: EditHelper;
    balancaDialog: Dialog;
    serialDialog: Dialog;
    currentPesoCollection: string;

    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetailLinha_footer_draftIndicator");
        const oPesosModel = new JSONModel({
            "PesosUn": [],
            "Calibres": []
        });
        this.getView()?.setModel(oPesosModel,"balanca");
        // estado partilhado da ligação à balança (porta série)
        this.getView()?.setModel(SerialScale.model, "serial");
    }

    public onExit(): void {
        this.editHelper.destroy();
        // the serial connection is shared by the whole app: it is NOT closed here
    }


    public onFilterSelect(oEvent: IconTabBar$SelectEvent) {
        const sKey = oEvent.getParameter("key") as string;

        const oScrollContainer = this.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
        if (!oScrollContainer) { return; }

        let oElement: UI5Element;
        switch (sKey) {
            case "Amostra":
                oElement = this.byId("CQDetailLinha_amostra_title") as UI5Element;
                break;
            case "PerdaPeso":
                oElement = this.byId("CQDetailLinha_perdaPeso_title") as UI5Element;
                break;
            case "Pesos":
                oElement = this.byId("CQDetailLinha_Peso_title") as UI5Element;
                break;
            case "PesoCx":
                oElement = this.byId("CQDetailLinha_Peso_title") as UI5Element;
                break;
            case "PesoUn":
                oElement = this.byId("CQDetailLinha_PesoUn") as UI5Element;
                break;
            case "Vidragens":
                oElement = this.byId("CQDetailLinha_vidragem_title") as UI5Element;
                break;
            case "Calibres":
                oElement = this.byId("CQDetailLinha_calibre_title") as UI5Element;
                break;
            case "Temperaturas":
                oElement = this.byId("CQDetailLinha_Temperaturas_title") as UI5Element;
                break;
            default:
                oElement = this.byId("CQDetailLinha_amostra_title") as UI5Element;
        }

        oScrollContainer.scrollToElement(oElement, 400);
    }

    /* ---------- Header Functions ---------- */
    public async onCalcular(): Promise<void> {
        const oContainer = this.getView()?.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
        oContainer.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.doCalculations, {
            contexts: this.getContext(),
            label: this.getText("CQLinhaDetail.btn.Calcular")
        });

        oContainer.setBusy(false);
    }


    public async onPesosConverterUm(): Promise<void> {
        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.convertUom, {
            contexts: this.getContext(),
            label: this.getText("CQLinhaDetail.Peso.btn.convertUm")
        });
    }


    public async onCalibresConverterUm(): Promise<void> {
        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.convertUomCalibre, {
            contexts: this.getContext(),
            label: this.getText("CQLinhaDetail.calibre.convertUm")
        })
    }


    /* ---------- Configuração da balança (porta série) ---------- */

    /**
     * Abre o dialog de configuração da ligação à balança.
     * Atualiza a lista de portas já autorizadas (navigator.serial.getPorts).
     */
    public async onBalancaConfig(): Promise<void> {
        if (!this.serialDialog) {
            this.serialDialog = await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.BalancaConfig",
                controller: this
            }) as Dialog;
            this.getView()?.addDependent(this.serialDialog);
        }
        this.serialDialog.open();
        try {
            await SerialScale.refreshPorts();
        } catch (error) {
            this.showSerialError(error);
        }
    }

    /**
     * Seletor de portas do browser: tem de ser a primeira coisa a correr no clique
     * (o browser exige um gesto do utilizador para requestPort)
     */
    public async onSerialAddPort(): Promise<void> {
        try {
            await SerialScale.addPort();
        } catch (error) {
            this.showSerialError(error);
        }
    }

    public async onSerialConnect(): Promise<void> {
        try {
            await SerialScale.connect();
            MessageToast.show(this.getText("balancaCfg.msg.connected"));
        } catch (error) {
            this.showSerialError(error);
        }
    }

    public async onSerialDisconnect(): Promise<void> {
        try {
            await SerialScale.disconnect();
            MessageToast.show(this.getText("balancaCfg.msg.disconnected"));
        } catch (error) {
            this.showSerialError(error);
        }
    }

    /**
     * Espera pelo próximo valor da balança e mostra-o com 2 casas decimais
     */
    public async onSerialTest(): Promise<void> {
        try {
            const reading = await SerialScale.readNext(5000);
            MessageToast.show(this.getText("balancaCfg.test.ok", [reading.text]));
        } catch (error) {
            this.showSerialError(error);
        }
    }

    public onSerialClose(): void {
        this.serialDialog.close();
    }


    /* ---------- Balanças Functions ---------- */
    public async onBalancaBeforeOpen(): Promise<void> {
        const pesoTable = this.getView()?.byId("BalancaDialog_table") as Table;
        pesoTable.bindItems({
            path: this.currentPesoCollection
        })
    }

    public async onPesoUnBalanca(oEvent: Button$PressEvent): Promise<void> {
        if (!this.balancaDialog) {
            this.balancaDialog = await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.Balanca",
                controller: this
            }) as Dialog;
            this.getView()?.addDependent(this.balancaDialog);
        }
        this.currentPesoCollection = "{balanca>/PesosUn}";
        this.balancaDialog.open();
    }

    public async onPressCloseDialog(oEvent: Button$PressEvent): Promise<void> {
        this.balancaDialog.close();
    }

    public async onPressOkayDialog(oEvent: Button$PressEvent): Promise<void> {

    }

    public async onPressBalancaDelete(oEvent: Button$PressEvent): Promise<void> {

    }

    public async onPressBalancaStart(oEvent: Button$PressEvent): Promise<void> {

    }

    public async onPressBalancaEnd(oEvent: Button$PressEvent): Promise<void> {

    }


    /* ---------- Footer Functions ---------- */
    public async onApply(): Promise<void> {
        await this.getExtensionAPI().getEditFlow().applyDocument(this.getContext());
    }

    public onMessagesPress(oEvent: Event) {
        this.editHelper.openMessages(oEvent.getSource() as Button);
    }

    /* ---------- Input Fields ---------- */
    public onFieldChange(oEvent: Event) {
        void this.editHelper.requestSideEffects(oEvent.getSource() as Control);
    }

    public onValueHelpRequest(oEvent: Event) {
        void this.editHelper.openValueHelp(oEvent.getSource() as Input);
    }

    /* ---------- helpers ---------- */

    private getContext(): Context {
        return this.getView()!.getBindingContext() as Context;
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }

    /**
     * Traduz os erros da Web Serial API / SerialScale em mensagens para o utilizador
     */
    private showSerialError(error: unknown): void {
        const code = error instanceof SerialScaleError ? error.code : (error as { name?: string } | undefined)?.name;
        switch (code) {
            case "NotFoundError":       // utilizador fechou o seletor de portas sem escolher
                return;
            case "notSupported":
                MessageBox.error(this.getText("balancaCfg.notSupported"));
                return;
            case "noPort":
                MessageBox.warning(this.getText("balancaCfg.error.noPort"));
                return;
            case "notConnected":
                MessageBox.warning(this.getText("balancaCfg.status.disconnected"));
                return;
            case "timeout":
                MessageBox.warning(this.getText("balancaCfg.test.timeout"));
                return;
            case "InvalidStateError":   // porta já aberta (outro separador / esta app)
                MessageBox.error(this.getText("balancaCfg.error.alreadyOpen"));
                return;
            case "NetworkError":        // falhou a abertura: porta usada por outro programa
                MessageBox.error(this.getText("balancaCfg.error.inUse"));
                return;
            case "SecurityError":       // bloqueado pelo browser / iframe sem allow="serial"
                MessageBox.error(this.getText("balancaCfg.error.security"));
                return;
            default:
                MessageBox.error(this.getText("balancaCfg.error.generic"), { details: String(error) });
        }
    }
}
```

## 6. `i18n.properties`: add after `CQLinhaDetail.btn.Calcular`, plus a new block at the end

```properties
CQLinhaDetail.btn.Balanca=Balança
```

```properties

#Configuração da balança (porta série)
balancaCfg.title=Configuração da balança
balancaCfg.notSupported=Este browser não suporta portas série. Utilize o Google Chrome ou o Microsoft Edge num computador, através de HTTPS.
balancaCfg.status.connected=Balança ligada
balancaCfg.status.disconnected=Balança desligada
balancaCfg.section.port=Porta
balancaCfg.section.settings=Parâmetros da ligação
balancaCfg.section.test=Teste
balancaCfg.port=Porta série
balancaCfg.port.add=Adicionar porta
balancaCfg.port.none=Nenhuma porta autorizada. Use "Adicionar porta".
balancaCfg.baudRate=Baud rate
balancaCfg.dataBits=Data bits
balancaCfg.stopBits=Stop bits
balancaCfg.parity=Paridade
balancaCfg.parity.none=Nenhuma
balancaCfg.parity.even=Par
balancaCfg.parity.odd=Ímpar
balancaCfg.flowControl=Controlo de fluxo
balancaCfg.flowControl.none=Nenhum
balancaCfg.flowControl.hardware=Hardware (RTS/CTS)
balancaCfg.settings.hint=Para alterar os parâmetros, desligue primeiro a balança.
balancaCfg.lastValue=Último valor
balancaCfg.rawValue=Valor recebido
balancaCfg.btn.connect=Ligar
balancaCfg.btn.disconnect=Desligar
balancaCfg.btn.test=Testar leitura
balancaCfg.btn.close=Fechar
balancaCfg.msg.connected=Balança ligada.
balancaCfg.msg.disconnected=Balança desligada.
balancaCfg.test.ok=Valor lido: {0}
balancaCfg.test.timeout=Não foi recebido nenhum valor da balança em 5 segundos. Verifique os parâmetros da ligação e se a balança está a enviar dados.
balancaCfg.error.noPort=Selecione uma porta ou use "Adicionar porta".
balancaCfg.error.alreadyOpen=A porta já está aberta (possivelmente noutro separador do browser).
balancaCfg.error.inUse=Não foi possível abrir a porta. Verifique se não está a ser usada por outro programa e se os parâmetros estão corretos.
balancaCfg.error.security=O acesso à porta série foi bloqueado pelo browser.
balancaCfg.error.generic=Ocorreu um erro na ligação à balança.
```

## Design notes
- **Read-only:** `SerialScale` never touches `port.writable`.
- **Weights as both number and text:** `ScaleReading.weight` is a JavaScript number with 2 decimals. `ScaleReading.text` is the same value as a string (`"1939.26"`), which is the form OData V4 expects for `Edm.Decimal` in `context.setProperty`.
- **Frames without a number** (headers, "unstable" status lines) are ignored. If the scale marks stable weights, for example `ST` versus `US`, a later option can filter on it. The raw frame is kept in `ScaleReading.raw` for that purpose.
- **Scales without a line end:** a scale that sends no CR, LF or ETX at all produces no frames. The buffer is capped at 256 characters so it can't grow without limit. Such a scale would need its own frame rule, like the old `/\+.*\.\d{3}/`, which can be added as a setting.
- **One connection shared by all pages:** `export default new SerialScale()` makes every import share one instance. Because `CQLinhaDetail` instances share it, moving between lines keeps the scale connected. `onExit` deliberately doesn't disconnect.

## Verification
1. Run `npm install`, then `npm run ts-typecheck` and `npm run lint`. There must be no errors about `navigator.serial`, `SerialPort` or `ParityType`.
2. Run `npm start` in **Chrome or Edge**. `localhost` and the HTTPS FLP both count as secure contexts. Open a CQ line. The header shows **Balança** with the "disconnected" icon, next to Calcular.
3. Open the dialog on a PC with no authorised port. The port list is empty and the warning reads "Balança desligada".
   - Click **Adicionar porta**: the browser's chooser opens. Pick the scale's COM or USB port and it appears selected.
   - Cancel the chooser instead: no error is shown.
4. Set the scale's settings (for example 9600/8/1/none/hardware) and click **Ligar**:
   - the strip turns green ("Balança ligada: 1: USB 0403:6001");
   - the selects are locked;
   - the header button turns green.
5. Put a product on the scale: **Último valor** updates live, for example `12.35`, with the raw frame (`+  12.345 kg (10:31:02)`). Click **Testar leitura** and the toast shows "Valor lido: 12.35". With nothing being sent, you get the 5-second timeout message.
6. Close the dialog, go to another line and reopen it. The connection is still there and the settings are still locked.
7. Click **Desligar**: the strip turns yellow, the selects are enabled again and the header button goes back to the default style. Reload the page and open the dialog: the port is listed and pre-selected straight from `getPorts()`, with no chooser, and the saved settings are restored.
8. Try errors:
   - unplug the cable while connected: the state switches to disconnected;
   - open the port in a second tab, then click Ligar: you get the "already open / in use" message;
   - in Firefox, you get the "not supported" strip and Ligar is disabled.
9. Check the rounding in the browser console: `SerialScale.parseWeight("+ 1.005 kg") === 1.01`, `parseWeight("ST,GS,-0002.344kg") === -2.34` and `parseWeight("1,239 kg") === 1.24`.
