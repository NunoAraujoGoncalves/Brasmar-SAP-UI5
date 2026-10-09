import Log from "sap/base/Log";
import JSONModel from "sap/ui/model/json/JSONModel";

/* Port Settings */
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

    /** Verifica se browser suporta COM connection */
    public static isSupported(): boolean {
        return typeof navigator !== "undefined" && "serial" in navigator;
    }

    /**
     * Arredonda para 2 casas decimais (meio para longe do zero; EPSILON evita 1.005 -> 1.00)
     */
    public static round2(value: number): number {
        return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
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
                dataBits: Number(settings.dataBits) as 7 | 8 | undefined,
                stopBits: Number(settings.stopBits) as 1 | 2 | undefined,
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


    /** metodo trigger quando perde ligação */
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

    /** Gera os ids USB */
    private describePort(port: SerialPort, index: number): string {
        const { usbVendorId, usbProductId } = port.getInfo();
        const hex = (id?: number): string => (id ?? 0).toString(16).padStart(4, "0").toUpperCase();
        return usbVendorId !== undefined
            ? `${index + 1}: USB ${hex(usbVendorId)}:${hex(usbProductId)}`
            : `${index + 1}: Serial`;
    }

    /** vai buscar o indice da porta predefinida
     * consoante o seu id guardado
     */
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

    /** Load Settings Default se nao tiver nada em cache */
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

    /** Read local settings do browser */
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
        } catch (error) {
             // storage not available (private mode, policy): defaults are used next time
        }
    }
}

export default new SerialScale();