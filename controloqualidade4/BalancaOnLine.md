# BalancaOnLine: per-row "read weight" button in the Caixas table (`CQDetailLinha_PesoCX_table`)

## Context
On `CQLinhaDetail`, the **Caixas** table (`macros:Table id="CQDetailLinha_PesoCX_table"`, `metaPath="_PesosCX/@UI.LineItem"`, [CQLinhaDetail.view.xml:1173](controloqualidade4/webapp/ext/view/CQLinhaDetail.view.xml#L1173)) lists the line's box weights (`CQPesosCxType`). The user wants a new column with **the same button on every row**. Pressing it reads **one** weight from the scale and writes it into that row's **`Pb`** (Peso Bruto).

What the metadata says (`localService/mainService/metadata.xml`):
- **`Pb` is writable** (`Edm.Decimal(13,3)`, unit `Uom`). `Pl` and `Cx` are `Core.Computed`.
- **Changing `Pb` triggers a side effect:** `CQPesosCxType` has `Common.SideEffects#SAP__Field_Pb`, which recalculates `Declarado`, `Pl` and `Ple`. When a user edits `Pb` in the table, Fiori Elements requests it automatically. A value written **from code** with `context.setProperty` doesn't trigger it, so the code must request it explicitly.
- **Column order in the `UI.LineItem`:** `Pb`, `Pl`, `Declarado`, `Ple`. The Fiori Elements key of the first column is **`DataField::Pb`**, so the new column is anchored **before** it (`placement="Before"`).

**Intended outcome:**
- **Edit mode only:** each row shows a scale button in a new column right before **Peso Bruto**. Writing `Pb` only makes sense in the draft.
- **Press:**
  1. connect if needed (with the saved port and settings, through `SerialScale.ensureConnected()`);
  2. show "Coloque a caixa na balança…";
  3. wait for **one stable weighing** using the configured "Envio da balança" mode;
  4. write it into `Pb` with 2 decimals;
  5. request the `Pb` side effects, so `Pl`, `Declarado` and `Ple` update in the same row.
- **One reading at a time:** while a row is waiting, every row button (and **Começar Pesagens** in the weighing dialog) is disabled through the existing `balanca>/reading` flag, and the pressed button shows a busy indicator.
- **No weighing within 20 s:** a warning appears and nothing is written.

### Why not `SerialScale.readNext()`
`readNext()` returns the **next frame**. On a continuous scale that can be an unstable value while the box is still settling. The row button reuses the `WeighingDetector` that the weighing dialog uses, so both features apply the same rules:
- **"Contínuo":** the first weight that is stable for 3 readings. A box already resting on the scale is read at once.
- **"Um valor por pesagem":** the next value the scale sends by itself when stable, or when its print key is pressed.

## Approach
1. **View:** add `<macros:columns>` with one `macros:Column` to `CQDetailLinha_PesoCX_table`:
   - `key="balancaPb"`, `anchor="DataField::Pb"`, `placement="Before"`;
   - the template is an `sap.m.Button`, `press=".onPesoCxBalanca"`;
   - `visible="{ui>/isEditable}"`, `enabled="{= !${balanca>/reading} }"`.
   - The button's binding context is the row context, so the handler knows which row to write.
2. **`EditHelper.ts`:** move the body of `requestSideEffects(control)` into a new public **`requestPropertySideEffects(context, property)`**, and have `requestSideEffects(control)` call it. The behaviour for input fields is unchanged, and code that writes a property directly can now request the same side effects.
3. **`CQLinhaDetail.controller.ts`:**
   - **`onPesoCxBalanca(oEvent)`** gets the row context from the button, then connects, reads one weighing, does `await rowContext.setProperty("Pb", "12.35")`, which sends a PATCH through `$auto` to the draft row, and finally `await this.editHelper.requestPropertySideEffects(rowContext, "Pb")`.
   - **`readOneWeighing(timeoutMs)`** subscribes to `SerialScale`, feeds a `WeighingDetector`, and resolves with the **first** weighing. It always cleans up the subscription, the detector and the timer, whether it ended by success, timeout, disconnect or leaving the page.
   - **`cancelRowWeighing`** lets `onExit` cancel a pending reading.
   - **Errors:** scale and connection errors go through the existing `showSerialError`. A timeout gets its own message, because the existing one mentions 5 seconds. A failed PATCH (backend rejects the value) gets a "write" error with the backend message.
4. **i18n:** 6 new keys.

**Overwriting:** the button overwrites an existing `Pb` without asking, because the user pressed it on that row on purpose. The previous value is still in the draft history only until the next change. If a confirmation is wanted when `Pb` is already greater than 0, add a `MessageBox.confirm` before step 3.

## Files
| File | Change |
|---|---|
| `controloqualidade4/webapp/ext/view/CQLinhaDetail.view.xml` | Line 1173: the `macros:Table` gets `<macros:columns>` |
| `controloqualidade4/webapp/ext/modules/EditHelper.ts` | The side-effects section is split into `requestSideEffects` and `requestPropertySideEffects` (section below) |
| `controloqualidade4/webapp/ext/view/CQLinhaDetail.controller.ts` | `onPesoCxBalanca`, `readOneWeighing`, `cancelRowWeighing` (full source below) |
| `controloqualidade4/webapp/i18n/i18n.properties` | 6 `BalancaLinha.*` keys |

## 1. `CQLinhaDetail.view.xml`: line 1173 becomes

```xml
<macros:Table id="CQDetailLinha_PesoCX_table" header="{i18n>CQLinhaDetail.PesoCX.title}" metaPath="_PesosCX/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <!-- botão por linha: lê um peso da balança e escreve-o no Pb dessa caixa -->
        <macros:Column key="balancaPb" header="{i18n>BalancaLinha.column}" anchor="DataField::Pb" placement="Before" width="5rem" importance="High">
            <Button id="CQDetailLinha_PesoCX_btn_balanca" icon="sap-icon://compare-2" type="Transparent"
                tooltip="{i18n>BalancaLinha.tooltip}"
                press=".onPesoCxBalanca"
                visible="{ui>/isEditable}"
                enabled="{= !${balanca>/reading} }"/>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

How this works:
- **Column content:** the content of a `macros:Column` is the cell template. Fiori Elements clones it for every row and gives each clone that row's binding context, and the `id` gets a clone suffix.
- **Handler:** `.onPesoCxBalanca` resolves to the page controller, like the other handlers in this view.
- **Models:** `balanca` and `ui` are view models, so the cells inherit them.
- **Visibility:** in display mode the button is hidden, and the column stays empty.

## 2. `EditHelper.ts`: replace the `/* ---------- side effects ---------- */` section

Only this section changes, and the rest of the file stays as it is. The file is about 690 lines with your value-help code, so only the replaced block is shown, not the whole file. Replace from `/* ---------- side effects ---------- */` up to (not including) `/* ---------- messages ---------- */` with:

```ts
    /* ---------- side effects ---------- */
    public async requestSideEffects(control: Control): Promise<void> {
        const binding = this.getPropertyBinding(control, "value")
            ?? this.getPropertyBinding(control, "selectedKey")
            ?? this.getPropertyBinding(control, "state");

        const context = control.getBindingContext() as Context | null | undefined;
        const property = binding?.getPath();   // string | null
        if (!context || !property) {
            return;
        }

        await this.requestPropertySideEffects(context, property);
    }

    /**
     * Side effects de uma propriedade de uma entidade (SideEffects#SAP__Field_<propriedade> + descrição Common.Text).
     * Usado pelos campos de input e também quando o código escreve a propriedade diretamente
     * (p.e. Pb lido da balança com context.setProperty, que não dispara side effects sozinho).
     */
    public async requestPropertySideEffects(context: Context, property: string): Promise<void> {
        const metaModel = (context.getModel() as ODataModel).getMetaModel();
        const entityMetaPath = metaModel.getMetaPath(context.getPath());

        // backend side effect for the field (if any) and the field's description property (Common.Text)
        const [sideEffects, textPath] = await Promise.all([
            metaModel.requestObject(`${entityMetaPath}/${COMMON}.SideEffects#SAP__Field_${property}`) as Promise<SideEffectsAnnotation | undefined>,
            metaModel.requestObject(`${entityMetaPath}/${property}${COMMON}.Text/$Path`) as Promise<string | undefined>
        ]);

        const targets: ({ $PropertyPath: string } | { $NavigationPropertyPath: string })[] = [
            ...(sideEffects?.TargetProperties ?? []).map((p) => ({ $PropertyPath: typeof p === "string" ? p : p.$PropertyPath })),
            ...(sideEffects?.TargetEntities ?? []).map((n) => ({ $NavigationPropertyPath: n.$NavigationPropertyPath ?? "" }))
        ];

        // the description (e.g. Marca -> MarcaDesc) is filled by the backend, but most fields have no
        // SideEffects annotation, so ask for it explicitly
        if (textPath && !targets.some((t) => "$PropertyPath" in t && t.$PropertyPath === textPath)) {
            targets.push({ $PropertyPath: textPath });
        }

        if (targets.length > 0) {
            await context.requestSideEffects(targets);
        }
    }
```

For `CQPesosCxType/Pb` this resolves to `requestSideEffects([{ $PropertyPath: "Declarado" }, { $PropertyPath: "Pl" }, { $PropertyPath: "Ple" }])` on the row context.

## 3. Full source: `webapp/ext/view/CQLinhaDetail.controller.ts`

Changes compared with your current file:
- **New constant** `ROW_WEIGHING_TIMEOUT_MS`.
- **New field** `cancelRowWeighing`, and `onExit` now calls `this.cancelRowWeighing?.()`.
- **New section** "Balança por linha (Pesos Caixa)" with `onPesoCxBalanca`, plus the private helper `readOneWeighing`.
- **Unchanged:** everything else, including your `toEntityData`, `round2`, `onTestStart` and the existing imports.

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
import SerialScale, { SerialScaleError, ScaleSendMode } from "../modules/SerialScale";
import WeighingDetector from "../modules/WeighingDetector";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ColumnListItem from "sap/m/ColumnListItem";
import TableAPI from "sap/fe/macros/table/TableAPI";
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

    /* ---------- Balança por linha (Pesos Caixa) ---------- */

    /**
     * Botão em cada linha da tabela Caixas: lê UMA pesagem estável da balança
     * e escreve-a no Pb dessa linha (draft). Depois pede os side effects do Pb (Pl, Declarado, Ple).
     */
    public async onPesoCxBalanca(oEvent: Button$PressEvent): Promise<void> {
        const button = oEvent.getSource() as Button;
        const rowContext = button.getBindingContext() as Context | null | undefined;
        if (!rowContext || this.cancelRowWeighing || this.getBalancaModel().getProperty("/reading") === true) {
            return;
        }

        const model = this.getBalancaModel();
        model.setProperty("/reading", true);     // desativa os botões de todas as linhas e o "Começar Pesagens"
        button.setBusyIndicatorDelay(0);
        button.setBusy(true);
        try {
            // 1. ler uma pesagem estável
            let weight: number;
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

            // 2. escrever no Pb da linha (PATCH no draft) + side effects do Pb
            const text = weight.toFixed(2);
            try {
                await rowContext.setProperty("Pb", text);
                await this.editHelper.requestPropertySideEffects(rowContext, "Pb");
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
                MessageToast.show(this.getText("BalancaDialog.msg.disconnect"));
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
```

Two things in your current file that this plan doesn't change, but you may want to fix:
- **Toast key:** `onPressBalancaStart` still shows `BalancaDialog.msg.disconnect`, but the i18n key is `BalancaDialog.msg.disconnected`. See [BalancaOkayPlan.md](BalancaOkayPlan.md).
- **`toEntityData` sends `Uom` for PesosUn,** but `CQPesosUnType/Uom` is `Core.Computed`. If the backend rejects or ignores it, send only `{ Pb }`.

## 4. `i18n.properties`: new block (after `#Balanca Pesos Fragment`)

```properties

#Balança por linha (tabela Caixas)
BalancaLinha.column=Balança
BalancaLinha.tooltip=Ler o peso bruto desta caixa da balança
BalancaLinha.msg.waiting=Coloque a caixa na balança…
BalancaLinha.msg.done=Peso bruto atualizado: {0}
BalancaLinha.error.timeout=Não foi lido nenhum peso estável em {0} segundos. Verifique se a caixa está na balança e tente novamente.
BalancaLinha.error.write=Não foi possível gravar o peso {0} nesta caixa.
```

## Design notes
- **Same rules as the dialog:** `readOneWeighing` is a one-shot use of the existing `WeighingDetector` and `SerialScale.subscibe`. The row button and the weighing dialog decide "what is one weighing" identically, and the "Envio da balança" setting applies to both.
- **One reading at a time:** the existing `balanca>/reading` flag disables every row button and **Começar Pesagens** while a row waits, and the dialog session disables the row buttons the same way. Two consumers can't take the same weighing.
- **Patch and side effects:** `setProperty` writes to the draft row with the `$auto` group, as if the user had typed it. The explicit `requestPropertySideEffects` then refreshes `Pl`, `Declarado` and `Ple` in that row, because Fiori Elements only does this automatically for edits made in its own fields.
- **Cleanup:** the subscription, detector and timer are always released in `finish`, whether the reading ended by success, timeout, disconnect or leaving the page (`onExit` → `cancelRowWeighing`).

## Verification
1. Run `npm run ts-typecheck` and `npm run lint`.
2. **Display mode:** the new "Balança" column appears right before Peso Bruto, as the first column, and its cells are empty because the button is hidden.
3. **Edit mode** with a box resting on a scale set to "Contínuo": press the row's button.
   - **Screen:** the toast "Coloque a caixa na balança…" appears, the button is busy and the other row buttons are disabled. After about 3 stable readings, `Pb` shows the weight (for example `1939.26`), followed by the toast "Peso bruto atualizado: 1939.26".
   - **Network:** a `PATCH .../_PesosCX(...IsActiveEntity=false)` with `{"Pb":"1939.26"}`, followed by a `GET` for `Declarado,Pl,Ple` on that row. `Pl`, `Declarado` and `Ple` update in the same row.
4. Scale set to "Um valor por pesagem": press the row button, then place the box (or press the print key). The weight is written as soon as the scale sends it.
5. **Nothing on the scale for 20 s:** you get the warning "Não foi lido nenhum peso estável em 20 segundos" and no PATCH.
6. **Scale disconnected:** the button connects automatically with the saved port. On a PC with no authorised port, you get the "Selecione uma porta…" warning.
7. Leave the page while a row is waiting, then come back. No hanging busy state, and the buttons are enabled.
8. Open the weighing dialog (Unidades) and click **Começar Pesagens**, then close it. The row buttons were disabled during the session and are enabled again afterwards.
9. **Backend rejects the value** (for example a validation on `Pb`): you get the "Não foi possível gravar o peso…" error, with the backend message in its details.
