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
import SerialScale, { SerialScaleError, ScaleSendMode } from "../modules/SerialScale";
import WeighingDetector from "../modules/WeighingDetector";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ColumnListItem from "sap/m/ColumnListItem";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

/** Uma linha da tabela de pesagens do dialog Balanca */
type Pesagem = { PB: string; uom: string };

/** Entidades filhas da linha que recebem pesagens */
type PesagemNavigation = "_PesosUn" | "_Calibres";

/** Tempo máximo à espera de uma pesagem estável no botão por linha (Pesos Caixa) */
const ROW_WEIGHING_TIMEOUT_MS = 20000;

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQLinhaDetail extends Controller {
    formatter = new Formatter();
    editHelper: EditHelper;
    balancaDialog: Dialog;
    serialDialog: Dialog;
    currentPesoCollection: string;
    currentPesoUom: string;
    currentNavigation: PesagemNavigation;
    weighingDetector?: WeighingDetector;
    stopReading?: () => void;
    /** cancela a leitura pendente do botão por linha (Pesos Caixa) */
    cancelRowWeighing?: () => void;
    //testing
    iTimer: number | undefined;

    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetailLinha_footer_draftIndicator");
        const oPesosModel = new JSONModel({
            "PesosUn": [],
            "Calibres": [],
            "reading": false
        });
        this.getView()?.setModel(oPesosModel, "balanca");
        this.getView()?.setModel(SerialScale.model, "serial");
    }

    public onExit(): void {
        this.cancelRowWeighing?.();
        this.stopWeighing();
        this.editHelper.destroy();
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

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.doCalculations, {
                contexts: this.getContext(),
                label: this.getText("CQLinhaDetail.btn.Calcular")
            });
        } catch (error) { }

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

    /* ---------- Balança Config ---------- */
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

    /**
     * "Envio da balança" não é parâmetro da porta: pode mudar com a balança ligada e é guardado já.
     * Aplica-se na próxima vez que se carregar em "Começar Pesagens".
     */
    public onSerialSendModeChange(): void {
        SerialScale.persistSettings();
    }

    public onSerialClose(): void {
        this.serialDialog.close();
    }

    /* ---------- Balança por Linha ------------*/
    /**
     * Botão em cada linha da tabela Caixas: lê UMA pesagem estável da balança
     * e escreve-a no Pb dessa linha (draft). Depois pede os side effects do Pb (Pl, Declarado, Ple).
     */
    public async onPesoCxBalanca(oEvent: Button$PressEvent): Promise<void> {
        this.onPesoLinhaBalanca(oEvent, "Pb");
    }

    public async onPesoVidPlBalanca(oEvent: Button$PressEvent): Promise<void> {
        this.onPesoLinhaBalanca(oEvent, "Pl");
    }

    public async onPesoVidPleBalanca(oEvent: Button$PressEvent): Promise<void> {
        this.onPesoLinhaBalanca(oEvent, "Ple");
    }

    private async onPesoLinhaBalanca(oEvent: Button$PressEvent, landProperty: string): Promise<void> {
        const button = oEvent.getSource() as Button;
        const rowContext = button.getBindingContext() as Context | null | undefined;
        if (!rowContext || this.cancelRowWeighing || this.getBalancaModel().getProperty("/reading") === true) {
            return;
        }

        const model = this.getBalancaModel();
        model.setProperty("/reading", true); //Para desativar outros botoes de pesagem
        button.setBusyIndicatorDelay(0);
        button.setBusy(true);
        try {
            //1. Ler uma pesagem estável
            let weight: number; //= 2000.10;
            try {
                await SerialScale.ensureConnected();
                MessageToast.show(this.getText("BalancaLinha.msg.waiting"));
                weight = await this.readOneWeighing(ROW_WEIGHING_TIMEOUT_MS);
            } catch (error) {
                if (error instanceof SerialScaleError && error.code === "timeout") {
                    MessageBox.warning(this.getText("BalancaLinha.error.timeout", [String(ROW_WEIGHING_TIMEOUT_MS / 1000)]));
                } else if ((error as Error)?.message !== "cancelled") {
                    this.showSerialError(error);
                }
                return;
            }

            //2. Escrever o peso no Pb da linha + respetivos side effects
            const text = weight.toFixed(2);
            try {
                await rowContext.setProperty(landProperty, text);
                await this.editHelper.requestPropertySideEffects(rowContext, landProperty);
                MessageToast.show(this.getText("BalancaLinha.msg.done", [text]));
            } catch (error) {
                MessageBox.error(this.getText("BalancaLinha.error.write", [text]), {
                    details: String((error as Error)?.message ?? error)
                });
            }
        } finally {
            button.setBusy(false);
            model.setProperty("/reading", false);
        }
    }

    /* ---------- Balanças Functions ---------- */
    public async onBalancaBeforeOpen(): Promise<void> {
        const pesoTable = this.getView()?.byId("BalancaDialog_table") as Table;
        pesoTable.bindItems({
            model: "balanca",
            path: this.currentPesoCollection,
            template: new ColumnListItem({
                cells: [
                    new Input({
                        value: "{balanca>PB}",
                        description: "{balanca>uom}"
                    })
                ]
            })
        })
    }

    private async openBalancaDialog(collection: string, uomProperty: string, navigation: PesagemNavigation): Promise<void> {
        if (!this.balancaDialog) {
            this.balancaDialog = await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.Balanca",
                controller: this
            }) as Dialog;
            this.getView()?.addDependent(this.balancaDialog);
        }
        this.currentPesoCollection = collection;
        this.currentPesoUom = uomProperty;
        this.currentNavigation = navigation;
        this.balancaDialog.open();
    }

    public async onPesoUnBalanca(oEvent: Button$PressEvent): Promise<void> {
        await this.openBalancaDialog("balanca>/PesosUn", "UnUom", "_PesosUn");
    }

    public async onPesoCalibreBalanca(oEvent: Button$PressEvent): Promise<void> {
        await this.openBalancaDialog("balanca>/Calibres", "CalibreUom", "_Calibres");
    }

    public async onPressCloseDialog(oEvent: Button$PressEvent): Promise<void> {
        this.balancaDialog.close();
    }


    /** Test function com pesos ficticios para testar outras fms sem balanca */
    public async onTestStart(oEvent: Button$PressEvent): Promise<void> {
        let pesoTeste = 200;
        this.getBalancaModel().setProperty("/reading", true);

        this.iTimer = setInterval(() => {
            this.addPesagem(pesoTeste, "G");
            pesoTeste += 105;
        }, 1000);
    }

    /**
     * Começar Pesagens: liga à balança (se ainda não estiver ligada, com a última porta/parâmetros
     * guardados) e passa a adicionar uma linha por cada produto pesado.
     */
    public async onPressBalancaStart(oEvent: Button$PressEvent): Promise<void> {
        if (this.stopReading) {
            return;
        }
        try {
            await SerialScale.ensureConnected();
        } catch (error) {
            this.showSerialError(error);
            return;
        }

        const uom = 'G';
        const mode = SerialScale.model.getProperty("/settings/sendMode") as ScaleSendMode;
        this.weighingDetector = new WeighingDetector((weight) => this.addPesagem(weight, uom), { mode });
        this.stopReading = SerialScale.subscibe(
            (reading) => this.weighingDetector?.push(reading.weight),
            () => {
                this.stopWeighing();
                MessageToast.show(this.getText("BalancaDialog.msg.disconnected"));
            }
        );
        this.getBalancaModel().setProperty("/reading", true);
    }

    public async onPressBalancaEnd(oEvent: Button$PressEvent): Promise<void> {
        this.stopWeighing();
    }

    /** Fechar o dialog (incluindo com Esc) termina a sessão de pesagens */
    public onBalancaAfterClose(): void {
        this.stopWeighing();
    }

    /**
     * OK: cria as pesagens do dialog como linhas filhas da linha atual (draft),
     * em _PesosUn ou _Calibres consoante o botão que abriu o dialog.
     * Só fecha o dialog se todas forem gravadas; as que falharem ficam para tentar de novo.
     */
    public async onPressOkayDialog(oEvent: Button$PressEvent): Promise<void> {
        const model = this.getBalancaModel();
        const path = this.currentPesoCollection.replace(/^balanca>/, "");
        const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
        if (rows.length === 0) {
            this.balancaDialog.close();
            return;
        }

        // 1. validar tudo antes de gravar (os pesos podem ter sido corrigidos à mão no dialog)
        const weights = rows.map((row) => this.toWeightString(row.PB));
        const invalidIndex = weights.findIndex((weight) => weight === undefined);
        if (invalidIndex >= 0) {
            MessageBox.error(this.getText("BalancaDialog.error.invalidWeight", [String(invalidIndex + 1), String(rows[invalidIndex].PB ?? "")]));
            return;
        }

        const context = this.getContext();
        const navigation = this.currentNavigation;
        this.balancaDialog.setBusy(true);
        try {
            // 2. o backend permite criar filhos nesta linha? (InsertRestrictions -> __CreateByAssociationControl)
            const insertable = await context.requestProperty(`__CreateByAssociationControl/${navigation}`);
            if (insertable === false) {
                MessageBox.error(this.getText("BalancaDialog.error.notInsertable"));
                return;
            }

            // 3. criar: binding proprio relativo á linha; o grupo $auto envia tudo num só $batch
            const binding = context.getModel().bindList(navigation, context, undefined, undefined, {
                $$ownRequest: true
            }) as ODataListBinding;
            const results = await Promise.allSettled(rows.map((row, index) =>
                binding.create(this.toEntityData(navigation, weights[index]!, row), true).created() ?? Promise.resolve()
            ));
            binding.destroy();

            const failed = rows.filter((_row, index) => results[index].status === "rejected");
            const createdCount = rows.length - failed.length;

            // 4. Refresh á tabela
            if (createdCount > 0) {
                await context.requestSideEffects([{ $NavigationPropertyPath: navigation }]);
            }

            //5. Dialog fica com pesagens com erros
            model.setProperty(path, failed);
            if (failed.length === 0) {
                MessageToast.show(this.getText("BalancaDialog.msg.created", [String(createdCount)]));
                this.balancaDialog.close()
            } else {
                const reasons = results
                    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                    .map((result) => String((result.reason as Error)?.message ?? result.reason));
                MessageBox.error(this.getText("BalancaDialog.error.createFailed", [String(failed.length)]),
                    { details: reasons.join("\n") });
            }
        } catch (error) {
            MessageBox.error(this.getText("BalancaDialog.error.createFailed", [String(rows.length)]), {
                details: String((error as Error)?.message ?? error)
            });
        } finally {
            this.balancaDialog.setBusy(false);
        }
    }


    public async onPressBalancaDelete(oEvent: Button$PressEvent): Promise<void> {
        const oTable = this.getView()?.byId("BalancaDialog_table") as Table;
        const selectedLines = oTable.getSelectedContexts();
        const model = this.getBalancaModel();
        const path = this.currentPesoCollection.replace(/^balanca>/, "");
        const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];

        if (!selectedLines.length) { return; }

        const selectedIndex = selectedLines
            .map((context) => {
                return parseInt(context.getPath().split("/").pop() ?? "", 10);
            })
            .sort((a, b) => { return b - a; });

        selectedIndex.forEach((index) => {
            rows.splice(index, 1);
        });

        model.setProperty(path, rows);
        oTable.removeSelections(true);
    }


    /* ---------- Footer Functions ---------- */
    public async onApply(): Promise<void> {
        await this.onCalcular();
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
    private round2(value: number): number {
        return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
    }

    private getContext(): Context {
        return this.getView()!.getBindingContext() as Context;
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }

    private getBalancaModel(): JSONModel {
        return this.getView()!.getModel("balanca") as JSONModel;
    }

    /** Acrescenta uma pesagem (2 casas decimais) à coleção atual do dialog */
    private addPesagem(weight: number, uom: string): void {
        const model = this.getBalancaModel();
        const path = this.currentPesoCollection.replace(/^balanca>/, "");
        const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
        model.setProperty(path, [...rows, { PB: weight.toFixed(2), uom }]);
    }

    /**
     * Espera pela PRIMEIRA pesagem estável (mesmas regras do dialog: WeighingDetector com o
     * "Envio da balança" configurado). Limpa sempre subscrição, detector e timer.
     * Rejeita com SerialScaleError("timeout" | "notConnected") ou Error("cancelled") (saída da página).
     */
    private readOneWeighing(timeoutMs: number): Promise<number> {
        const mode = SerialScale.model.getProperty("/settings/sendMode") as ScaleSendMode;
        return new Promise<number>((resolve, reject) => {
            let done = false;
            let unsubscribe: (() => void) | undefined;

            const finish = (settle: () => void): void => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timer);
                unsubscribe?.();
                detector.destroy();
                this.cancelRowWeighing = undefined;
                settle();
            };

            const detector = new WeighingDetector((weight) => finish(() => resolve(weight)), { mode });
            const timer = setTimeout(() => finish(() => reject(new SerialScaleError("timeout"))), timeoutMs);
            this.cancelRowWeighing = () => finish(() => reject(new Error("cancelled")));

            try {
                unsubscribe = SerialScale.subscibe(
                    (reading) => detector.push(reading.weight),
                    () => finish(() => reject(new SerialScaleError("notConnected")))
                );
            } catch (error) {
                finish(() => reject(error));
            }
        });
    }


    /**
     * Peso do dialog -> string Edm.Decimal com 2 casas ("12,5" -> "12.50").
     * undefined = vazio, não numérico ou <= 0.
     */
    private toWeightString(value: unknown): string | undefined {
        const text = String(value ?? "").trim().replace(",", ".");
        const number = Number(text);
        if (text === "" || !Number.isFinite(number) || number <= 0) {
            return undefined;
        }
        return this.round2(number).toFixed(2);
    }

    /**
     * Dialog Pesos para Odata Pesos da chamada
     */
    private toEntityData(navigation: PesagemNavigation, weight: string, row: Pesagem): Record<string, string> {
        if (navigation === "_Calibres") {
            return row.uom ? { Medicao: weight, UomInternal: row.uom } : { Medicao: weight, UomInternal: "G" };
        }
        return row.uom ? { Pb: weight, Uom: row.uom } : { Pb: weight, Uom: "G" }
    }


    private stopWeighing(): void {
        this.stopReading?.();
        this.stopReading = undefined;
        this.weighingDetector?.destroy();
        this.weighingDetector = undefined;
        this.getBalancaModel()?.setProperty("/reading", false);

        if (this.iTimer) {
            clearInterval(this.iTimer);
            this.iTimer = undefined;
        }
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