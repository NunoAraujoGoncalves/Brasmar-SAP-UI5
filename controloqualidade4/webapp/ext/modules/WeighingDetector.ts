import type { ScaleSendMode } from "./SerialScale";

export type WeighingDetectorOptions = {
    /** Modo da balança enviar os pesos */
    mode: ScaleSendMode;
    /** continuuous: leituras iguais seguidas para considerar o peso estável */
    stableFrames: number;
    /** abaixo deste peso a balança está "vazia": arma a próxima pesagem */
    minWeight: number;
    /** continuous: silêncio (ms) depois de uma leitura = valor único (rede de segurança p/ balanças de 1 valor) */
    silenceMs: number;
    /** perWeighing: o mesmo valor repetido dentro deste intervalo (ms) é a mesma pesagem */
    duplicateMs: number;
};

export const DEFAULT_DETECTOR_OPTIONS: WeighingDetectorOptions = {
    mode: "continuous",
    stableFrames: 3,
    minWeight: 0.05,
    silenceMs: 1000,
    duplicateMs: 500
};


/**
 * Transforma as leituras da balança em pesagens (uma por produto).
 *
 * - continuous (várias leituras por segundo): regista quando o peso estabiliza
 *   (stableFrames leituras iguais, >= minWeight) e só volta a registar depois de a balança ficar vazia.
 *   Rede de segurança: uma leitura seguida de silenceMs sem leituras também é registada
 *   (balanças de um só valor configuradas por engano como contínuas).
 * - perWeighing (a balança envia sozinha um valor quando estável, ou na tecla imprimir):
 *   cada valor recebido é uma pesagem, registada de imediato; repetições em duplicateMs são ignoradas.
 */
export default class WeighingDetector {
    private readonly options: WeighingDetectorOptions;
    private readonly onWeighing: (weight: number) => void
    //Continuous
    private lastWeight?: number;
    private sameCount = 0;
    private armed = true;
    private silenceTimer?: ReturnType<typeof setTimeout>;
    //perWeighting
    private lastRegistered?: number;
    private lastRegisteredAt = 0;

    constructor(onWeighing: (weight: number) => void, options: Partial<WeighingDetectorOptions> = {}) {
        this.onWeighing = onWeighing;
        this.options = { ...DEFAULT_DETECTOR_OPTIONS, ...options };
    }

    /** Uma leitura da balança (já arredondada a 2 casas decimais) */
    public push(weight: number, now: number = Date.now()): void {
        //balança vazia / tara: nunca é uma pesagem, prepara a próxima
        if (Math.abs(weight) < this.options.minWeight) {
            this.reset();
            return;
        }

        if (this.options.mode === "perWeighing") {
            this.pushPerWeighing(weight, now);
        } else {
            this.pushContinuous(weight);
        }
    }


    public reset(): void {
        this.clearSilenceTimer();
        this.armed = true;
        this.lastWeight = undefined;
        this.sameCount = 0;
        this.lastRegistered = undefined;
        this.lastRegisteredAt = 0;
    }

    public destroy(): void {
        this.clearSilenceTimer();
    }


    /** A balança já decidiu que a pesagem terminou: regista já (exceto repetições da mesma linha) */
    private pushPerWeighing(weight: number, now: number): void {
        if (weight === this.lastRegistered && now - this.lastRegisteredAt < this.options.duplicateMs) {
            return;
        }
        this.lastRegistered = weight;
        this.lastRegisteredAt = now;
        this.onWeighing(weight);
    }


    /** Leituras contínuas: espera pelo peso estável e regista uma vez por produto */
    private pushContinuous(weight: number): void {
        this.clearSilenceTimer();

        this.sameCount = weight === this.lastWeight ? this.sameCount + 1 : 1;
        this.lastWeight = weight;

        if (this.armed && this.sameCount >= this.options.stableFrames) {
            this.register(weight);
        }

        // sem mais leituras durante silenceMs: valor único (ou a balança parou de enviar)
        this.silenceTimer = setTimeout(() => {
            this.silenceTimer = undefined;
            if (this.armed) {
                this.register(weight);
            }
            this.armed = true;
            this.lastWeight = undefined;
            this.sameCount = 0;
        }, this.options.silenceMs);
    }


    private register(weight: number) {
        this.armed = false;
        this.onWeighing(weight);
    }


    private clearSilenceTimer(): void {
        if (this.silenceTimer !== undefined) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = undefined;
        }
    }
}