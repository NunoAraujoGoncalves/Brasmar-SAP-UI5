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
import DynamicPage from "sap/f/DynamicPage";
import Text from "sap/m/Text";
import MultiInstance, { AmostraRouteArguments } from "../modules/MultiInstance";
import TabContainer, { TabContainer$ItemCloseEvent, TabContainer$ItemSelectEvent } from "sap/m/TabContainer";
import TabContainerItem from "sap/m/TabContainerItem";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";

/** Uma linha da tabela de pesagens do dialog Balanca */
type Pesagem = { PB: string; uom: string; PesoDeclarado?: string };

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
    //amostra do separador selecionado
    currentAmostraPath?: string;

    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetailLinha_footer_draftIndicator");
        const oPesosModel = new JSONModel({
            "PesosUn": [],
            "Calibres": [],
            "reading": false,
            "showDeclarado": false,
            "Untara": 0,
            "Teorvidragem": 0
        });
        this.getView()?.setModel(oPesosModel, "balanca");
        this.getView()?.setModel(SerialScale.model, "serial");

        // separadores de amostras (TabContainer) partilhados com o CQDetail
        this.getView()?.setModel(MultiInstance.model, "multi");
        this.getView()?.attachModelContextChange(this.onAmostraContextChange, this);
        // sempre que os separadores são recriados (alteração em multi>/tabs) o TabContainer perderia a seleção
        // e, ao renderizar, selecionaria o 1º separador (itemSelect sem clique): repõe-se o separador da amostra atual
        const tabs = this.byId("CQDetailLinha_multi_tabs") as TabContainer;
        tabs.getBinding("items")?.attachChange(this.syncAmostraTab, this);
        this.syncAmostraTab();

        this.getAppComponent().getRouter().getRoute(MultiInstance.ROUTE)?.attachPatternMatched(this.onAmostraRouteMatched, this)
    }

    public onExit(): void {
        this.getView()?.detachModelContextChange(this.onAmostraContextChange, this);
        this.getAppComponent().getRouter().getRoute(MultiInstance.ROUTE)?.detachPatternMatched(this.onAmostraRouteMatched, this)
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

    public async onGetMp(): Promise<void> {
        const page = this.byId("CQDetailLinha_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.getMp, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.amostragens.subsection.mps.btn.getMp")
            })
        } catch (error) { }

        page.setBusy(false);
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
            const text = (weight * 1000).toFixed(2);
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
                        description: "{balanca>uom}",
                        valueLiveUpdate: true
                    }),
                    new Text({
                        text: {
                            parts: ["balanca>PB", "balanca>/Untara", "balanca>/Teorvidragem", "balanca>uom"],
                            formatter: (pb: unknown, tara: number, teor: number, uom: string) => this.formatPleDeclarado(pb, tara, teor, uom)
                        }
                    }),
                    new Input({
                        value: "{balanca>PesoDeclarado}",
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

        const model = this.getBalancaModel();
        const showDeclarado = navigation === "_PesosUn";
        model.setProperty("/showDeclarado", showDeclarado);
        if (showDeclarado) {
            const [tara, taraUom, teor] = await this.getContext().requestProperty(["Untara", "Unuompeso", "Teorvidragem"]) as unknown[];
            model.setProperty("/Untara", this.toGrams(tara, taraUom));
            model.setProperty("/Teorvidragem", Number(teor ?? 0) || 0);
        }

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
        let pesoTeste = 0.200;
        this.getBalancaModel().setProperty("/reading", true);

        this.iTimer = setInterval(() => {
            this.addPesagem(pesoTeste, "G");
            pesoTeste += 0.105;
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
        const navigation = this.currentNavigation;
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

        //1.b Validar Pesos Declarados
        const isEmpty = (value: unknown): boolean => String(value ?? "").trim() === "";
        const declarados = rows.map((row) =>
            navigation === "_PesosUn" && !isEmpty(row.PesoDeclarado) ? this.toWeightString(row.PesoDeclarado) : undefined);
        const invalidDeclarado = rows.findIndex((row, index) =>
            navigation === "_PesosUn" && !isEmpty(row.PesoDeclarado) && declarados[index] === undefined);
        if (invalidDeclarado >= 0) {
            MessageBox.error(this.getText("BalancaDialog.error.invalidPesoDeclarado", [String(invalidDeclarado + 1), String(rows[invalidDeclarado].PesoDeclarado ?? "")]));
            return;
        }

        const context = this.getContext();
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
                binding.create(this.toEntityData(navigation, weights[index]!, row, declarados[index]), true).created() ?? Promise.resolve()
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

    /* ---------- Multi-instância (separadores de amostras) ---------- */
    /**
     * A página foi ligada a outra amostra (separador, criação ou navegação normal):
     * sincroniza os separadores e limpa o estado da Balança que pertencia à amostra anterior.
     */
    private onAmostraContextChange(): void {
        const context = this.getView()?.getBindingContext() as Context | null | undefined;
        const path = context?.getPath();
        if (!context || !path || path === this.currentAmostraPath) {
            return;
        }
        this.currentAmostraPath = path;

        //Limpa pesagens por grabar
        this.cancelRowWeighing?.();
        this.stopWeighing();
        this.getBalancaModel().setProperty("/PesosUn", []);
        this.getBalancaModel().setProperty("/Calibres", []);

        //a Linha faz parte da chave
        MultiInstance.ensure(path, MultiInstance.linhaOf(path));
        this.selectAmostraTab(path);
    }

    private onAmostraRouteMatched(oEvent: Route$PatternMatchedEvent): void {
        MultiInstance.fromRoute(oEvent.getParameter("arguments") as AmostraRouteArguments);
        this.syncAmostraTab();
    }

    /** Clique num separador: liga a página a essa amostra (FE refaz o binding de toda a página)
     * O TabContainer também dispara itemSelect sem clique (setSelectedItem programático e seleção por defeito
     * no onBeforeRendering, quando a página pode ainda não ter contexto). Por isso compara-se com o
     * separador selecionado no modelo "multi" e não com o contexto da view. 
     */
    public onAmostraTabSelect(oEvent: TabContainer$ItemSelectEvent): void {
        const item = oEvent.getParameter("item") as TabContainerItem | null;
        const path = item?.getKey();
        const selectedPath = MultiInstance.getSelectedPath();
        if (!path || !selectedPath || path === selectedPath) {
            return;
        }
        this.navigateToPath(path);
    }

    /** Volta a marcar no TabContainer o separador da amostra atual (depois de os separadores serem recriados) */
    private syncAmostraTab(): void {
        const selectedPath = MultiInstance.getSelectedPath();
        if (selectedPath) {
            this.selectAmostraTab(selectedPath);
        }
    }

    /**
     * Botão fechar do separador: tira a amostra dos separadores (NÃO a apaga).
     * Fechar o último separador volta à página do CQ.
     */
    public onAmostraTabClose(oEvent: TabContainer$ItemCloseEvent): void {
        oEvent.preventDefault(); // os separadores vêm do modelo "multi": é lá que se remove
        const path = (oEvent.getParameter("item") as TabContainerItem).getKey();
        const next = MultiInstance.remove(path);

        if (next === undefined) {
            const cabPath = MultiInstance.getCabPath(path);
            if (cabPath) {
                this.navigateToPath(cabPath);
            }
            return;
        }

        //navega sempre
        this.navigateToPath(next);
    }

    /**
     * "+" do TabContainer (só em edição): cria uma amostra nova no CQ (draft) e abre-a num separador novo.
     * Mesmo padrão de criação que onPressOkayDialog (binding próprio + created()).
     */
    public async onAmostraAdd(): Promise<void> {
        const context = this.getContext();
        const cabPath = MultiInstance.getCabPath(context.getPath());
        if (!cabPath) {
            return;
        }

        const tabs = this.byId("CQDetailLinha_multi_tabs") as TabContainer;
        tabs.setBusyIndicatorDelay(0);
        tabs.setBusy(true);
        const model = context.getModel();
        const cabBinding = model.bindContext(cabPath);
        try {
            // 1. o backend permite criar amostras neste CQ? (InsertRestrictions -> __CreateByAssociationControl)
            const cabContext = cabBinding.getBoundContext() as Context;
            const insertable = await cabContext.requestProperty("__CreateByAssociationControl/_linhas");
            if (insertable === false) {
                MessageBox.error(this.getText("multiInstance.error.notInsertable"));
                return;
            }

            // 2. criar a amostra (a Linha é numerada pelo backend)
            const binding = model.bindList("_linhas", cabContext, undefined, undefined, {
                $$ownRequest: true
            }) as ODataListBinding;
            const created = binding.create({}, true);
            await created.created();
            const path = created.getPath();
            const linha = String(created.getProperty("Linha") ?? "");
            binding.destroy();

            // 3. novo separador + tabela de amostras do CQ atualizada + abrir a amostra
            MultiInstance.add(path, linha);
            MultiInstance.refreshAmostras?.();
            MessageToast.show(this.getText("multiInstance.msg.created", [linha]));
            this.navigateToPath(path);
        } catch (error) {
            MessageBox.error(this.getText("multiInstance.error.create"), {
                details: String((error as Error)?.message ?? error)
            });
        } finally {
            cabBinding.destroy();
            tabs.setBusy(false);
        }
    }

    /* ---------- Footer Functions ---------- */
    /** Aplicar: calcula todas as amostras abertas nos separadores e volta ao CQ */
    public async onApply(): Promise<void> {
        const oContainer = this.getView()?.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
        oContainer.setBusy(true);

        const current = this.getContext();
        const model = current.getModel();
        const paths = MultiInstance.getPaths().filter((path) => path !== current.getPath());
        const editFlow = this.getExtensionAPI().getEditFlow();
        const label = this.getText("CQLinhaDetail.btn.Calcular");
        try {
            await editFlow.invokeAction(Actions.doCalculations, { contexts: current, label });

            for (const path of paths) {
                const binding = model.bindContext(path);
                try {
                    const context = binding.getBoundContext() as Context;
                    await context.requestObject();
                    await editFlow.invokeAction(Actions.doCalculations, { contexts: context, label });
                } finally {
                    binding.destroy();
                }
            }
        } catch (error) { }
        oContainer.setBusy(false);
        await this.getExtensionAPI().getEditFlow().applyDocument(current);
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
    private formatPleDeclarado(pb: unknown, tara: number, teor: number, uom: string): string {
        const weight = this.toWeightString(pb);
        if (weight === undefined) {
            return "";
        }
        const pl = Number(weight) - (tara ?? 0);
        const ple = pl - (pl * (teor ?? 0) / 100);
        return `${this.round2(ple).toFixed(2)} ${uom ?? ""}`.trim();
    }

    private toGrams(value: unknown, uom: unknown): number {
        const number = Number(value ?? 0);
        if (!Number.isFinite(number)) {
            return 0;
        }
        return String(uom ?? "").toUpperCase() === "KG" ? number * 1000 : number;
    }

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


    /** 
     * Navega (routing FE) para a amostra / CQ com este caminho OData
     * Para uma amostra o URL leva os separadores abertos (?amostras=...), para o refresh / link colado.
     */
    private navigateToPath(path: string): void {
        const parameters = MultiInstance.getRouteParameters(path);
        if (parameters) {
            void this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters);
            return;            
        }
        //CQ Fecha o ultimo
        const binding = this.getContext().getModel().bindContext(path);
        this.getExtensionAPI().getRouting().navigate(binding.getBoundContext() as  Context);
    }


    /** Marca no TabContainer o separador da amostra com este caminho */
    private selectAmostraTab(path: string): void {
        const tabs = this.byId("CQDetailLinha_multi_tabs") as TabContainer | undefined;
        const item = tabs?.getItems().find((tab) => tab.getKey() === path);
        if (tabs && item) {
            tabs.setSelectedItem(item);
        }
    }


    /** Acrescenta uma pesagem (2 casas decimais) à coleção atual do dialog */
    private addPesagem(weight: number, uom: string): void {
        const model = this.getBalancaModel();
        const path = this.currentPesoCollection.replace(/^balanca>/, "");
        const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
        model.setProperty(path, [...rows, { PB: (weight * 1000).toFixed(2), uom, PesoDeclarado: "" }]);
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
    private toEntityData(navigation: PesagemNavigation, weight: string, row: Pesagem, pesoDeclarado?: string): Record<string, string> {
        if (navigation === "_Calibres") {
            return row.uom ? { Medicao: weight, UomInternal: row.uom } : { Medicao: weight, UomInternal: "G" };
        }
        const data: Record<string, string> = row.uom ? { Pb: weight, Uom: row.uom } : { Pb: weight, Uom: "G" };
        if (pesoDeclarado !== undefined) {
            data.PesoDeclarado = pesoDeclarado;
        }
        return data;
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