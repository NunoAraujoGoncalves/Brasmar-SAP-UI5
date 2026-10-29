# Multi-instance amostras (TabContainer)

## Goal
- In `CQDetail_amostragens_table` the user selects **several amostras** and presses **"Abrir selecionadas"**.
- The amostra page (`CQLinhaDetail`) opens with a **`sap.m.TabContainer`** at the top, with **one tab per selected amostra**.
  Clicking a tab shows that amostra, in display or edit mode, following the CQ draft.
- **Each tab has a close button (×).** Closing a tab only removes it from the tab bar; **the amostra is not deleted**.
  Closing the selected tab shows its neighbour. Closing the last tab returns to the CQ page.
- In edit mode the TabContainer shows a **"+"** button. It **creates a new amostra** in the CQ and opens it in a new tab.
  The Amostras table on the CQ page is refreshed.
- Opening an amostra the usual way (clicking a table row) shows the same page with a single tab, so the user
  can still add more with "+".

## Design

### One page content, re-bound per tab
`CQLinhaDetail` is an FPM custom page. Its 1550-line view uses `macros:Table` building blocks, which Fiori Elements
templates **once, against the page context**. Putting a copy of the page content inside every tab would need a
building-block fragment per tab (`ExtensionAPI.loadFragment`), unique ids, and a rewrite of every `this.byId(...)`
in the controller (Balança dialog, scroll container, tables).

Instead, **the TabContainer is the amostra switcher**:

```
CQDetail                                   CQLinhaDetail
┌────────────────────────────┐             ┌─────────────────────────────────────────────┐
│ Amostras table (Multi)     │  open(sel)  │ TabContainer  [Nº Amostra: 10 ×][20 ×][+]   │ ← items bound to multi>/tabs
│ [Abrir selecionadas] ──────┼──────────▶  │─────────────────────────────────────────────│
└────────────────────────────┘  navigate   │ IconTabBar + ScrollContainer (existing,     │ ← bound to the page context
          ▲                     (1st one)  │ unchanged: forms, macros tables, Balança)   │   (= selected tab's amostra)
          │ refreshAmostras()              └─────────────────────────────────────────────┘
          │ (after "+")                         itemSelect / itemClose / "+" → Routing.navigate(context)
          └──────────── MultiInstance.model (static JSONModel: tabs[{path, linha}], selectedPath)
```

- `MultiInstance.ts` (new) holds the open tabs in a **static JSONModel**, shared by both pages. It follows the same
  pattern as `SerialScale.model`.
- Selecting a tab calls `getExtensionAPI().getRouting().navigate(context)`. FE re-binds the **same view** to the
  other amostra: every form, `macros:Table`, side effect, draft save and Balança button works unchanged.
- `EditHelper` already reacts to `modelContextChange`, so edit mode, the draft indicator and the selects follow
  the amostra automatically.
- **Edit "at once":** all amostras are children of the same CQ draft. Changes in one tab are saved to the
  draft, and they are still there after switching tabs. Save/Cancel stay on the CQ page, as today.
- On every amostra switch, the controller clears the Balança dialog rows and stops pending scale readings,
  so weighings can't end up on the wrong amostra.

### Create ("+")
Same pattern as the existing `onPressOkayDialog`. `__CreateByAssociationControl/_linhas` is checked on the CQ first,
then the amostra is created with `bindList("_linhas", cqContext, …, {$$ownRequest: true}).create({}, true)` →
`created()`. `Linha` is `Core.Computed`, so the backend numbers it. A new tab is added, the CQ page's Amostras table is
refreshed (`requestSideEffects _linhas`, via a callback the CQ page registers), and the new amostra opens.

### Close (×)
`itemClose` → `preventDefault()`, because the tabs come from the model and the tab is removed there, not by the
TabContainer → `MultiInstance.remove(path)`. That returns the next amostra to show, or `undefined` after the last
tab, and the page then navigates back to the CQ.

### Aplicar (footer)
It runs `doCalculations` for **all open tabs** (`invocationGrouping: "Isolated"`) and then `applyDocument`, as today.

### Tab state lifecycle
| Event | Tabs |
|---|---|
| "Abrir selecionadas" | replaced by the selection; first one selected |
| page bound to an amostra that isn't a tab (row click, deep link) | replaced by that single amostra |
| "+" | new amostra appended and selected |
| × | removed (amostra kept) |
| back on the CQ page (route `CQCabCQDetailPage` matched) | cleared |

## Files
| File | Change |
|---|---|
| `webapp/ext/modules/MultiInstance.ts` | **new** – shared tab state |
| `webapp/ext/view/CQDetail.view.xml` | Amostras table: `selectionMode="Multi"` + action "Abrir selecionadas" |
| `webapp/ext/view/CQDetail.controller.ts` | `onOpenAmostras`, refresh callback, clear tabs on route match |
| `webapp/ext/view/CQLinhaDetail.view.xml` | `f:content` → `VBox` [`TabContainer` + existing `IconTabBar`] |
| `webapp/ext/view/CQLinhaDetail.controller.ts` | tabs sync, select / close / "+" handlers, `onApply` for all tabs |
| `webapp/css/style.css` | **new** – TabContainer as a tab bar only |
| `webapp/manifest.json` | register `css/style.css` |
| `webapp/i18n/i18n.properties` | 4 new texts |

The controllers below are built from the **current working-tree versions** (including the Balança "PLE Declarado"
changes). They **compile with the project's `strict` TypeScript settings against the UI5 1.120 typings**; this was
checked on a copy of the project in a temporary folder.

---

## 1. `webapp/ext/modules/MultiInstance.ts` (new, full)
```ts
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";

/** Um separador do layout multi-instância: uma amostra (CQLinhas) */
export type AmostraTab = { path: string; linha: string };

/** "/CQCab(...)" no início do caminho de uma amostra "/CQCab(...)/_linhas(...)" */
const CAB_PATH = /^\/CQCab\([^)]*\)/;

/**
 * Estado partilhado entre o CQDetail (seleção na tabela de amostras) e o CQLinhaDetail (TabContainer).
 * São views diferentes, por isso o modelo é estático (mesmo padrão que SerialScale.model).
 */
export default class MultiInstance {
    static readonly model = new JSONModel({ tabs: [] as AmostraTab[], selectedPath: "" });

    /** Registado pelo CQDetail: volta a ler a tabela de amostras (p.e. depois de criar uma amostra) */
    static refreshAmostras?: () => void;

    /** Abre as amostras selecionadas na tabela; a primeira fica selecionada */
    static open(contexts: Context[]): void {
        const tabs = contexts.map((context) => ({
            path: context.getPath(),
            linha: String(context.getProperty("Linha") ?? "")
        }));
        MultiInstance.model.setData({ tabs, selectedPath: tabs[0]?.path ?? "" });
    }

    /**
     * A página da amostra foi ligada a `path`. Se não estiver nos separadores (navegação normal,
     * clique numa linha da tabela) passa a ser o único separador. Fica sempre selecionado.
     */
    static ensure(path: string, linha: string): void {
        const tabs = MultiInstance.getTabs();
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            MultiInstance.model.setProperty("/tabs", [{ path, linha }]);
        } else if (linha && tabs[index].linha !== linha) {
            MultiInstance.model.setProperty(`/tabs/${index}/linha`, linha);
        }
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /** Novo separador (amostra acabada de criar), já selecionado */
    static add(path: string, linha: string): void {
        MultiInstance.model.setProperty("/tabs", [...MultiInstance.getTabs(), { path, linha }]);
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /**
     * Fecha o separador (NÃO apaga a amostra).
     * Devolve o caminho a mostrar a seguir: o vizinho se o fechado era o selecionado,
     * o selecionado atual nos outros casos, ou undefined se não sobrar nenhum separador.
     */
    static remove(path: string): string | undefined {
        const tabs = MultiInstance.getTabs();
        const selected = MultiInstance.model.getProperty("/selectedPath") as string;
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            return selected || undefined;
        }

        const remaining = tabs.filter((_tab, i) => i !== index);
        const next = remaining.length === 0
            ? undefined
            : selected !== path ? selected : remaining[Math.min(index, remaining.length - 1)].path;
        // selectedPath primeiro: quando os separadores são recriados o CQLinhaDetail já seleciona o certo
        MultiInstance.model.setProperty("/selectedPath", next ?? "");
        MultiInstance.model.setProperty("/tabs", remaining);
        return next;
    }

    static getSelectedPath(): string {
        return (MultiInstance.model.getProperty("/selectedPath") as string | undefined) ?? "";
    }

    static clear(): void {
        MultiInstance.model.setData({ tabs: [], selectedPath: "" });
    }

    static getPaths(): string[] {
        return MultiInstance.getTabs().map((tab) => tab.path);
    }

    /** "/CQCab(...)/_linhas(...)" -> "/CQCab(...)" */
    static getCabPath(path: string): string | undefined {
        return CAB_PATH.exec(path)?.[0];
    }

    private static getTabs(): AmostraTab[] {
        return (MultiInstance.model.getProperty("/tabs") as AmostraTab[] | undefined) ?? [];
    }
}
```

## 2. `webapp/ext/view/CQDetail.controller.ts` (full)
New: import of `MultiInstance`, field `refreshAmostras`, `onInit`/`onExit` additions, `onRouteMatched`,
section `Tabela Amostras` → `onOpenAmostras`.
```ts
import Controller from "sap/fe/core/PageController";
import Formatter from "../modules/Formatter";
import { GenericTag$PressEvent } from "sap/m/GenericTag";
import { Actions } from "../modules/Constants"
import Fragment from "sap/ui/core/Fragment";
import Popover from "sap/m/Popover";
import EditHelper from "../modules/EditHelper";
import Context from "sap/ui/model/odata/v4/Context";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import mobileLibrary from "sap/m/library";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button, { Button$PressEvent } from "sap/m/Button";
import Input from "sap/m/Input";
import DynamicPage from "sap/f/DynamicPage";
import Dialog from "sap/m/Dialog";
import List from "sap/m/List";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import MessageToast from "sap/m/MessageToast";
import TableAPI from "sap/fe/macros/table/TableAPI";
import { openCqEmailDraft } from "../modules/CqEmail";
import MessageBox from "sap/m/MessageBox";
import MultiInstance from "../modules/MultiInstance";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQDetail extends Controller {

    formatter = new Formatter();
    editHelper: EditHelper;
    oPopover: Promise<Popover> | undefined;
    cbCaixaFragment: Dialog;
    cbUnidadeFragment: Dialog;
    URLHelper = mobileLibrary.URLHelper;
    /** refresca a tabela de amostras quando o CQLinhaDetail cria uma amostra ("+" dos separadores) */
    private readonly refreshAmostras = (): void => {
        const context = this.getView()?.getBindingContext() as Context | null | undefined;
        void context?.requestSideEffects([{ $NavigationPropertyPath: "_linhas" }]);
    };


    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetail_footer_draftIndicator");
        MultiInstance.refreshAmostras = this.refreshAmostras;
        this.getAppComponent().getRouter().getRoute("CQCabCQDetailPage")?.attachPatternMatched(this.onRouteMatched, this);
    }

    public onExit(): void {
        this.getAppComponent().getRouter().getRoute("CQCabCQDetailPage")?.detachPatternMatched(this.onRouteMatched, this);
        if (MultiInstance.refreshAmostras === this.refreshAmostras) {
            MultiInstance.refreshAmostras = undefined;
        }
        this.editHelper.destroy();
    }

    /** De volta à página do CQ: os separadores de amostras abertos deixam de valer */
    private onRouteMatched(): void {
        MultiInstance.clear();
    }

    /* ---------- title bar, display mode ---------- */

    public async onEdit(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        await this.getExtensionAPI().getEditFlow().editDocument(this.getContext());
        page.setBusy(false);
    }

    public async onDelete(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        const context = this.getContext();

        try {
            await this.getExtensionAPI().getEditFlow().deleteDocument(context, {
                title: this.getText("cqDetail.delete.title"),
                description: this.getText("cqDetail.delete.description", [String(context.getProperty("ID"))])
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onPrint(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        const context = this.getContext();

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.print, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.print"),
            });
        } catch (error) { }

        page.setBusy(false);
        const url = (await context.requestProperty("Attachment")) as string | undefined;
        if (url) {
            mobileLibrary.URLHelper.redirect(url, true);
        }
    }

    public async onCopy(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.copy, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.copy"),
                requiresNavigation: false
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onConcluir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.concluir, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Concluir")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onReabrir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.reabrir, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Reabrir")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onAprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.aprovar, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Aprovar")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onDesaprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.desaprovar, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Desaprovar")
            })
        } catch (error) { }

        page.setBusy(false);
    }

    public async onGetMp(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
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


    public async onMail(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await openCqEmailDraft([this.getContext()]);
            MessageToast.show(this.getText("cqDetail.email.msg.draft"));
        } catch (error) {
            MessageBox.error(this.getText("cqDetail.email.error"), {
                details: String((error as Error)?.message ?? error)
            });
        } finally {
            page.setBusy(false);
        }
    }

    /* ---------- title bar, edit mode ---------- */

    public async onChangeMaterial(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.changeMaterial, {
                contexts: this.getContext(),
                label: this.getText("cqDetail.btn.modifyMaterial")
            })
        } catch (error) { }

        page.setBusy(false);
    }

    /* ---------- Fragemnt CB Caixa ---------- */
    public async onCbCaixa(): Promise<void> {
        if (!this.cbCaixaFragment) {
            this.cbCaixaFragment = (await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.descodificaCaixa",
                controller: this
            })) as Dialog;
            this.getView()?.addDependent(this.cbCaixaFragment);
        }
        this.cbCaixaFragment.open();
    }


    public async onPressDescodifica(event: Button$PressEvent): Promise<void> {
        const sList = this.getView()?.byId("descodificaCBList") as List;
        sList.setBusy(true);

        const oDialog = this.getView()?.byId("descodificaCBDialog") as Dialog,
            oAction = oDialog.getObjectBinding() as ODataContextBinding;

        try {
            await oAction.execute();
            MessageToast.show(this.getText("cbcaixa.msg.sucesso"));
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            MessageToast.show(this.getText("cbcaixa.msg.erro", [err.message]));
        }

        this.getContext().refresh();
        sList.setBusy(false);
    }


    public async onPressCloseDialog(event: Button$PressEvent): Promise<void> {
        this.cbCaixaFragment.close();
        this.getContext().refresh();
    }


    /* ---------- Fragment CB Unidade ---------- */
    public async onCbUnidade(): Promise<void> {
        if (!this.cbUnidadeFragment) {
            this.cbUnidadeFragment = (await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.descodificaUnidade",
                controller: this
            })) as Dialog;
            this.getView()?.addDependent(this.cbUnidadeFragment);
        }
        this.cbUnidadeFragment.open();
    }


    public async onPressDescodificaUN(event: Button$PressEvent): Promise<void> {
        const sList = this.getView()?.byId("descodificaUnidadeList") as List;
        sList.setBusy(true);

        const oDialog = this.getView()?.byId("descodificaUnidadeDialog") as Dialog,
            oAction = oDialog.getObjectBinding() as ODataContextBinding;

        try {
            await oAction.execute();
            MessageToast.show(this.getText("cbcaixa.msg.sucesso"));
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            MessageToast.show(this.getText("cbcaixa.msg.erro", [err.message]));
        }

        this.getContext().refresh();
        sList.setBusy(false);
    }


    public async onPressUnCloseDialog(event: Button$PressEvent): Promise<void> {
        this.cbUnidadeFragment.close();
        this.getContext().refresh();
    }


    /* ---------- Tabela Sem Controlo ---------- */
    public async onCopySemControlo(): Promise<void> {
        const table = this.byId("CQDetail_fcontrolo_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            return;
        }

        // replaces Core.OperationAvailable (_it/__OperationControl/copy) of the generated button
        const available = await Promise.all(selected.map((context) =>
            context.requestProperty("__OperationControl/copy") as Promise<boolean | undefined>));
        const contexts = selected.filter((_context, index) => available[index] === true);
        if (contexts.length === 0) {
            MessageToast.show(this.getText("cqDetail.semControlo.copy.notAvailable"));
            return;
        }

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.copySemControlo, {
                contexts,
                invocationGrouping: "ChangeSet",
                label: this.getText("cqDetail.semControlo.btn.copy")
            });
        } catch (error) {
            // parameter dialog cancelled or backend error (FE already shows the messages): nothing to refresh
            return;
        }

        // the table is bound relative to the CQ (_semControlo), so it can't be refreshed directly:
        // ask the CQ context to reload the navigation instead
        await this.getContext().requestSideEffects([{ $NavigationPropertyPath: "_semControlo" }]);
    }


    /* ---------- Tabela Amostras ---------- */
    /** Abrir selecionadas: abre a página da amostra com um separador por amostra selecionada */
    public onOpenAmostras(): void {
        const table = this.byId("CQDetail_amostragens_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            return;
        }

        MultiInstance.open(selected);
        this.getExtensionAPI().getRouting().navigate(selected[0]);
    }


    /* ---------- footer ---------- */

    public async onSave(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().saveDocument(this.getContext());
        } finally {
            page.setBusy(false);
        }
    }

    public async onCancel(oEvent: Event): Promise<void> {
        await this.getExtensionAPI().getEditFlow().cancelDocument(this.getContext(), {
            control: oEvent.getSource() as Control
        });
    }

    public onMessagesPress(oEvent: Event): void {
        this.editHelper.openMessages(oEvent.getSource() as Button);
    }

    /* ---------- fields ---------- */

    public onFieldChange(oEvent: Event): void {
        void this.editHelper.requestSideEffects(oEvent.getSource() as Control);
    }

    public onValueHelpRequest(oEvent: Event): void {
        void this.editHelper.openValueHelp(oEvent.getSource() as Input);
    }

    /* ---------- header tag popover  ---------- */
    onGenericTagPress(oEvent: GenericTag$PressEvent) {
        const oView = this.getView(),
            oSourceControl = oEvent.getSource();

        if (!this.oPopover) {
            this.oPopover = Fragment.load({
                id: oView?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.IDTag",
                controller: this
            }) as Promise<Popover>;
            this.oPopover.then((_Popover) => {
                oView?.addDependent(_Popover);
            })
        }

        this.oPopover.then((_Popover) => {
            _Popover.openBy(oSourceControl);
        });
    }


    /* ---------- helpers ---------- */
    private getContext(): Context {
        return this.getView()!.getBindingContext() as Context;
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }
}
```

## 3. `webapp/ext/view/CQLinhaDetail.controller.ts` (full)
New: imports (`TabContainer`, `TabContainerItem`, `MultiInstance`), field `currentAmostraPath`, `onInit`/`onExit`
additions, section `Multi-instância` (`onAmostraContextChange`, `onAmostraTabSelect`, `onAmostraTabClose`,
`onAmostraAdd`), a new `onApply`, helpers `navigateToPath` and `selectAmostraTab`.
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
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import DynamicPage from "sap/f/DynamicPage";
import Text from "sap/m/Text";
import TabContainer, { TabContainer$ItemCloseEvent, TabContainer$ItemSelectEvent } from "sap/m/TabContainer";
import TabContainerItem from "sap/m/TabContainerItem";
import MultiInstance from "../modules/MultiInstance";

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
    /** amostra a que a página está ligada (separador selecionado) */
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
    }

    public onExit(): void {
        this.getView()?.detachModelContextChange(this.onAmostraContextChange, this);
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

        // pesagens por gravar / leitura pendente eram da amostra anterior
        this.cancelRowWeighing?.();
        this.stopWeighing();
        this.getBalancaModel().setProperty("/PesosUn", []);
        this.getBalancaModel().setProperty("/Calibres", []);

        MultiInstance.ensure(path, String(context.getProperty("Linha") ?? ""));
        this.selectAmostraTab(path);
        if (!context.getProperty("Linha")) {
            void context.requestProperty("Linha").then((linha) => MultiInstance.ensure(path, String(linha ?? "")));
        }
    }

    /**
     * Clique num separador: liga a página a essa amostra (FE refaz o binding de toda a página).
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

        if (next !== this.getContext().getPath()) {
            this.navigateToPath(next);
        } else {
            this.selectAmostraTab(next);
        }
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
        const editFlow = this.getExtensionAPI().getEditFlow();
        const label = this.getText("CQLinhaDetail.btn.Calcular");
        try {
            // uma amostra de cada vez, à espera do pedido anterior: com "Isolated" o FE envia um $batch por
            // amostra mas em paralelo, e todos disputam o bloqueio do mesmo draft do CQ
            // ("bloqueio da entidade ZTABCQLINHAS_R falhou")
            await editFlow.invokeAction(Actions.doCalculations, { contexts: current, label });

            for (const path of MultiInstance.getPaths().filter((path) => path !== current.getPath())) {
                const binding = model.bindContext(path);
                try {
                    const context = binding.getBoundContext() as Context;
                    // lida só agora: ETag atual para o If-Match (o cálculo anterior pode tê-lo mudado)
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

    /** Navega (routing FE) para a amostra / CQ com este caminho OData */
    private navigateToPath(path: string): void {
        const binding = this.getContext().getModel().bindContext(path);
        this.getExtensionAPI().getRouting().navigate(binding.getBoundContext() as Context);
    }

    /** Marca no TabContainer o separador da amostra com este caminho */
    private selectAmostraTab(path: string): void {
        const tabs = this.byId("CQDetailLinha_multi_tabs") as TabContainer | undefined;
        const item = tabs?.getItems().find((tab) => tab.getKey() === path);
        if (tabs && item) {
            tabs.setSelectedItem(item);
        }
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
```

## 4. `webapp/ext/view/CQDetail.view.xml` – changed block
Replaces the one-line `CQDetail_amostragens_table` (line ~910). The full file is in Appendix A.
```xml
                                    <macros:Table id="CQDetail_amostragens_table" header="{i18n>cqDetail.amostragens.subsection.amostragens.table.title}" metaPath="_linhas/@com.sap.vocabularies.UI.v1.LineItem" enableAutoColumnWidth="true" selectionMode="Multi">
                                        <macros:actions>
                                            <macros:Action id="CQDetail_amostragens_table_btn_open" key="openAmostras" text="{i18n>cqDetail.amostragens.btn.openSelected}" press=".onOpenAmostras" requiresSelection="true"/>
                                        </macros:actions>
                                    </macros:Table>
```

## 5. `webapp/ext/view/CQLinhaDetail.view.xml` – changed blocks
The existing `IconTabBar` and everything inside it stay **unchanged**. They are wrapped in a `VBox` together with the
new `TabContainer`, and the `IconTabBar` gets a `FlexItemData` so it fills the remaining height. Full file in
Appendix B.

Start of `f:content` (replaces `<f:content>` + the `<IconTabBar …>` opening tag):
```xml
        <f:content>
            <!-- separadores de amostras (multi-instância): um por amostra aberta, "+" cria uma amostra nova.
                 O conteúdo da amostra é único (IconTabBar abaixo) e é religado à amostra do separador selecionado -->
            <VBox id="CQDetailLinha_multi_box" height="100%" fitContainer="true" renderType="Bare">
                <TabContainer id="CQDetailLinha_multi_tabs" class="cqMultiTabs" showAddNewButton="{ui>/isEditable}"
                    addNewButtonPress=".onAmostraAdd" itemSelect=".onAmostraTabSelect" itemClose=".onAmostraTabClose"
                    items="{path: 'multi>/tabs', templateShareable: false}">
                    <items>
                        <TabContainerItem id="CQDetailLinha_multi_tab" key="{multi>path}" name="{parts:[ 'i18n>CQLinhaDetail.Title', 'multi>linha' ], formatter: '.formatter.detailLineFormatter'}"/>
                    </items>
                    <layoutData>
                        <!-- não encolher: o IconTabBar (height 100%) ocuparia todo o espaço e a barra ficava com altura 0 -->
                        <FlexItemData id="CQDetailLinha_multi_tabs_layout" shrinkFactor="0"/>
                    </layoutData>
                </TabContainer>

            <IconTabBar id="CQDetailLinha_sections_tabBar" class="cqAmostraTabBar" stretchContentHeight="true" select=".onFilterSelect">
                <layoutData>
                    <FlexItemData id="CQDetailLinha_sections_tabBar_layout" growFactor="1" minHeight="0"/>
                </layoutData>
```
End of `f:content` (replaces `</IconTabBar>` + `</f:content>`):
```xml
            </IconTabBar>
            </VBox>
        </f:content>
```

## 6. `webapp/css/style.css` (new, full)
```css
/* TabContainer do CQLinhaDetail usado só como barra de separadores (amostras):
   o conteúdo da amostra fica fora dele, no IconTabBar por baixo */
.cqMultiTabs.sapMTabContainer {
    height: auto;
    flex: 0 0 auto;
}

.cqMultiTabs .sapMTabContainerContent {
    display: none;
}

/* IconTabBar com stretchContentHeight posiciona-se em absoluto (top: 0) dentro do content da DynamicPage
   e tapava o TabContainer: passa a ocupar só o espaço que o VBox lhe dá, por baixo dos separadores */
.cqAmostraTabBar.sapMITB {
    position: relative;
    top: auto;
}
```

## 7. `webapp/manifest.json` – `sap.ui5` / `resources`
```json
"resources": {
  "css": [
    {
      "uri": "Icon/style.css"
    },
    {
      "uri": "css/style.css"
    }
  ]
},
```

## 8. `webapp/i18n/i18n.properties`
```properties
cqDetail.amostragens.btn.openSelected=Abrir selecionadas
multiInstance.msg.created=Amostra {0} criada.
multiInstance.error.notInsertable=Não é possível criar amostras neste controlo.
multiInstance.error.create=Não foi possível criar a amostra.
```

---

## Fix: `Cannot read properties of null (reading 'getPath')` in `onAmostraTabSelect`
**Symptom:** the error appears after "Abrir selecionadas" and when reloading an amostra URL.

**Cause:** `sap.m.TabContainer` fires `itemSelect` without a user click in two cases:
- Every `setSelectedItem` call fires it.
- In `onBeforeRendering` (`_setDefaultTab`), it selects the **first** tab whenever the selected item is missing.
  That happens on the first render, and every time `multi>/tabs` changes, because the bound items are then
  destroyed and recreated.

At first render the page often has no binding context yet, so `this.getContext().getPath()` throws. Even when
it doesn't throw, that automatic default selection would navigate to the first tab, not to the current amostra.

**Fix (already applied to the sources above):**
1. `onAmostraTabSelect` compares the tab with `MultiInstance.getSelectedPath()` instead of the view context. It
   only navigates when the tab differs from the current amostra: a real click on another tab.
2. `onInit` attaches `syncAmostraTab` to the `change` event of the TabContainer's `items` binding. After the items
   are recreated, the current amostra's tab is selected again **before** rendering, so `_setDefaultTab` never picks
   the wrong tab.
3. `MultiInstance.remove` now updates `selectedPath` to the next tab **before** it replaces `/tabs`. The resync in
   step 2 then selects the right tab. A new `MultiInstance.getSelectedPath()` helper reads it.

## Fix: TabContainer not visible on `CQLinhaDetail`
**Cause:** `CQDetailLinha_multi_box` is a flex column that fills the page. The `IconTabBar` below the TabContainer
has `stretchContentHeight` (height 100%) and grows. Flex items shrink by default, and `.sapMTabContainer` has
`overflow: hidden`, so its minimum height is 0. The browser shrinks the TabContainer to **0 px** to fit the
IconTabBar.

**Fix (already applied to sections 5, 6 and Appendix B):**
- The TabContainer gets `FlexItemData shrinkFactor="0"`.
- As a fallback, `style.css` sets `flex: 0 0 auto`.

**Quick check in the browser console:**
`document.querySelector(".cqMultiTabs")?.getBoundingClientRect().height`
- `0` means it's this layout issue.
- `undefined` means the control isn't rendered at all; check the view.
- If the bar is there but has no tabs, check that `multi>/tabs` is filled (`MultiInstance.ensure`).

## Fix: TabContainer covered by the IconTabBar
**Diagnosis (browser console):**
- The TabContainer is rendered with both tabs, at `top: 278`, `height: 52`.
- `document.elementFromPoint` at that spot returns `sapMITHTextContent`, so the IconTabBar header is drawn
  **on top of** the TabContainer.
- No ancestor hides or scrolls it.

**Cause:** with `stretchContentHeight="true"` inside the DynamicPage content, the IconTabBar is positioned
absolutely from the top of the content area. It therefore ignores the TabContainer above it in the `VBox`.

**Fix (already applied to sections 5, 6 and Appendix B):**
- The IconTabBar gets `class="cqAmostraTabBar"`.
- `style.css` makes it `position: relative`, so it takes the space the `VBox` (growFactor 1) gives it, below the tabs.

## Fix: "The Data Service Request is required to be conditional" in `onApply`
**Symptom:** `onApply` fails with this error when more than one tab is open, for example after creating
amostras with "+".

**Cause:** `onApply` builds a context for each open tab other than the current one, using
`model.bindContext(path)`. These contexts have **never read any data**, so they have no `@odata.etag`. The OData V4
model then sends the `doCalculations` POST for those amostras **without an `If-Match` header**. RAP requires one,
because the entity has an ETag. The current amostra works because the FE page already read it.

**Fix (already applied to section 3):**
- `onApply` calls `context.requestObject()` on those contexts first. This GETs each amostra, including its ETag,
  so the action is sent with `If-Match`.
- The contexts are read right before the action, so the ETag is current, even for an amostra created moments
  earlier.

## Fix: "Impossível processar: bloqueio da entidade ZTABCQLINHAS_R falhou" in `onApply`
**Symptom:** after the ETag fix, `onApply` with several tabs fails with this lock error.

**Cause (confirmed in the Network tab):**
- With several contexts and `invocationGrouping: "Isolated"`, FE sends **one `$batch` per amostra** (group ids
  `apiMode2`, `apiMode3`, …), but it sends them **at the same time**.
- All the paths are draft (`IsActiveEntity=false`). Every amostra belongs to the same CQ draft, so every request
  needs the same lock on the CQ.
- Each `$batch` runs in its own backend session. While the first one holds the lock, the parallel ones can't get
  it: "bloqueio da entidade ZTABCQLINHAS_R falhou".
- The single-amostra "Calcular" button never hits this, because only one request runs at a time.
- A second problem: if the ETag of an amostra depends on the CQ (ETag master), calculating one amostra changes the
  ETag of the next.

**Fix (already applied to section 3):** `onApply` calculates the amostras **one at a time**:
- One `invokeAction` per amostra, the current one first. Each call waits for the previous one to finish, exactly
  like "Calcular", so only one request holds the CQ draft lock at a time.
- Each other amostra is read (`requestObject`) **just before** its action, so the `If-Match` ETag is current even
  if the previous calculation changed it (ETag master on the CQ).
- If one amostra fails, the loop stops there. The amostras already calculated stay calculated.

`invocationGrouping: "ChangeSet"` (a single `$batch`) was considered and rejected. It is all-or-nothing, and every
call in the change set carries an ETag read beforehand, which risks `412` if the ETag depends on the CQ.

**If the error persists**, check the action requests in the Network tab:
- **The path has `IsActiveEntity=true`:** a tab points to the **active** amostra while the CQ is in edit, and the
  draft lock blocks the active one. The tabs must then be reopened from the table in edit mode.
- **Otherwise:** the lock comes from the `doCalculations` implementation itself (ABAP side).

**Fallback:** go back to calculating only the current amostra in `onApply`
(`await this.onCalcular()`, as before) and leave the other tabs to their own "Calcular" button.

## Risks to verify first
1. **Switching tabs with `Routing.navigate(context)`.** FE decides whether a navigation replaces the
   history entry. If every tab switch adds a browser-history entry, pass `{ preserveHistory: false }` or switch
   `navigateToPath` to `HashChanger.getInstance().replaceHash(path.substring(1))`. FE's hash for an amostra is its
   OData path without the leading "/".
2. **Paths must match.** Tabs are matched by OData path (`/CQCab(…)/_linhas(…)`). Check that the context path
   of a table row equals the path the amostra page is bound to after navigation. Otherwise every switch resets
   the tabs to one (`MultiInstance.ensure`).
3. **TabContainer as a tab bar.** Check `style.css` collapses the empty content area of the TabContainer, and that
   the IconTabBar still fills the page and scrolls (`stretchContentHeight`). Each tab shows its close button by
   default (`TabContainerItem` in `sap.m.TabContainer` fires `itemClose`).
4. **New amostra defaults.** `create({})` sends no data. The backend (determination on create) must fill whatever a new
   `CQLinhas` needs (Material, Lote, …), as it does for the standard table "Create" button.
5. **"Aplicar" with several tabs.** `doCalculations` runs for every open amostra. If that is slow for many tabs,
   limit it to the current amostra (previous `onApply` behaviour).

## Tests
1. CQ in display mode → select 3 amostras → **Abrir selecionadas** → 3 tabs, first selected, no "+".
2. Click tabs → header ("Nº Amostra"), forms and all tables show the selected amostra.
3. CQ in edit mode → open 2 amostras → change a field in tab 1 → switch to tab 2 and back → the change is still
   there (draft indicator "Saved").
4. **×** on a non-selected tab → it disappears, view unchanged. **×** on the selected tab → the neighbour is shown.
   **×** on the last tab → back on the CQ page. In every case the amostra still exists in the table.
5. **+** → a new amostra is created, appears as a new selected tab, and is listed in the CQ Amostras table.
6. Balança dialog: weigh in tab 1 without pressing OK, switch to tab 2 → dialog rows are empty; nothing is created on tab 1.
7. Row click on one amostra (normal navigation) → page with a single tab; **+** still works.
8. Back to the CQ, then select a different set → tabs show only the new set.
9. **Aplicar** with 2 tabs → both amostras are calculated, back on the CQ.

---

## Appendix A – `webapp/ext/view/CQDetail.view.xml` (full, with the change)
```xml
<mvc:View xmlns:uxap="sap.uxap"
    xmlns:core="sap.ui.core"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:macros="sap.fe.macros"
    xmlns:html="http://www.w3.org/1999/xhtml"
    xmlns:f="sap.f"
    xmlns:layout="sap.ui.layout"
    xmlns:app="http://schemas.sap.com/sapui5/extension/sap.ui.core.CustomData/1"
    xmlns:l="sap.ui.layout.form" core:require="{ Decimal: 'sap/ui/model/odata/type/Decimal', Date: 'sap/ui/model/odata/type/Date', CodeDescType: 'brasmar/bm01/controloqualidade4/ext/modules/CodeDescType' }" controllerName="brasmar.bm01.controloqualidade4.ext.view.CQDetail">
    <f:DynamicPage id="CQDetail_dynamicPage" stickySubheaderProvider="iconTabBar" toggleHeaderOnTitleClick="true" class="sapUiNoContentPadding" headerExpanded="false" showFooter="{ui>/isEditable}">
        <!-- DynamicPage Title -->
        <f:title>
            <f:DynamicPageTitle id="CQDetail_dynamicPage_title">
                <f:heading>
                    <Title id="CQDetail_dynamicPage_titleText" text="{i18n>cqDetail.title}"/>
                </f:heading>
                <f:content>
                    <OverflowToolbar id="CQDetail_dynamicPage_title_overflowToolbar">
                        <GenericTag id="CQDetail_dynamicPage_title_genericTag" text="{path: 'ID', formatter: '.formatter.detailHeaderFormatter'}" status="Information" press="onGenericTagPress" design="StatusIconHidden"/>
                        <ObjectMarker id="CQDetail_dynamicPage_title_draftMarker" type="Draft" visible="{ui>/isEditable}"/>
                    </OverflowToolbar>
                </f:content>
                <f:actions>
                    <Button id="CQDetail_dynamicPage_Concluir" icon="sap-icon://accept" text="{i18n>cqDetail.btn.Concluir}" type="Accept" press=".onConcluir" enabled="{= %{__OperationControl/concluirCQ} === true }"></Button>
                    <Button id="CQDetail_dynamicPage_Reabrir" text="{i18n>cqDetail.btn.Reabrir}" type="Negative" press=".onReabrir" enabled="{= %{__OperationControl/reabrirCQ} === true }"></Button>
                    <Button id="CQDetail_dynamicPage_Aprovar" icon="sap-icon://accept" text="{i18n>cqDetail.btn.Aprovar}" type="Accept" press=".onAprovar" enabled="{= %{__OperationControl/aprovarCQ} === true }"></Button>
                    <Button id="CQDetail_dynamicPage_Desaprovar" text="{i18n>cqDetail.btn.Desaprovar}" type="Negative" press=".onDesaprovar" enabled="{= %{__OperationControl/desaprovarCQ} === true }"></Button>

                    <Button id="CQDetail_dynamicPage_Edit" text="{i18n>cqDetail.btn.edit}" icon="sap-icon://edit" type="Emphasized" press=".onEdit" visible="{= !${ui>/isEditable} &amp;&amp; %{__OperationControl/Edit} === true }"/>
                    <Button id="CQDetail_dynamicPage_Delete" text="{i18n>cqDetail.btn.delete}" icon="sap-icon://delete" type="Transparent" press=".onDelete" visible="{= !${ui>/isEditable} &amp;&amp; %{__EntityControl/Deletable} === true }"/>

                    <Button id="CQDetail_dynamicPage_Email" text="{i18n>cqDetail.btn.email}" icon="sap-icon://email" type="Transparent" press=".onMail" visible="true"/>
                    <Button id="CQDetail_dynamicPage_Print" text="{i18n>cqDetail.btn.print}" icon="sap-icon://print" type="Transparent" press=".onPrint" visible="{= %{__OperationControl/printCQ} === true }"/>
                    <Button id="CQDetail_dynamicPage_Copy" text="{i18n>cqDetail.btn.copy}" icon="sap-icon://copy" type="Transparent" press=".onCopy" visible="{= %{__OperationControl/copy2} === true }"/>
                    <Button id="CQDetail_dynamicPage_ModifyMaterial" text="{i18n>cqDetail.btn.modifyMaterial}" icon="sap-icon://product" type="Transparent" press=".onChangeMaterial" visible="{= ${ui>/isEditable} &amp;&amp; %{__OperationControl/changeMat} === true }"/>
                </f:actions>
            </f:DynamicPageTitle>
        </f:title>
        <!-- DynamicPage Header -->
        <f:header>
            <f:DynamicPageHeader id="CQDetail_dynamicPageHeader" pinnable="true">
                <FlexBox id="CQDetail_dynamicPageHeader_flexBox" wrap="Wrap" alignContent="Start" alignItems="Start" width="100%">
                    <VBox id="CQDetail_dynamicPageHeader_vertical_controlo" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetail_dynamicPageHeader_vertical_controlo_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.controlo}"/>
                        <HBox id="_hbox0" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_centro" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.centro}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_centro" emptyIndicatorMode="On" renderWhitespace="true" text="{Centro}"/>
                        </HBox>
                        <HBox id="_hbox1" renderType="Bare" class="sapUiTinyMarginEnd sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_id" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.id}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_id" emptyIndicatorMode="On" renderWhitespace="true" text="{ID}"/>
                        </HBox>
                        <HBox id="_hbox2" renderType="Bare" class="sapUiTinyMarginEnd sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_status" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.status}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_status" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ 'Estado', 'EstadoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                    </VBox>
                    <VBox id="CQDetail_dynamicPageHeader_vertical_produto" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetail_dynamicPageHeader_vertical_produto_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.produto}"/>
                        <HBox id="_hbox3" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_material" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.material}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_material" emptyIndicatorMode="On" renderWhitespace="true" text="{Material}"/>
                        </HBox>
                        <HBox id="_hbox4" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_desc" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.matDesc}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_desc" emptyIndicatorMode="On" renderWhitespace="true" text="{MaterialDesc}"/>
                        </HBox>
                        <HBox id="_hbox5" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_lote" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.lote}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_lote" emptyIndicatorMode="On" renderWhitespace="true" text="{Lote}"/>
                        </HBox>
                    </VBox>
                    <VBox id="CQDetail_dynamicPageHeader_vertical_detalhe" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetail_dynamicPageHeader_vertical_detalhe_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.detalhe}"/>
                        <HBox id="_hbox6" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_tipoDoc" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.tipoDoc}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_tipoDoc" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ 'Tipodoc', 'TipodocDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                        <HBox id="_hbox7" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_document" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.documento}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_document" emptyIndicatorMode="On" renderWhitespace="true" text="{Documento}"/>
                        </HBox>
                        <HBox id="_hbox8" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetail_dynamicPageHeader_label_tipoProd" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.tipoProd}"/>
                            <Text id="CQDetail_dynamicPageHeader_text_tipoProd" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ 'Tipoprod', 'TipoprodDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                    </VBox>
                </FlexBox>
            </f:DynamicPageHeader>
        </f:header>
        <!-- Conteudo -->
        <f:content>
            <IconTabBar id="CQDetail_sections_tabBar" stretchContentHeight="true">
                <items>
                    <IconTabFilter id="CQDetail_section_dadosProduto" text="{i18n>cqDetail.dadosProduto.title}">
                        <ScrollContainer id="CQDetail_section_scroll_dadosProduto" vertical="true" height="100%">
                            <VBox id="CQDetail_section_dadosProduto_vbox" class="sapUiSmallMarginEnd">
                                <Title id="CQDetail_subSection_material_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.dadosProduto.subsection.material.title}"/>
                                <l:Form id="CQDetail_subSection_material" editable="{ui>/isEditable}">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_material_layout" columnsM="2" columnsL="3" columnsXL="6" labelCellsLarge="12"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_material_container">
                                        <l:FormElement id="CQDetail_subSection_material_material_label" label="{i18n>cqDetail.dadosProduto.ss.material.material}">
                                            <Text id="CQDetail_subSection_material_material" text="{parts:[ 'Material', 'MaterialDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_Lote_label" label="{i18n>cqDetail.dadosProduto.ss.material.Lote}">
                                            <Text id="CQDetail_subSection_material_Lote" emptyIndicatorMode="On" text="{Lote}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_material_Lote_edit" value="{Lote}" maxLength="10" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_Lote_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_Attachment_label" label="{i18n>cqDetail.dadosProduto.ss.material.Attachment}">
                                            <Link id="CQDetail_subSection_material_Attachment" text="{Filename}" target="_blank" href="{Attachment}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_Responsavel_label" label="{i18n>cqDetail.dadosProduto.ss.material.Responsavel}">
                                            <Text id="CQDetail_subSection_material_Responsavel" emptyIndicatorMode="On" text="{Responsavel}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_material_Responsavel_edit" value="{Responsavel}" maxLength="100" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_Responsavel_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_DtCongelacao_label" label="{i18n>cqDetail.dadosProduto.ss.material.DtCongelacao}">
                                            <Text id="CQDetail_subSection_material_DtCongelacao" emptyIndicatorMode="On" text="{path:'DtCongelacao', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy', style: 'short' }}" visible="{= !${ui>/isEditable} }"/>
                                            <DatePicker id="CQDetail_subSection_material_DtCongelacao_edit" value="{path:'DtCongelacao', 
                                                        type:'Date', formatOptions: { pattern: 'dd/MM/yyyy', style: 'short' } }" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_DtCongelacao_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </DatePicker>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_DtVencimento_label" label="{i18n>cqDetail.dadosProduto.ss.material.DtVencimento}">
                                            <Text id="CQDetail_subSection_material_DtVencimento" emptyIndicatorMode="On" text="{path:'DtVencimento', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy', style: 'short' }}" visible="{= !${ui>/isEditable} }"/>
                                            <DatePicker id="CQDetail_subSection_material_DtVencimento_edit" value="{path:'DtVencimento', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy' } }" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_DtVencimento_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </DatePicker>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_DtProducao_label" label="{i18n>cqDetail.dadosProduto.ss.material.DtProducao}" visible="{= !${HideDtProducao} }">
                                            <Text id="CQDetail_subSection_material_DtProducao" emptyIndicatorMode="On" text="{path:'DtProducao', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy', style: 'short' }}" visible="{= !${ui>/isEditable} }"/>
                                            <DatePicker id="CQDetail_subSection_material_DtProducao_edit" value="{path:'DtProducao', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy' } }" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_DtProducao_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </DatePicker>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_DtEmbalamento_label" label="{i18n>cqDetail.dadosProduto.ss.material.DtEmbalamento}">
                                            <Text id="CQDetail_subSection_material_DtEmbalamento" emptyIndicatorMode="On" text="{path:'DtEmbalamento', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy', style: 'short' }}" visible="{= !${ui>/isEditable} }"/>
                                            <DatePicker id="CQDetail_subSection_material_DtEmbalamento_edit" value="{path:'DtEmbalamento', type:'Date', formatOptions: { pattern: 'dd/MM/yyyy' } }" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_DtEmbalamento_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </DatePicker>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_ATestemunho_label" label="{i18n>cqDetail.dadosProduto.ss.material.ATestemunho}">
                                            <Text id="CQDetail_subSection_material_ATestemunho" emptyIndicatorMode="On" text="{ATestemunho}" visible="{= !${ui>/isEditable} }"/>
                                            <!-- <Input id="CQDetail_subSection_material_ATestemunho_edit" value="{ATestemunho}" maxLength="1" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_ATestemunho_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input> -->
                                            <Select id="CQDetail_subSection_material_ATestemunho_edit" selectedKey="{ATestemunho}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_ATestemunho_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>

                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_NCaixa_label" label="{i18n>cqDetail.dadosProduto.ss.material.NCaixa}">
                                            <Text id="CQDetail_subSection_material_NCaixa" emptyIndicatorMode="On" text="{NCaixa}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_material_NCaixa_edit" value="{NCaixa}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_NCaixa_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_NPalete_label" label="{i18n>cqDetail.dadosProduto.ss.material.NPalete}">
                                            <Text id="CQDetail_subSection_material_NPalete" emptyIndicatorMode="On" text="{NPalete}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_material_NPalete_edit" value="{NPalete}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_NPalete_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_material_Linha_label" label="{i18n>cqDetail.dadosProduto.ss.material.Linha}" visible="{path: 'HideLinhaOP', formatter: '.formatter.hideFormatter'}">
                                            <Text id="CQDetail_subSection_material_Linha" emptyIndicatorMode="On" text="{Linha}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_material_Linha_edit" value="{Linha}" maxLength="40" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_material_Linha_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <Title id="CQDetail_subSection_certificacao_title" level="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.dadosProduto.subsection.certificacao.title}"/>
                                <l:Form id="CQDetail_subSection_certificacao" editable="{ui>/isEditable}">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_certificacao_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_certificacao_container">
                                        <l:FormElement id="CQDetail_subSection_certificacao_certificado_label" label="{i18n>cqDetail.dadosProduto.ss.certificacao.certificado}">
                                            <Text id="CQDetail_subSection_certificacao_certificado" emptyIndicatorMode="On" text="{parts:[ 'Matcertificado', 'MatcertificadoDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Select id="CQDetail_subSection_certificacao_certificado_edit" selectedKey="{Matcertificado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_certificado_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_Mscaprov_label" visible="{path: 'HideMSCAprov', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.Mscaprov}">
                                            <Text id="CQDetail_subSection_certificacao_Mscaprov" emptyIndicatorMode="On" text="{Mscaprov}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_certificacao_Mscaprov_edit" value="{Mscaprov}" maxLength="13" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_Mscaprov_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_Ascaprov_label" visible="{path: 'HideASCAprov', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.Ascaprov}">
                                            <Text id="CQDetail_subSection_certificacao_Ascaprov" emptyIndicatorMode="On" text="{Ascaprov}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_certificacao_Ascaprov_edit" value="{Ascaprov}" maxLength="13" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_Ascaprov_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_Veterinario_label" visible="{path: 'HideVeterinario', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.Veterinario}">
                                            <Text id="CQDetail_subSection_certificacao_Veterinario" emptyIndicatorMode="On" text="{Veterinario}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_certificacao_Veterinario_edit" value="{Veterinario}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_Veterinario_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_DataAbate_label" visible="{path: 'HideDataAbate', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.DataAbate}">
                                            <Text id="CQDetail_subSection_certificacao_DataAbate" emptyIndicatorMode="On" text="{path:'DataAbate', type:'Date'}" visible="{= !${ui>/isEditable} }"/>
                                            <DatePicker id="CQDetail_subSection_certificacao_DataAbate_edit" value="{path:'DataAbate', type:'Date'}" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_DataAbate_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </DatePicker>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_LocalAbate_label" visible="{path: 'HideLocalAbate', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.LocalAbate}">
                                            <Text id="CQDetail_subSection_certificacao_LocalAbate" emptyIndicatorMode="On" text="{LocalAbate}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_certificacao_LocalAbate_edit" value="{LocalAbate}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_LocalAbate_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_NumViveiro_label" visible="{path: 'HideNumViviero', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.NumViveiro}">
                                            <Text id="CQDetail_subSection_certificacao_NumViveiro" emptyIndicatorMode="On" text="{NumViveiro}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_certificacao_NumViveiro_edit" value="{NumViveiro}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_certificacao_NumViveiro_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_CAlhalal_label" visible="{path: 'HideHalal', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.CAlhalal}">
                                            <Switch id="CQDetail_subSection_certificacao_CAlhalal" state="{CAlhalal}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_PP_label" visible="{path: 'HidePP', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.certificacao.PP}">
                                            <Switch id="CQDetail_subSection_certificacao_PP" state="{PP}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_certificacao_SGluten_label" label="{i18n>cqDetail.dadosProduto.ss.certificacao.SGluten}">
                                            <Switch id="CQDetail_subSection_certificacao_SGluten" state="{SGluten}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <Title id="CQDetail_subSection_lote_title" level="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.dadosProduto.subsection.lote.title}"/>
                                <l:Form id="CQDetail_subSection_lote" editable="{ui>/isEditable}">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_lote_layout" columnsM="2" columnsL="3" columnsXL="5"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_lote_container">
                                        <l:FormElement id="CQDetail_subSection_lote_Tipospeso_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Tipospeso}">
                                            <Text id="CQDetail_subSection_lote_Tipospeso" emptyIndicatorMode="On" text="{parts:[ 'Tipospeso', 'TipospesoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Tipopesoliq_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Tipopesoliq}">
                                            <Text id="CQDetail_subSection_lote_Tipopesoliq" emptyIndicatorMode="On" text="{parts:[ 'Tipopesoliq', 'TipopesoliqDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Teorvidragem_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Teorvidragem}">
                                            <Text id="CQDetail_subSection_lote_Teorvidragem" emptyIndicatorMode="On" text="{path:'Teorvidragem', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_VidragemM_label" label="{i18n>cqDetail.dadosProduto.ss.lote.VidragemM}" visible="{= !${HideVidragemM} }" >
                                            <Text id="CQDetail_subSection_lote_VidragemM" emptyIndicatorMode="On" text="{path:'VidragemM', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Tipocaptura_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Tipocaptura}">
                                            <Text id="CQDetail_subSection_lote_Tipocaptura" emptyIndicatorMode="On" text="{parts:[ 'Tipocaptura', 'TipocapturaDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>

                                        <!-- <l:FormElement id="CQDetail_subSection_lote_MMMarca_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMMarca}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMMarca" class="sapUiNoMargin" icon="{parts:[ 'Marca', 'MMMarca' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Marca', 'MMMarca' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMMarca', 'MMMarcaDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement> -->

                                        <l:FormElement id="CQDetail_subSection_lote_Nomecientifico_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Nomecientifico}">
                                            <Text id="CQDetail_subSection_lote_Nomecientifico" emptyIndicatorMode="On" text="{parts:[ 'Nomecientifico', 'NomecientificoDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} || ${HideNomeCientifico} }"/>

                                            <Input id="CQDetail_subSection_lote_Nomecientifico_edit" value="{parts:[{path:'Nomecientifico'}, {path:'NomecientificoDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; !${HideNomeCientifico} }">


                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Nomecientifico_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>



                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_lote_container2">
                                        <l:FormElement id="CQDetail_subSection_lote_MMMarca_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMMarca}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMMarca" class="sapUiNoMargin" icon="{parts:[ 'Marca', 'MMMarca' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Marca', 'MMMarca' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMMarca', 'MMMarcaDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Marca_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Marca}">
                                            <Text id="CQDetail_subSection_lote_Marca" emptyIndicatorMode="On" text="{parts:[ 'Marca', 'MarcaDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Marca_edit" value="{parts:[{path:'Marca'}, {path:'MarcaDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Marca_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_MMOrigem_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMOrigem}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMOrigem" class="sapUiNoMargin" icon="{parts:[ 'Origem', 'MMOrigem' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Origem', 'MMOrigem' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMOrigem', 'MMOrigemDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Origem_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Origem}">
                                            <Text id="CQDetail_subSection_lote_Origem" emptyIndicatorMode="On" text="{parts:[ 'Origem', 'OrigemDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Origem_edit" value="{parts:[{path:'Origem'}, {path:'OrigemDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Origem_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_MMIdiomapadrao_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMIdiomapadrao}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMIdiomapadrao" class="sapUiNoMargin" icon="{parts:[ 'Zidiomapadrao', 'MMIdiomapadrao' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Zidiomapadrao', 'MMIdiomapadrao' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMIdiomapadrao', 'MMIdiomapadraoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Zidiomapadrao_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Zidiomapadrao}">
                                            <Text id="CQDetail_subSection__lote_Zidiomapadrao" emptyIndicatorMode="On" text="{parts:[ 'Zidiomapadrao', 'IdiomapadraoDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection__lote_Zidiomapadrao_edit" value="{parts:[{path:'Zidiomapadrao'}, {path:'IdiomapadraoDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection__lote_Zidiomapadrao_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_lote_container3">
                                        <l:FormElement id="CQDetail_subSection_lote_MMZonadecaptura_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMZonadecaptura}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMZonadecaptura" class="sapUiNoMargin" icon="{parts:[ 'Zonadecaptura', 'MMZonadecaptura' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Zonadecaptura', 'MMZonadecaptura' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMZonadecaptura', 'MMZonadecapturaDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Zonadecaptura_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Zonadecaptura}">
                                            <Text id="CQDetail_subSection_lote_Zonadecaptura" emptyIndicatorMode="On" text="{parts:[ 'Zonadecaptura', 'ZonacapturaDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Zonadecaptura_edit" value="{parts:[{path:'Zonadecaptura'}, {path:'ZonacapturaDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Zonadecaptura_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ZonaDeCaptura2_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ZonaDeCaptura2}">
                                            <Text id="CQDetail_subSection_lote_ZonaDeCaptura2" emptyIndicatorMode="On" text="{parts:[ 'ZonaDeCaptura2', 'ZonaCapturaDesc2' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ZonaDeCaptura2_edit" value="{parts:[{path:'ZonaDeCaptura2'}, {path:'ZonaCapturaDesc2'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ZonaDeCaptura2_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ZonaDeCaptura3_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ZonaDeCaptura3}">
                                            <Text id="CQDetail_subSection_lote_ZonaDeCaptura3" emptyIndicatorMode="On" text="{parts:[ 'ZonaDeCaptura3', 'ZonaCapturaDesc3' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ZonaDeCaptura3_edit" value="{parts:[{path:'ZonaDeCaptura3'}, {path:'ZonaCapturaDesc3'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ZonaDeCaptura3_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ZonaDeCaptura4_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ZonaDeCaptura4}">
                                            <Text id="CQDetail_subSection_lote_ZonaDeCaptura4" emptyIndicatorMode="On" text="{parts:[ 'ZonaDeCaptura4', 'ZonaCapturaDesc4' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ZonaDeCaptura4_edit" value="{parts:[{path:'ZonaDeCaptura4'}, {path:'ZonaCapturaDesc4'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ZonaDeCaptura4_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_lote_container4">
                                        <l:FormElement id="CQDetail_subSection_lote_MMArtepesca_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMArtepesca}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMArtepesca" class="sapUiNoMargin" icon="{parts:[ 'Artepesca', 'MMArtepesca' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Artepesca', 'MMArtepesca' ], formatter:'.formatter.detailStatusFormatter'}" text="{parts:[ 'MMArtepesca', 'MMArtepescaDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Artepesca_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Artepesca}">
                                            <Text id="CQDetail_subSection_lote_Artepesca" emptyIndicatorMode="On" text="{parts:[ 'Artepesca', 'ArtepescaDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Artepesca_edit" value="{parts:[{path:'Artepesca'}, {path:'ArtepescaDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Artepesca_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ArtePesca2_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ArtePesca2}">
                                            <Text id="CQDetail_subSection_lote_ArtePesca2" emptyIndicatorMode="On" text="{parts:[ 'ArtePesca2', 'ArtePescaDesc2' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ArtePesca2_edit" value="{parts:[{path:'ArtePesca2'}, {path:'ArtePescaDesc2'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ArtePesca2_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ArtePesca3_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ArtePesca3}">
                                            <Text id="CQDetail_subSection_lote_ArtePesca3" emptyIndicatorMode="On" text="{parts:[ 'ArtePesca3', 'ArtePescaDesc3' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ArtePesca3_edit" value="{parts:[{path:'ArtePesca3'}, {path:'ArtePescaDesc3'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ArtePesca3_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_ArtePesca4_label" label="{i18n>cqDetail.dadosProduto.ss.lote.ArtePesca4}">
                                            <Text id="CQDetail_subSection_lote_ArtePesca4" emptyIndicatorMode="On" text="{parts:[ 'ArtePesca4', 'ArtePescaDesc4' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_ArtePesca4_edit" value="{parts:[{path:'ArtePesca4'}, {path:'ArtePescaDesc4'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_ArtePesca4_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_lote_container5">
                                        <l:FormElement id="CQDetail_subSection_lote_MMCalibre_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMCalibre}">
                                            <ObjectStatus id="CQDetail_subSection_lote_MMCalibre" class="sapUiNoMargin" icon="{parts:[ 'Calibre', 'MMCalibre' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Calibre', 'MMCalibre' ], formatter:'.formatter.detailStatusFormatter'}" text="{MMCalibreDesc}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Calibre_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Calibre}">
                                            <Text id="CQDetail_subSection_lote_Calibre" emptyIndicatorMode="On" text="{CalibreDesc}" visible="{= !${ui>/isEditable} }"/>
                                            <Select id="CQDetail_subSection_lote_Calibre_edit" selectedKey="{Calibre}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Calibre_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_MMCalibremin_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMCalibremin}">
                                            <Text id="CQDetail_subSection_lote_MMCalibremin" emptyIndicatorMode="On" text="{path:'MMCalibremin', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Calibremin_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Calibremin}">
                                            <Text id="CQDetail_subSection_lote_Calibremin" emptyIndicatorMode="On" text="{path:'Calibremin', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Calibremin_edit" value="{path:'Calibremin', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Calibremin_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_MMCalibremax_label" label="{i18n>cqDetail.dadosProduto.ss.lote.MMCalibremax}">
                                            <Text id="CQDetail_subSection_lote_MMCalibremax" emptyIndicatorMode="On" text="{path:'MMCalibremax', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_lote_Calibremax_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Calibremax}">
                                            <Text id="CQDetail_subSection_lote_Calibremax" emptyIndicatorMode="On" text="{path:'Calibremax', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_lote_Calibremax_edit" value="{path:'Calibremax', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_lote_Calibremax_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <Title id="CQDetail_subSection_documento_title" visible="{path: 'HideDadosDoc', formatter: '.formatter.hideFormatter'}" level="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.dadosProduto.subsection.documento.title}"/>
                                <l:Form id="CQDetail_subSection_documento" visible="{path: 'HideDadosDoc', formatter: '.formatter.hideFormatter'}" editable="{ui>/isEditable}">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_documento_layout" columnsM="2" columnsL="3" columnsXL="5"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_documento_container">
                                        <!-- Documento: Immutable; Supplier/Contentor/RepQual/LinkLotes/CarregaDet: Computed -->
                                        <l:FormElement id="CQDetail_subSection_documento_Documento_label" label="{i18n>cqDetail.dadosProduto.ss.documento.Documento}">
                                            <Text id="CQDetail_subSection_documento_Documento" emptyIndicatorMode="On" text="{Documento}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Supplier_label" visible="{path: 'HideSupplier', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Supplier}">
                                            <Text id="CQDetail_subSection_documento_Supplier" emptyIndicatorMode="On" text="{Supplier}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Contentor_label" visible="{path: 'HideContentor', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Contentor}">
                                            <Text id="CQDetail_subSection_documento_Contentor" emptyIndicatorMode="On" text="{Contentor}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Contertorselado_label" visible="{path: 'HideContentorSelado', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Contertorselado}">
                                            <Switch id="CQDetail_subSection_documento_Contertorselado" state="{Contertorselado}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Contertoraberto_label" visible="{path: 'HideAberto', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Contertoraberto}">
                                            <Switch id="CQDetail_subSection_documento_Contertoraberto" state="{Contertoraberto}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_RepQual_label" visible="{path: 'HideRepQual', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.RepQual}">
                                            <Text id="CQDetail_subSection_documento_RepQual" emptyIndicatorMode="On" text="{RepQual}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_LinkLotes_label" visible="{path: 'HideLinkLotes', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.LinkLotes}">
                                            <Text id="CQDetail_subSection_documento_LinkLotes" emptyIndicatorMode="On" text="{LinkLotes}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_CarregaDet_label" visible="{path: 'HideCarregaDet', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.CarregaDet}">
                                            <Switch id="CQDetail_subSection_documento_CarregaDet" state="{CarregaDet}" enabled="false" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Selo_label" visible="{path: 'HideSelo', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Selo}">
                                            <Text id="CQDetail_subSection_documento_Selo" emptyIndicatorMode="On" text="{Selo}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Selo_edit" value="{Selo}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Selo_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Entreposto_label" visible="{path: 'HideEntreposto', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Entreposto}">
                                            <Switch id="CQDetail_subSection_documento_Entreposto" state="{Entreposto}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Nexportador_label" visible="{path: 'HideNexportador', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Nexportador}">
                                            <Text id="CQDetail_subSection_documento_Nexportador" emptyIndicatorMode="On" text="{Nexportador}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Nexportador_edit" value="{Nexportador}" maxLength="40" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Nexportador_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Tempveiculo_label" visible="{path: 'HideTempVeiculo', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Tempveiculo}">
                                            <Text id="CQDetail_subSection_documento_Tempveiculo" emptyIndicatorMode="On" text="{path:'Tempveiculo', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:5,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Tempveiculo_edit" value="{path:'Tempveiculo', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:5,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Tempveiculo_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Tempproduto_label" visible="{path: 'HideTempProduto', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Tempproduto}">
                                            <Text id="CQDetail_subSection_documento_Tempproduto" emptyIndicatorMode="On" text="{path:'Tempproduto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:5,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Tempproduto_edit" value="{path:'Tempproduto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:5,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Tempproduto_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Veiculohigienizado_label" visible="{path: 'HideVeiculoHigienizado', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Veiculohigienizado}">
                                            <Switch id="CQDetail_subSection_documento_Veiculohigienizado" state="{Veiculohigienizado}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Precozinhado_label" visible="{path: 'HidePreCozinhado', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Precozinhado}">
                                            <Switch id="CQDetail_subSection_documento_Precozinhado" state="{Precozinhado}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Datalogger_label" visible="{path: 'HideDatalogger', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Datalogger}">
                                            <Switch id="CQDetail_subSection_documento_Datalogger" state="{Datalogger}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Dataloggerestado_label" visible="{path: 'HideDataloggerEstado', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Dataloggerestado}">
                                            <Text id="CQDetail_subSection_documento_Dataloggerestado" emptyIndicatorMode="On" text="{parts:[ 'Dataloggerestado', 'DtLoggerEstDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Select id="CQDetail_subSection_documento_Dataloggerestado_edit" selectedKey="{Dataloggerestado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Dataloggerestado_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Iddatalogger_label" visible="{path: 'HideIDdatalogger', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Iddatalogger}">
                                            <Text id="CQDetail_subSection_documento_Iddatalogger" emptyIndicatorMode="On" text="{Iddatalogger}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Iddatalogger_edit" value="{Iddatalogger}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Iddatalogger_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Nc_label" visible="{path: 'HideNC', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Nc}">
                                            <Text id="CQDetail_subSection_documento_Nc" emptyIndicatorMode="On" text="{Nc}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Nc_edit" value="{Nc}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Nc_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <!-- Cmr has a backend side effect: toggling it refreshes HideCmrFields -->
                                        <l:FormElement id="CQDetail_subSection_documento_Cmr_label" visible="{path: 'HideCMR', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Cmr}">
                                            <Switch id="CQDetail_subSection_documento_Cmro" state="{Cmr}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_Matricula_label" visible="{path: 'HideCmrFields', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.Matricula}">
                                            <Text id="CQDetail_subSection_documento_Matricula" emptyIndicatorMode="On" text="{Matricula}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_Matricula_edit" value="{Matricula}" maxLength="10" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_Matricula_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_documento_NomeTransportador_label" visible="{path: 'HideCmrFields', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.ss.documento.NomeTransportador}">
                                            <Text id="CQDetail_subSection_documento_NomeTransportador" emptyIndicatorMode="On" text="{NomeTransportador}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_documento_NomeTransportador_edit" value="{NomeTransportador}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_documento_NomeTransportador_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <Title id="CQDetail_subSection_embalagem_title" level="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.dadosProduto.subsection.embalagem.title}"/>
                                <l:Form id="CQDetail_subSection_embalagem" editable="{ui>/isEditable}">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_embalagem_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </l:layout>

                                    <l:toolbar>
                                        <OverflowToolbar id="CQDetail_subSection_embalagem_toolbar">
                                            <Button id="CQDetail_subSection_embalagem_btn_cbcaixa" text="{i18n>cqDetail.btn.cbcaixa}" icon="sap-icon://bar-code" type="Emphasized" press=".onCbCaixa" visible="{= ${ui>/isEditable}}"/>
                                            <Button id="CQDetail_subSection_embalagem_btn_cbunidade" text="{i18n>cqDetail.btn.cbunidade}" icon="sap-icon://bar-code" type="Emphasized" press=".onCbUnidade" visible="{= ${ui>/isEditable}}"/>
                                        </OverflowToolbar>
                                    </l:toolbar>

                                    <l:FormContainer id="CQDetail_subSection_embalagem_leitura_container">
                                        <l:title>
                                            <core:Title id="CQDetail_subSection_embalagem_leitura_title" level="H4" text="{i18n>cqDetail.dadosProduto.subsection.leitura.title}"/>
                                        </l:title>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_CodigoBarras_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.CodigoBarras}">
                                            <Text id="CQDetail_subSection_embalagem_leitura_CodigoBarras" emptyIndicatorMode="On" text="{CodigoBarras}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_CodigoBarrasUn_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.CodigoBarrasUn}">
                                            <Text id="CQDetail_subSection_embalagem_leitura_CodigoBarrasUn" emptyIndicatorMode="On" text="{CodigoBarrasUn}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_MMGtin_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.MMGtin}">
                                            <!-- <Text id="CQDetail_subSection_embalagem_leitura_MMGtin" emptyIndicatorMode="On" text="{MMGtin}"/> -->
                                            <ObjectStatus id="CQDetail_subSection_embalagem_leitura_MMGtin" class="sapUiNoMargin" icon="{parts:[ 'Gtin', 'MMGtin' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Gtin', 'MMGtin' ], formatter:'.formatter.detailStatusFormatter'}" text="{MMGtin}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_Gtin_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.Gtin}">
                                            <Text id="CQDetail_subSection_embalagem_leitura_Gtin" emptyIndicatorMode="On" text="{Gtin}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_MMEan_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.MMEan}">
                                            <!-- <Text id="CQDetail_subSection_embalagem_leitura_MMEan" emptyIndicatorMode="On" text="{MMEan}"/> -->
                                            <ObjectStatus id="CQDetail_subSection_embalagem_leitura_MMEan" class="sapUiNoMargin" icon="{parts:[ 'Ean', 'MMEan' ], formatter:'.formatter.detailIconFormatter'}" state="{parts:[ 'Ean', 'MMEan' ], formatter:'.formatter.detailStatusFormatter'}" text="{MMEan}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_leitura_Ean_label" label="{i18n>cqDetail.dadosProduto.subsection.leitura.Ean}">
                                            <Text id="CQDetail_subSection_embalagem_leitura_Ean" emptyIndicatorMode="On" text="{Ean}"/>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_embalagem_tipo_container">
                                        <l:title>
                                            <core:Title id="CQDetail_subSection_embalagem_tipo_title" level="H4" text="{i18n>cqDetail.dadosProduto.subsection.tipo.title}"/>
                                        </l:title>
                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_Tipoproduto_label" label="{i18n>cqDetail.dadosProduto.subsection.tipo.Tipoproduto}">
                                            <Text id="CQDetail_subSection_embalagem_tipo_Tipoproduto" emptyIndicatorMode="On" text="{parts:[ 'Tipoproduto', 'TipoprodutoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_CalibreAprox_label" label="{i18n>cqDetail.dadosProduto.subsection.tipo.CalibreAprox}">
                                            <Switch id="CQDetail_subSection_embalagem_tipo_CalibreAprox" state="{CalibreAprox}" enabled="{ui>/isEditable}" change=".onFieldChange" customTextOff="{i18n>off}" customTextOn="{i18n>on}"/>
                                        </l:FormElement>

                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_MMApresentacao_label" label="{i18n>cqDetail.dadosProduto.subsection.tipo.MMApresentacao}">
                                            <Text id="CQDetail_subSection_embalagem_tipo_MMApresentacao" emptyIndicatorMode="On" text="{parts:[ 'MMApresentacao', 'MMApresentacaoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_Apresentacao_label" label="{i18n>cqDetail.dadosProduto.subsection.tipo.Apresentacao}">
                                            <Text id="CQDetail_subSection_embalagem_tipo_Apresentacao" emptyIndicatorMode="On" text="{parts:[ 'Apresentacao', 'ApresentacaoDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }"/>
                                            <Select id="CQDetail_subSection_embalagem_tipo_Apresentacao_edit" selectedKey="{Apresentacao}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_embalagem_tipo_Apresentacao_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </l:FormElement>

                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_MMNembalporcaixa_label" label="{i18n>cqDetail.dadosProduto.subsection.tipo.MMNembalporcaixa}">
                                            <Text id="CQDetail_subSection_embalagem_tipo_MMNembalporcaixa" emptyIndicatorMode="On" text="{MMNembalporcaixa}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_embalagem_tipo_Nembalporcaixa_label" visible="{path: 'HideNembalporcaixa', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.tipo.Nembalporcaixa}">
                                            <Text id="CQDetail_subSection_embalagem_tipo_Nembalporcaixa" emptyIndicatorMode="On" text="{Nembalporcaixa}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_embalagem_tipo_Nembalporcaixa_edit" value="{Nembalporcaixa}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_embalagem_tipo_Nembalporcaixa_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <l:Form id="CQDetail_subSection_dimensoes" editable="{ui>/isEditable}" class="sapUiTinyMarginTop">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_dimensoes_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_dimensoes_cx_container">
                                        <l:title>
                                            <core:Title id="CQDetail_subSection_dimensoes_cx_title" level="H4" text="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.title}"/>
                                        </l:title>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Pmscx_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Pmscx}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Pmscx" emptyIndicatorMode="On" text="{Pmscx}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Pmscx_edit" value="{Pmscx}" maxLength="18" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Pmscx_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxcomprimento_label" visible="{path: 'HideCxDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxcomprimento}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxcomprimento" emptyIndicatorMode="On" text="{path:'Cxcomprimento', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxcomprimento_edit" value="{path:'Cxcomprimento', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Cxuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxcomprimento_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxlargura_label" visible="{path: 'HideCxDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxlargura}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxlargura" emptyIndicatorMode="On" text="{path:'Cxlargura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxlargura_edit" value="{path:'Cxlargura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Cxuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxlargura_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxaltura_label" visible="{path: 'HideCxDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxaltura}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxaltura" emptyIndicatorMode="On" text="{path:'Cxaltura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxaltura_edit" value="{path:'Cxaltura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Cxuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxaltura_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <!-- <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxuomdim_label" visible="{= ${ui>/isEditable} &amp;&amp; !${HideCxDim} }" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxuomdim}">
                                            <Select id="CQDetail_subSection_dimensoes_cx_Cxuomdim_edit" selectedKey="{Cxuomdim}" forceSelection="false" width="100%" change=".onFieldChange" app:valueList="true"/>
                                        </l:FormElement> -->
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxpesobruto_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxpesobruto}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxpesobruto"
                                             emptyIndicatorMode="On" text="{path:'Cxpesobruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                             constraints:{precision:12,scale:2}} {Cxuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxpesobruto_edit" value="{path:'Cxpesobruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Cxuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxpesobruto_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxpesoliquido_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxpesoliquido}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxpesoliquido" 
                                            emptyIndicatorMode="On" text="{path:'Cxpesoliquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                            constraints:{precision:12,scale:2}} {Cxuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxpesoliquido_edit" 
                                            value="{path:'Cxpesoliquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}"
                                             description="{Cxuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxpesoliquido_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxpesoliquidoesc_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxpesoliquidoesc}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxpesoliquidoesc" emptyIndicatorMode="On" text="{path:'Cxpesoliquidoesc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                            constraints:{precision:12,scale:2}} {Cxuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxpesoliquidoesc_edit" value="{path:'Cxpesoliquidoesc', type:'Decimal', 
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Cxuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxpesoliquidoesc_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_cx_Cxtara_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Cxtara}">
                                            <Text id="CQDetail_subSection_dimensoes_cx_Cxtara" emptyIndicatorMode="On" text="{path:'Cxtara', type:'Decimal', 
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}} {Cxuompeso}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_cx_Cxtara_edit" value="{path:'Cxtara', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                            constraints:{precision:14,scale:2}}" description="{Cxuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_cx_Cxtara_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_dimensoes_un_container">
                                        <l:title>
                                            <core:Title id="CQDetail_subSection_dimensoes_un_title" level="H4" text="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.title}"/>
                                        </l:title>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Uncomprimento_label" visible="{path: 'HideUnDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Uncomprimento}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Uncomprimento" emptyIndicatorMode="On" text="{path:'Uncomprimento', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Uncomprimento_edit" value="{path:'Uncomprimento', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Uncomprimento_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Unlargura_label" visible="{path: 'HideUnDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unlargura}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Unlargura" emptyIndicatorMode="On" text="{path:'Unlargura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Unlargura_edit" value="{path:'Unlargura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unlargura_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Unaltura_label" visible="{path: 'HideUnDim', formatter: '.formatter.hideFormatter'}" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unaltura}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Unaltura" emptyIndicatorMode="On" text="{path:'Unaltura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuomdim}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Unaltura_edit" value="{path:'Unaltura', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuomdim}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unaltura_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <!-- <l:FormElement id="CQDetail_subSection_dimensoes_un_Unuomdim_label" visible="{= ${ui>/isEditable} &amp;&amp; !${HideUnDim} }" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unuomdim}">
                                            <Select id="CQDetail_subSection_dimensoes_un_Unuomdim_edit" selectedKey="{Unuomdim}" forceSelection="false" width="100%" change=".onFieldChange" app:valueList="true">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unuomdim_edit_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </l:FormElement> -->
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Unpesobruto_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unpesobruto}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Unpesobruto" emptyIndicatorMode="On" text="{path:'Unpesobruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                            constraints:{precision:12,scale:2}} {Unuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Unpesobruto_edit" value="{path:'Unpesobruto', type:'Decimal', 
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unpesobruto_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Unpesoliquido_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unpesoliquido}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Unpesoliquido" emptyIndicatorMode="On" text="{path:'Unpesoliquido', type:'Decimal', 
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Unpesoliquido_edit" value="{path:'Unpesoliquido', type:'Decimal', 
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unpesoliquido_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Unpesoliquidoesc_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.un.Unpesoliquidoesc}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Unpesoliquidoesc" emptyIndicatorMode="On" text="{path:'Unpesoliquidoesc', 
                                            type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}" visible="{= !${ui>/isEditable} || %{Tipoprod} === '0005' }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Unpesoliquidoesc_edit" value="{path:'Unpesoliquidoesc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Unuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; %{Tipoprod} !== '0005' }">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Unpesoliquidoesc_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_dimensoes_un_Untara_label" label="{i18n>cqDetail.dadosProduto.subsection.dimensoes.cx.Untara}">
                                            <Text id="CQDetail_subSection_dimensoes_un_Untara" emptyIndicatorMode="On" text="{path:'Untara', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}} {Unuompeso}" visible="{= !${ui>/isEditable} }"/>
                                            <Input id="CQDetail_subSection_dimensoes_un_Untara_edit" value="{path:'Untara', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" description="{Unuompeso}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_dimensoes_un_Untara_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Input>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                                <!-- Observações -->
                                <Title id="CQDetail_subSection_obs_title" level="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.dadosProduto.subsection.obs.title}"/>
                                <l:Form id="CQDetail_subSection_obs" editable="{ui>/isEditable}" class="sapUiTinyMarginTop">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_obs_layout" columnsM="1" columnsL="1" columnsXL="1"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_obs_id">
                                        <l:FormElement id="CQDetail_subSection_obs_obs_label">
                                            <Text id="CQDetail_subSection_obs_obs" emptyIndicatorMode="On" text="{Observacoes}" visible="{= !${ui>/isEditable} }"/>
                                            <TextArea id="CQDetail_subSection_obs_obs_edit" value="{Observacoes}" rows="4" growing="true" width="100%" change=".onFieldChange" visible="{ui>/isEditable}">
                                                <layoutData>
                                                    <l:ColumnElementData id="CQDetail_subSection_obs_obs_layout" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </TextArea>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                            </VBox>
                        </ScrollContainer>
                    </IconTabFilter>
                    <IconTabSeparator id="CQDetail_sections_tabBar_sep1"/>
                    <IconTabFilter id="CQDetail_section_ft" text="{i18n>cqDetail.ft.title}">

                        <ScrollContainer id="CQDetail_section_scroll_ft" vertical="true" height="100%">
                            <VBox id="CQDetail_section_ft_vbox">

                                <Title id="CQDetail_subSection_Ingredientes_title" level="Auto" titleStyle="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.ft.subsection.Ingredientes.title}"/>
                                <layout:Grid id="CQDetail_section_ft_grid1" defaultSpan="XL12 L12 M12 S12">
                                    <macros:Table id="CQDetail_Ingredientes_table" header="{i18n>cqDetail.ft.subsection.Ingredientes.table.title}" metaPath="_ingredientes/@com.sap.vocabularies.UI.v1.LineItem">
                                        <macros:creationMode name="InlineCreationRows"/>
                                    </macros:Table>
                                </layout:Grid>

                                <Title id="CQDetail_subSection_alergenios_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.ft.subsection.alergenios.title}"/>
                                <layout:Grid id="CQDetail_section_ft_grid2" defaultSpan="XL12 L12 M12 S12">
                                    <HBox id="CQDetail_subSection_alergenios">
                                        <VBox id="tes1" class="sapUiTinyMarginEnd">
                                            <macros:Table id="CQDetail_alergenios_contem_table" header="{i18n>cqDetail.ft.subsection.alergenios.contem.title}" metaPath="_alegerneosContem/@com.sap.vocabularies.UI.v1.LineItem">
                                                <macros:creationMode name="InlineCreationRows"/>
                                            </macros:Table>
                                        </VBox>

                                        <macros:Table id="CQDetail_alergenios_podeConter_table" header="{i18n>cqDetail.ft.subsection.alergenios.podeConter.title}" metaPath="_alegerneosPodeConter/@com.sap.vocabularies.UI.v1.LineItem">
                                            <macros:creationMode name="InlineCreationRows"/>
                                        </macros:Table>
                                    </HBox>
                                </layout:Grid>

                                <Title id="CQDetail_subSection_nutricionais_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.ft.subsection.Nutricionais.title}"/>
                                <layout:Grid id="CQDetail_section_ft_grid3" defaultSpan="XL12 L12 M12 S12">
                                    <layout:Grid id="CQDetail_subSection_nutricionais_grid" defaultSpan="XL12 L12 M12 S12" hSpacing="0" class="sapUiTinyMarginTop">
                                        <l:Form id="CQDetail_subSection_nutricionais_form" editable="false" class="sapUiTinyMarginBottom">
                                            <l:layout>
                                                <l:ColumnLayout id="CQDetail_subSection_nutricionais_form_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                            </l:layout>
                                            <l:FormContainer id="CQDetail_subSection_nutricionais_container">
                                                <l:FormElement id="CQDetail_subSection_nutricionais_Vntipo_label" label="{i18n>cqDetail.ft.subsection.Nutricionais.Vntipo}">
                                                    <Text id="CQDetail_subSection_nutricionais_Vntipo" visible="{= !${ui>/isEditable} }" emptyIndicatorMode="On" text="{parts:[ 'Vntipo', 'VntipoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                                    <Input id="CQDetail_subSection_nutricionais_Vntipo_edit" value="{parts:[{path:'Vntipo'}, {path:'VntipoDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                        <layoutData>
                                                            <l:ColumnElementData id="CQDetail_subSection_nutricionais_Vntipo_layout" cellsSmall="12" cellsLarge="12"/>
                                                        </layoutData>
                                                    </Input>
                                                </l:FormElement>
                                                <l:FormElement id="CQDetail_subSection_nutricionais_Grupopais_label" label="{i18n>cqDetail.ft.subsection.Nutricionais.Grupopais}">
                                                    <Text id="CQDetail_subSection_nutricionais_Grupopais" visible="{= !${ui>/isEditable} }" emptyIndicatorMode="On" text="{parts:[ 'Grupopais', 'GrupopaisDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                                                    <Input id="CQDetail_subSection_nutricionais_Grupopais_edit" value="{parts:[{path:'Grupopais'}, {path:'GrupopaisDesc'}], type:'CodeDescType', useRawValues:true}" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                                        <layoutData>
                                                            <l:ColumnElementData id="CQDetail_subSection_nutricionais_Grupopais_layout" cellsSmall="12" cellsLarge="12"/>
                                                        </layoutData>
                                                    </Input>
                                                </l:FormElement>
                                            </l:FormContainer>
                                        </l:Form>
                                        <macros:Table id="CQDetail_nutricionais_table" header="{i18n>cqDetail.ft.subsection.nutricionais.table.title}" metaPath="_nutricionais/@com.sap.vocabularies.UI.v1.LineItem"/>
                                    </layout:Grid>
                                </layout:Grid>
                            </VBox>
                        </ScrollContainer>
                    </IconTabFilter>

                    <IconTabSeparator id="CQDetail_sections_tabBar_sep2"/>
                    <IconTabFilter id="CQDetail_section_amostragens" text="{i18n>cqDetail.amostragens.title}">
                        <ScrollContainer id="CQDetail_section_scroll_amostragens" vertical="true" height="100%">
                            <VBox id="CQDetail_section_amostragens_vbox">

                                <!-- <Title id="CQDetail_subSection_mps_title" level="Auto" titleStyle="H3" class="sapUiTinyMarginBottom" visible="{path: 'HideMps', formatter: '.formatter.hideFormatter'}" text="{i18n>cqDetail.amostragens.subsection.mps.title}"/>
                                <layout:Grid id="CQDetail_section_amostragens_grid3" defaultSpan="XL12 L12 M12 S12">
                                    <OverflowToolbar id="CQDetail_mps_table_toolbar" visible="{= ${ui>/isEditable} &amp;&amp; !${HideMps} }">
                                        <Button id="CQDetail_mps_btn_getMp" text="{i18n>cqDetail.amostragens.subsection.mps.btn.getMp}" icon="sap-icon://factory" type="Emphasized" press=".onGetMp" visible="{= ${ui>/isEditable} &amp;&amp; !${HideMps} }"></Button>
                                    </OverflowToolbar>
                                    <macros:Table id="CQDetail_mps_table" header="{i18n>cqDetail.amostragens.subsection.mps.title}" metaPath="_mp/@com.sap.vocabularies.UI.v1.LineItem" visible="{path: 'HideMps', formatter: '.formatter.hideFormatter'}" enableAutoColumnWidth="true"/>
                                </layout:Grid> -->

                                <Title id="CQDetail_subSection_amostragens_title" level="Auto" titleStyle="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.amostragens.subsection.amostragens.title}"/>
                                <layout:Grid id="CQDetail_section_amostragens_grid1" defaultSpan="XL12 L12 M12 S12">
                                    <macros:Table id="CQDetail_amostragens_table" header="{i18n>cqDetail.amostragens.subsection.amostragens.table.title}" metaPath="_linhas/@com.sap.vocabularies.UI.v1.LineItem" enableAutoColumnWidth="true" selectionMode="Multi">
                                        <macros:actions>
                                            <macros:Action id="CQDetail_amostragens_table_btn_open" key="openAmostras" text="{i18n>cqDetail.amostragens.btn.openSelected}" press=".onOpenAmostras" requiresSelection="true"/>
                                        </macros:actions>
                                    </macros:Table>
                                </layout:Grid>

                                <Title id="CQDetail_subSection_fcontrolo_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>cqDetail.amostragens.subsection.fcontrolo.title}"/>
                                <layout:Grid id="CQDetail_section_amostragens_grid2" defaultSpan="XL12 L12 M12 S12">
                                    <macros:Table id="CQDetail_fcontrolo_table" header="{i18n>cqDetail.amostragens.subsection.fcontrolo.table.title}" metaPath="_semControlo/@com.sap.vocabularies.UI.v1.LineItem" selectionMode="Multi">
                                        <macros:actions>
                                            <macros:Action id="CQDetail_fcontrolo_table_btn_copiar" key="copySemControlo" text="{i18n>cqDetail.semControlo.btn.copy}" press=".onCopySemControlo" requiresSelection="true"/>
                                        </macros:actions>
                                    </macros:Table>
                                </layout:Grid>

                            </VBox>
                        </ScrollContainer>
                    </IconTabFilter>

                    <IconTabSeparator id="CQDetail_sections_tabBar_sep3"/>
                    <IconTabFilter id="CQDetail_section_admin" text="{i18n>cqDetail.admin.title}">
                        <ScrollContainer id="CQDetail_section_scroll_admin" vertical="true" height="100%">
                            <VBox id="CQDetail_section_admin_vbox">
                                <Title id="CQDetail_subSection_admin_title" level="Auto" titleStyle="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.admin.subsection.admin.title}"/>
                                <l:Form id="CQDetail_subSection_admin" editable="false">
                                    <l:layout>
                                        <l:ColumnLayout id="CQDetail_subSection_admin_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </l:layout>
                                    <l:FormContainer id="CQDetail_subSection_admin_container1">
                                        <l:FormElement id="CQDetail_subSection_admin_Datacriacao_label" label="{i18n>cqDetail.admin.subsection.admin.Datacriacao}">
                                            <Text id="CQDetail_subSection_admin_Datacriacao" emptyIndicatorMode="On" text="{Datacriacao}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Horacriacao_label" label="{i18n>cqDetail.admin.subsection.admin.Horacriacao}">
                                            <Text id="CQDetail_subSection_admin_Horacriacao" emptyIndicatorMode="On" text="{Horacriacao}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Usercriacao_label" label="{i18n>cqDetail.admin.subsection.admin.Usercriacao}">
                                            <Text id="CQDetail_subSection_admin_Usercriacao" emptyIndicatorMode="On" text="{Usercriacao}"/>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_admin_container2">
                                        <l:FormElement id="CQDetail_subSection_admin_Datamodific_label" label="{i18n>cqDetail.admin.subsection.admin.Datamodific}">
                                            <Text id="CQDetail_subSection_admin_Datamodific" emptyIndicatorMode="On" text="{Datamodific}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Horamodific_label" label="{i18n>cqDetail.admin.subsection.admin.Horamodific}">
                                            <Text id="CQDetail_subSection_admin_Horamodific" emptyIndicatorMode="On" text="{Horamodific}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Usermodific_label" label="{i18n>cqDetail.admin.subsection.admin.Usermodific}">
                                            <Text id="CQDetail_subSection_admin_Usermodific" emptyIndicatorMode="On" text="{Usermodific}"/>
                                        </l:FormElement>
                                    </l:FormContainer>
                                    <l:FormContainer id="CQDetail_subSection_admin_container3">
                                        <l:FormElement id="CQDetail_subSection_admin_Datafecho_label" label="{i18n>cqDetail.admin.subsection.admin.Datafecho}">
                                            <Text id="CQDetail_subSection_admin_Datafecho" emptyIndicatorMode="On" text="{Datafecho}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Horafecho_label" label="{i18n>cqDetail.admin.subsection.admin.Horafecho}">
                                            <Text id="CQDetail_subSection_admin_Horafecho" emptyIndicatorMode="On" text="{Horafecho}"/>
                                        </l:FormElement>
                                        <l:FormElement id="CQDetail_subSection_admin_Userfecho_label" label="{i18n>cqDetail.admin.subsection.admin.Userfecho}">
                                            <Text id="CQDetail_subSection_admin_Userfecho" emptyIndicatorMode="On" text="{Userfecho}"/>
                                        </l:FormElement>
                                    </l:FormContainer>
                                </l:Form>
                            </VBox>
                        </ScrollContainer>
                    </IconTabFilter>

                </items>
            </IconTabBar>
        </f:content>
        <f:footer>
            <OverflowToolbar id="CQDetail_footer">
                <Button id="CQDetail_footer_messages" icon="sap-icon://message-popup" type="Emphasized" text="{= ${message>/}.length }" tooltip="{i18n>cqDetail.btn.messages}" visible="{= ${message>/}.length > 0 }" press=".onMessagesPress"/>
                <DraftIndicator id="CQDetail_footer_draftIndicator"/>
                <ToolbarSpacer id="CQDetail_footer_spacer"/>
                <Button id="CQDetail_footer_save" text="{i18n>cqDetail.btn.save}" type="Emphasized" press=".onSave"/>
                <Button id="CQDetail_footer_cancel" text="{i18n>cqDetail.btn.cancel}" press=".onCancel"/>
            </OverflowToolbar>
        </f:footer>
    </f:DynamicPage>
</mvc:View>
```

## Appendix B – `webapp/ext/view/CQLinhaDetail.view.xml` (full, with the change)
```xml
<mvc:View xmlns:layout="sap.ui.layout"
    xmlns:form="sap.ui.layout.form"
    xmlns:core="sap.ui.core"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:macros="sap.fe.macros"
    xmlns:html="http://www.w3.org/1999/xhtml"
    xmlns:app="http://schemas.sap.com/sapui5/extension/sap.ui.core.CustomData/1" core:require="{ Decimal: 'sap/ui/model/odata/type/Decimal' }" controllerName="brasmar.bm01.controloqualidade4.ext.view.CQLinhaDetail"
    xmlns:f="sap.f">
    <f:DynamicPage id="CQDetailLinha_dynamicPage" stickySubheaderProvider="iconTabBar" toggleHeaderOnTitleClick="true" class="sapUiNoContentPadding" headerExpanded="false" showFooter="{ui>/isEditable}">
        <f:title>
            <f:DynamicPageTitle id="CQDetailLinha_dynamicPage_Title">
                <f:heading>
                    <Title id="CQDetailLinha_dynamicPage_TitleText" text="{
                            parts:[
                                {path: 'i18n>CQLinhaDetail.Title'},
                                {path: 'Linha'}], formatter: '.formatter.detailLineFormatter'}"></Title>
                </f:heading>
                <f:content>
                    <OverflowToolbar id="CQDetailLinha_dynamicPage_title_overflowToolbar">
                        <ObjectMarker id="CQDetailLinha_dynamicPage_title_draftMarker" type="Draft" visible="{ui>/isEditable}"></ObjectMarker>
                    </OverflowToolbar>
                </f:content>
                <f:actions>
                    <!-- <Button id="CQDetailLinha_dynamicPage_Edit" text="{i18n>CQLinhaDetail.btn.Edit}" type="Emphasized"></Button> -->
                    <Button id="CQDetailLinha_dynamicPage_BalancaConfig" text="{i18n>CQLinhaDetail.btn.BalancaConfig}" icon="sap-icon://action-settings" press=".onBalancaConfig" type="{= ${serial>/connected} ? 'Success' : 'Default' }" tooltip="{= ${serial>/connected} ? ${i18n>balancaCfg.status.connected} + ': ' + ${serial>/portLabel} : ${i18n>balancaCfg.status.disconnected} }"></Button>
                    <Button id="CQDetailLinha_dynamicPage_Calcular" text="{i18n>CQLinhaDetail.btn.Calcular}" type="Default" icon="sap-icon://simulate" press=".onCalcular" visible="{= ${ui>/isEditable} &amp;&amp; %{__OperationControl/doCalculations} === true }"></Button>
                </f:actions>
            </f:DynamicPageTitle>
        </f:title>


        <f:header>
            <f:DynamicPageHeader id="CQDetailLinha_dynamicPage_Header" pinnable="true">
                <FlexBox id="CQDetailLinha_dynamicPageHeader_flexBox" wrap="Wrap" alignContent="Start" alignItems="Start" width="100%">
                    <VBox id="CQDetailLinha_dynamicPageHeader_vertical_controlo" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetailLinha_dynamicPageHeader_vertical_controlo_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.controlo}"/>
                        <HBox id="CQDetailLinha_hbox0" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_centro" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.centro}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_centro" emptyIndicatorMode="On" renderWhitespace="true" text="{Centro}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox1" renderType="Bare" class="sapUiTinyMarginEnd sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_id" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.id}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_id" emptyIndicatorMode="On" renderWhitespace="true" text="{Id}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox2" renderType="Bare" class="sapUiTinyMarginEnd sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_status" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.status}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_status" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ '_CabCQ/Estado', '_CabCQ/EstadoDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                    </VBox>
                    <VBox id="CQDetailLinha_dynamicPageHeader_vertical_produto" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetailLinha_dynamicPageHeader_vertical_produto_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.produto}"/>
                        <HBox id="CQDetailLinha_hbox3" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_material" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.material}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_material" emptyIndicatorMode="On" renderWhitespace="true" text="{Material}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox4" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_desc" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.matDesc}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_desc" emptyIndicatorMode="On" renderWhitespace="true" text="{MaterialDesc}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox5" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_lote" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.lote}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_lote" emptyIndicatorMode="On" renderWhitespace="true" text="{Lote}"/>
                        </HBox>
                    </VBox>
                    <VBox id="CQDetailLinha_dynamicPageHeader_vertical_detalhe" displayInline="true" class="sapUiSmallMargin">
                        <Title id="CQDetailLinha_dynamicPageHeader_vertical_detalhe_title" level="H3" class="sapUiTinyMarginBottom" text="{i18n>cqDetail.header.detalhe}"/>
                        <HBox id="CQDetailLinha_hbox6" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_tipoDoc" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.tipoDoc}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_tipoDoc" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ '_CabCQ/Tipodoc', '_CabCQ/TipodocDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox7" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_document" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.documento}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_document" emptyIndicatorMode="On" renderWhitespace="true" text="{_CabCQ/Documento}"/>
                        </HBox>
                        <HBox id="CQDetailLinha_hbox8" renderType="Bare" class="sapUiTinyMarginBottom">
                            <Label id="CQDetailLinha_dynamicPageHeader_label_tipoProd" wrapping="true" class="sapUiTinyMarginEnd" text="{i18n>cqDetail.header.tipoProd}"/>
                            <Text id="CQDetailLinha_dynamicPageHeader_text_tipoProd" emptyIndicatorMode="On" renderWhitespace="true" text="{parts:[ '_CabCQ/Tipoprod', '_CabCQ/TipoprodDesc' ], formatter:'.formatter.detailFieldFormatter'}"/>
                        </HBox>
                    </VBox>
                </FlexBox>

            </f:DynamicPageHeader>
        </f:header>

        <f:content>
            <!-- separadores de amostras (multi-instância): um por amostra aberta, "+" cria uma amostra nova.
                 O conteúdo da amostra é único (IconTabBar abaixo) e é religado à amostra do separador selecionado -->
            <VBox id="CQDetailLinha_multi_box" height="100%" fitContainer="true" renderType="Bare">
                <TabContainer id="CQDetailLinha_multi_tabs" class="cqMultiTabs" showAddNewButton="{ui>/isEditable}"
                    addNewButtonPress=".onAmostraAdd" itemSelect=".onAmostraTabSelect" itemClose=".onAmostraTabClose"
                    items="{path: 'multi>/tabs', templateShareable: false}">
                    <items>
                        <TabContainerItem id="CQDetailLinha_multi_tab" key="{multi>path}" name="{parts:[ 'i18n>CQLinhaDetail.Title', 'multi>linha' ], formatter: '.formatter.detailLineFormatter'}"/>
                    </items>
                    <layoutData>
                        <!-- não encolher: o IconTabBar (height 100%) ocuparia todo o espaço e a barra ficava com altura 0 -->
                        <FlexItemData id="CQDetailLinha_multi_tabs_layout" shrinkFactor="0"/>
                    </layoutData>
                </TabContainer>

            <IconTabBar id="CQDetailLinha_sections_tabBar" class="cqAmostraTabBar" stretchContentHeight="true" select=".onFilterSelect">
                <layoutData>
                    <FlexItemData id="CQDetailLinha_sections_tabBar_layout" growFactor="1" minHeight="0"/>
                </layoutData>
                <items>
                    <IconTabFilter id="CQDetailLinha_filter_amostra" text="{i18n>CQLinhaDetail.toolbar.btn.Amostra}" key="Amostra"></IconTabFilter>
                    <IconTabSeparator id="CQDetailLinha_filter_seperator1"></IconTabSeparator>
                    <IconTabFilter id="CQDetailLinha_filter_PerdaPeso" text="{i18n>CQLinhaDetail.toolbar.btn.PerdaPeso}" key="PerdaPeso"></IconTabFilter>
                    <IconTabSeparator id="CQDetailLinha_filter_seperator2"></IconTabSeparator>
                    <IconTabFilter id="CQDetailLinha_filter_Peso" text="{i18n>CQLinhaDetail.toolbar.btn.Pesos}" key="Pesos">
                        <items>
                            <IconTabFilter id="CQDetailLinha_filter_PesoCx" text="{i18n>CQLinhaDetail.toolbar.btn.PesoCX}" key="PesoCx"></IconTabFilter>
                            <IconTabFilter id="CQDetailLinha_filter_PesoUn" text="{i18n>CQLinhaDetail.toolbar.btn.PesoUn}" key="PesoUn"></IconTabFilter>
                        </items>
                    </IconTabFilter>
                    <IconTabSeparator id="CQDetailLinha_filter_seperator3"></IconTabSeparator>
                    <IconTabFilter id="CQDetailLinha_filter_Vidragens" text="{i18n>CQLinhaDetail.toolbar.btn.Vidragens}" key="Vidragens"></IconTabFilter>
                    <IconTabSeparator id="CQDetailLinha_filter_seperator4"></IconTabSeparator>
                    <IconTabFilter id="CQDetailLinha_filter_Calibres" text="{i18n>CQLinhaDetail.toolbar.btn.Calibres}" key="Calibres"></IconTabFilter>

                    <IconTabSeparator id="CQDetailLinha_filter_seperator5" visible="{path: 'HideTemperaturas', formatter: '.formatter.hideFormatter'}"></IconTabSeparator>
                    <IconTabFilter id="CQDetailLinha_filter_Temperaturas" key="Temperaturas" visible="{path: 'HideTemperaturas', formatter: '.formatter.hideFormatter'}" text="{i18n>CQLinhaDetail.toolbar.btn.Temperaturas}"></IconTabFilter>
                </items>

                <content>
                    <ScrollContainer id="CQDetailLinha_Content_scroll" vertical="true" height="100%">
                        <VBox id="CQDetailLinha_Content_vbox" class="sapUiTinyMarginEnd">
                            <Title id="CQDetailLinha_amostra_title" titleStyle="H3" class="sapUiTinyMarginBottom" text="{i18n>CQLinhaDetail.amostra.title}"></Title>
                            <form:Form id="CQDetailLinha_amostra" editable="{ui>/isEditable}">
                                <form:layout>
                                    <form:ColumnLayout id="CQDetailLinha_amostra_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                </form:layout>

                                <form:FormContainer id="CQDetailLinha_amostra_container">
                                    <form:FormElement id="CQDetailLinha_amostra_LoteFornecedor_label" label="{i18n>CQLinhaDetail.amostra.LoteFornecedor}" visible="{= !${HideLoteFornecedor} }">
                                        <Text id="CQDetailLinha_amostra_LoteFornecedor" emptyIndicatorMode="On" text="{LoteFornecedor}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout1" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_LoteFornecedor_edit" value="{LoteFornecedor}" maxLength="20" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout3" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Acondhigiene_label" label="{i18n>CQLinhaDetail.amostra.Acondhigiene}" visible="{path: 'HideAcondhigiene', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Acondhigiene" emptyIndicatorMode="On" text="{AcondhigieneDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout4" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Acondhigiene_edit" selectedKey="{Acondhigiene}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout05" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Acondintegre_label" label="{i18n>CQLinhaDetail.amostra.Acondintegre}" visible="{path: 'HideAcondintegre', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Acondintegre" emptyIndicatorMode="On" text="{AcondintegreDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout5" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Acondintegre_edit" selectedKey="{Acondintegre}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout6" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Cestranho_label" label="{i18n>CQLinhaDetail.amostra.Cestranho}" visible="{path: 'HideCestranho', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Cestranho" emptyIndicatorMode="On" text="{CestranhoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout7" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Cestranho_edit" selectedKey="{Cestranho}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout8" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Pragas_label" label="{i18n>CQLinhaDetail.amostra.Pragas}" visible="{path: 'HidePragas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Pragas" emptyIndicatorMode="On" text="{PragasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout9" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Pragas_edit" selectedKey="{Pragas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout10" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <!-- Sal has a backend side effect (recalculates Salc) -->
                                    <form:FormElement id="CQDetailLinha_amostra_Sal_label" label="{i18n>CQLinhaDetail.amostra.Sal}" visible="{path: 'HideSal', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Sal" emptyIndicatorMode="On" text="{path:'Sal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout11" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Sal_edit" value="{path:'Sal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout12" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <!-- Salc: Computed -->
                                    <form:FormElement id="CQDetailLinha_amostra_Salc_label" label="{i18n>CQLinhaDetail.amostra.Salc}" visible="{path: 'HideSalc', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Salc" emptyIndicatorMode="On" text="{SalcDesc}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Hg_label" label="{i18n>CQLinhaDetail.amostra.Hg}" visible="{path: 'HideHg', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Hg" emptyIndicatorMode="On" text="{HgDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout13" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Hg_edit" selectedKey="{Hg}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout14" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Eviscerado_label" label="{i18n>CQLinhaDetail.amostra.Eviscerado}" visible="{path: 'HideEviscerado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Eviscerado" emptyIndicatorMode="On" text="{EvisceradoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout15" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Eviscerado_edit" selectedKey="{Eviscerado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout16" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Cpele_label" label="{i18n>CQLinhaDetail.amostra.Cpele}" visible="{path: 'HideCpele', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Cpele" emptyIndicatorMode="On" text="{CpeleDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout17" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Cpele_edit" selectedKey="{Cpele}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout18" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Aparado_label" label="{i18n>CQLinhaDetail.amostra.Aparado}" visible="{path: 'HideAparado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Aparado" emptyIndicatorMode="On" text="{AparadoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout19" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Aparado_edit" selectedKey="{Aparado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout21" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Ssangue_label" label="{i18n>CQLinhaDetail.amostra.Ssangue}" visible="{path: 'HideSsangue', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Ssangue" emptyIndicatorMode="On" text="{SsangueDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout22" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Ssangue_edit" selectedKey="{Ssangue}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout23" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Sespinha_label" label="{i18n>CQLinhaDetail.amostra.Sespinha}" visible="{path: 'HideSespinha', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Sespinha" emptyIndicatorMode="On" text="{SespinhaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout24" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Sespinha_edit" selectedKey="{Sespinha}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout25" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Desidratado_label" label="{i18n>CQLinhaDetail.amostra.Desidratado}" visible="{path: 'HideDesidratado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Desidratado" emptyIndicatorMode="On" text="{DesidratadoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout26" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Desidratado_edit" selectedKey="{Desidratado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout27" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Cristaisgelo_label" label="{i18n>CQLinhaDetail.amostra.Cristaisgelo}" visible="{path: 'HideCristaisgelo', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Cristaisgelo" emptyIndicatorMode="On" text="{CristaisgeloDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout28" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Cristaisgelo_edit" selectedKey="{Cristaisgelo}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout29" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Presencaunhas_label" label="{i18n>CQLinhaDetail.amostra.Presencaunhas}" visible="{path: 'HidePresencaunhas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Presencaunhas" emptyIndicatorMode="On" text="{PresencaunhasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout30" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Presencaunhas_edit" selectedKey="{Presencaunhas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout31" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Pamputadas_label" label="{i18n>CQLinhaDetail.amostra.Pamputadas}" visible="{path: 'HidePamputadas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Pamputadas" emptyIndicatorMode="On" text="{PamputadasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout32" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Pamputadas_edit" selectedKey="{Pamputadas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout33" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Npamputadas_label" label="{i18n>CQLinhaDetail.amostra.Npamputadas}" visible="{path: 'HideNpamputadas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Npamputadas" emptyIndicatorMode="On" text="{Npamputadas}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout34" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Npamputadas_edit" value="{Npamputadas}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout35" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Pele_label" label="{i18n>CQLinhaDetail.amostra.Pele}" visible="{path: 'HidePele', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Pele" emptyIndicatorMode="On" text="{PeleDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout36" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Pele_edit" selectedKey="{Pele}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout37" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Carne_label" label="{i18n>CQLinhaDetail.amostra.Carne}" visible="{path: 'HideCarne', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Carne" emptyIndicatorMode="On" text="{CarneDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout38" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Carne_edit" selectedKey="{Carne}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout39" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Tentaculo_label" label="{i18n>CQLinhaDetail.amostra.Tentaculo}" visible="{path: 'HideTentaculo', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Tentaculo" emptyIndicatorMode="On" text="{TentaculoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout40" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Tentaculo_edit" selectedKey="{Tentaculo}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout41" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Odor_label" label="{i18n>CQLinhaDetail.amostra.Odor}" visible="{path: 'HideOdor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Odor" emptyIndicatorMode="On" text="{OdorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout42" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Odor_edit" selectedKey="{Odor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout43" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Pabertas_label" label="{i18n>CQLinhaDetail.amostra.Pabertas}" visible="{path: 'HidePabertas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Pabertas" emptyIndicatorMode="On" text="{PabertasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout44" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Pabertas_edit" selectedKey="{Pabertas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout45" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Ppabertas_label" label="{i18n>CQLinhaDetail.amostra.Ppabertas}" visible="{path: 'HidePpabertas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Ppabertas" emptyIndicatorMode="On" text="{path:'Ppabertas', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout46" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Ppabertas_edit" value="{path:'Ppabertas', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout47" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Bexternas_label" label="{i18n>CQLinhaDetail.amostra.Bexternas}" visible="{path: 'HideBexternas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Bexternas" emptyIndicatorMode="On" text="{BexternasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout48" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Bexternas_edit" selectedKey="{Bexternas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout49" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Pbexternas_label" label="{i18n>CQLinhaDetail.amostra.Pbexternas}" visible="{path: 'HidePbexternas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Pbexternas" emptyIndicatorMode="On" text="{path:'Pbexternas', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout50" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Pbexternas_edit" value="{path:'Pbexternas', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout51" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Parasitas_label" label="{i18n>CQLinhaDetail.amostra.Parasitas}" visible="{path: 'HideParasitas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Parasitas" emptyIndicatorMode="On" text="{ParasitasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout52" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Parasitas_edit" selectedKey="{Parasitas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout53" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Idparasitas_label" label="{i18n>CQLinhaDetail.amostra.Idparasitas}" visible="{path: 'HideIdparasitas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Idparasitas" emptyIndicatorMode="On" text="{Idparasitas}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout54" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Idparasitas_edit" value="{Idparasitas}" maxLength="40" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout55" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Areia_label" label="{i18n>CQLinhaDetail.amostra.Areia}" visible="{path: 'HideAreia', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Areia" emptyIndicatorMode="On" text="{AreiaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout56" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Areia_edit" selectedKey="{Areia}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout57" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Humidade_label" label="{i18n>CQLinhaDetail.amostra.Humidade}" visible="{path: 'HideHumidade', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Humidade" emptyIndicatorMode="On" text="{path:'Humidade', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout58" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Humidade_edit" value="{path:'Humidade', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout59" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <!-- Humidadec: Computed -->
                                    <form:FormElement id="CQDetailLinha_amostra_Humidadec_label" label="{i18n>CQLinhaDetail.amostra.Humidadec}" visible="{path: 'HideHumidadec', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Humidadec" emptyIndicatorMode="On" text="{HumidadecDesc}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Qgelo_label" label="{i18n>CQLinhaDetail.amostra.Qgelo}" visible="{path: 'HideQgelo', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Qgelo" emptyIndicatorMode="On" text="{QgeloDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout60" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Qgelo_edit" selectedKey="{Qgelo}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout61" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Fendas_label" label="{i18n>CQLinhaDetail.amostra.Fendas}" visible="{path: 'HideFendas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Fendas" emptyIndicatorMode="On" text="{FendasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout62" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Fendas_edit" selectedKey="{Fendas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout63" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Amputacoes_label" label="{i18n>CQLinhaDetail.amostra.Amputacoes}" visible="{path: 'HideAmputacoes', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Amputacoes" emptyIndicatorMode="On" text="{AmputacoesDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout64" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Amputacoes_edit" selectedKey="{Amputacoes}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout65" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Clavicula_label" label="{i18n>CQLinhaDetail.amostra.Clavicula}" visible="{path: 'HideClavicula', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Clavicula" emptyIndicatorMode="On" text="{ClaviculaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout66" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Clavicula_edit" selectedKey="{Clavicula}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout67" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Mfigado_label" label="{i18n>CQLinhaDetail.amostra.Mfigado}" visible="{path: 'HideMfigado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Mfigado" emptyIndicatorMode="On" text="{MfigadoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout68" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Mfigado_edit" selectedKey="{Mfigado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout69" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Mvermelho_label" label="{i18n>CQLinhaDetail.amostra.Mvermelho}" visible="{path: 'HideMvermelho', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Mvermelho" emptyIndicatorMode="On" text="{MvermelhoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout70" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Mvermelho_edit" selectedKey="{Mvermelho}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout71" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Empoado_label" label="{i18n>CQLinhaDetail.amostra.Empoado}" visible="{path: 'HideEmpoado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Empoado" emptyIndicatorMode="On" text="{EmpoadoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout72" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Empoado_edit" selectedKey="{Empoado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout73" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Ressoado_label" label="{i18n>CQLinhaDetail.amostra.Ressoado}" visible="{path: 'HideRessoado', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Ressoado" emptyIndicatorMode="On" text="{RessoadoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout74" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Ressoado_edit" selectedKey="{Ressoado}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout75" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PeleCor_label" label="{i18n>CQLinhaDetail.amostra.PeleCor}" visible="{path: 'HidePeleCor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PeleCor" emptyIndicatorMode="On" text="{PeleCorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout76" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_PeleCor_edit" selectedKey="{PeleCor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout77" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PeleMusc_label" label="{i18n>CQLinhaDetail.amostra.PeleMusc}" visible="{path: 'HidePeleMusc', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PeleMusc" emptyIndicatorMode="On" text="{PeleMuscDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout78" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_PeleMusc_edit" selectedKey="{PeleMusc}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout79" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PeleOdor_label" label="{i18n>CQLinhaDetail.amostra.PeleOdor}" visible="{path: 'HidePeleOdor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PeleOdor" emptyIndicatorMode="On" text="{PeleOdorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout80" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_PeleOdor_edit" selectedKey="{PeleOdor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout81" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PeleTextura_label" label="{i18n>CQLinhaDetail.amostra.PeleTextura}" visible="{path: 'HidePeleTextura', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PeleTextura" emptyIndicatorMode="On" text="{PeleTexturaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout82" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_PeleTextura_edit" selectedKey="{PeleTextura}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout83" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_OlhosCor_label" label="{i18n>CQLinhaDetail.amostra.OlhosCor}" visible="{path: 'HideOlhosCor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_OlhosCor" emptyIndicatorMode="On" text="{OlhosCorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout84" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_OlhosCor_edit" selectedKey="{OlhosCor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout85" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_OlhosForma_label" label="{i18n>CQLinhaDetail.amostra.OlhosForma}" visible="{path: 'HideOlhosForma', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_OlhosForma" emptyIndicatorMode="On" text="{OlhosFormaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout86" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_OlhosForma_edit" selectedKey="{OlhosForma}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout87" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_GuelrasCor_label" label="{i18n>CQLinhaDetail.amostra.GuelrasCor}" visible="{path: 'HideGuelrasCor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_GuelrasCor" emptyIndicatorMode="On" text="{GuelrasCorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout88" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_GuelrasCor_edit" selectedKey="{GuelrasCor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout89" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_GuelrasMucosidade_label" label="{i18n>CQLinhaDetail.amostra.GuelrasMucosidade}" visible="{path: 'HideGuelrasMucosidade', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_GuelrasMucosidade" emptyIndicatorMode="On" text="{GuelrasMucosidadeDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout90" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_GuelrasMucosidade_edit" selectedKey="{GuelrasMucosidade}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout91" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_GuelrasOdor_label" label="{i18n>CQLinhaDetail.amostra.GuelrasOdor}" visible="{path: 'HideGuelrasOdor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_GuelrasOdor" emptyIndicatorMode="On" text="{GuelrasOdorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout92" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_GuelrasOdor_edit" selectedKey="{GuelrasOdor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout93" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_AbdomenSange_label" label="{i18n>CQLinhaDetail.amostra.AbdomenSange}" visible="{path: 'HideAbdomenSange', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_AbdomenSange" emptyIndicatorMode="On" text="{AbdomenSangeDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout94" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_AbdomenSange_edit" selectedKey="{AbdomenSange}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout95" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_AbdomenOdor_label" label="{i18n>CQLinhaDetail.amostra.AbdomenOdor}" visible="{path: 'HideAbdomenOdor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_AbdomenOdor" emptyIndicatorMode="On" text="{AbdomenOdorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout96" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_AbdomenOdor_edit" selectedKey="{AbdomenOdor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout97" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_GeloTina_label" label="{i18n>CQLinhaDetail.amostra.GeloTina}" visible="{path: 'HideGeloTina', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_GeloTina" emptyIndicatorMode="On" text="{GeloTinaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout98" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_GeloTina_edit" selectedKey="{GeloTina}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout99" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_EstadoFisico_label" label="{i18n>CQLinhaDetail.amostra.EstadoFisico}" visible="{path: 'HideEstadoFisico', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_EstadoFisico" emptyIndicatorMode="On" text="{EstadoFisicoText}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout101" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_EstadoFisico_edit" selectedKey="{EstadoFisico}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout102" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Apresentacao_label" label="{i18n>CQLinhaDetail.amostra.Apresentacao}" visible="{path: 'HideApresentacao', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Apresentacao" emptyIndicatorMode="On" text="{ApresentacaoText}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout104" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Apresentacao_edit" selectedKey="{Apresentacao}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout1042" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Corte_label" label="{i18n>CQLinhaDetail.amostra.Corte}" visible="{path: 'HideCorte', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Corte" emptyIndicatorMode="On" text="{CorteDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout105" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Corte_edit" selectedKey="{Corte}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout106" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Especie_label" label="{i18n>CQLinhaDetail.amostra.Especie}" visible="{path: 'HideEspecie', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Especie" emptyIndicatorMode="On" text="{EspecieDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout107" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Especie_edit" selectedKey="{Especie}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout108" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PeleAsa_label" label="{i18n>CQLinhaDetail.amostra.PeleAsa}" visible="{path: 'HidePeleAsa', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PeleAsa" emptyIndicatorMode="On" text="{PeleAsaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout109" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_PeleAsa_edit" selectedKey="{PeleAsa}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout110" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Cor_label" label="{i18n>CQLinhaDetail.amostra.Cor}" visible="{path: 'HideCor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Cor" emptyIndicatorMode="On" text="{CorDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout111" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Cor_edit" selectedKey="{Cor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout112" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Textura_label" label="{i18n>CQLinhaDetail.amostra.Textura}" visible="{path: 'HideTextura', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Textura" emptyIndicatorMode="On" text="{TexturaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout113" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Textura_edit" selectedKey="{Textura}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout114" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Limpeza_label" label="{i18n>CQLinhaDetail.amostra.Limpeza}" visible="{path: 'HideLimpeza', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Limpeza" emptyIndicatorMode="On" text="{LimpezaDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout115" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Limpeza_edit" selectedKey="{Limpeza}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout116" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Evisceracao_label" label="{i18n>CQLinhaDetail.amostra.Evisceracao}" visible="{path: 'HideEvisceracao', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Evisceracao" emptyIndicatorMode="On" text="{EvisceracaoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout117" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Evisceracao_edit" selectedKey="{Evisceracao}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout118" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Migas_label" label="{i18n>CQLinhaDetail.amostra.Migas}" visible="{path: 'HideMigas', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Migas" emptyIndicatorMode="On" text="{MigasDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout119" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Migas_edit" selectedKey="{Migas}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout120" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_PerdaPeso_label" label="{i18n>CQLinhaDetail.amostra.PerdaPeso}" visible="{path: 'HidePerdaPeso', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_PerdaPeso" emptyIndicatorMode="On" text="{path:'PerdaPeso', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout121" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_PerdaPeso_edit" value="{path:'PerdaPeso', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout122" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_CxGelo_label" label="{i18n>CQLinhaDetail.amostra.CxGelo}" visible="{path: 'HideCxGelo', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_CxGelo" emptyIndicatorMode="On" text="{CxGeloDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout123" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_CxGelo_edit" selectedKey="{CxGelo}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout124" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_FilmeAderente_label" label="{i18n>CQLinhaDetail.amostra.FilmeAderente}" visible="{path: 'HideFilmeAderente', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_FilmeAderente" emptyIndicatorMode="On" text="{FilmeAderenteDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout125" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_FilmeAderente_edit" selectedKey="{FilmeAderente}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout126" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_CumpreRoteiro_label" label="{i18n>CQLinhaDetail.amostra.CumpreRoteiro}" visible="{path: 'HideCumpreRoteiro', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_CumpreRoteiro" emptyIndicatorMode="On" text="{CumpreRoteiroDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout127" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_CumpreRoteiro_edit" selectedKey="{CumpreRoteiro}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout128" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_VidragemUnif_label" label="{i18n>CQLinhaDetail.amostra.VidragemUnif}" visible="{path: 'HideVidragemUni', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_VidragemUnif" emptyIndicatorMode="On" text="{VidragemUnifDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout129" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_VidragemUnif_edit" selectedKey="{VidragemUnif}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout130" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_MistHomo_label" label="{i18n>CQLinhaDetail.amostra.MistHomo}" visible="{path: 'HideMistHomo', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_MistHomo" emptyIndicatorMode="On" text="{MistHomoDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout131" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_MistHomo_edit" selectedKey="{MistHomo}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout132" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Residuos_label" label="{i18n>CQLinhaDetail.amostra.Residuos}" visible="{path: 'HideResiduos', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Residuos" emptyIndicatorMode="On" text="{ResiduosDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout133" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Residuos_edit" selectedKey="{Residuos}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout134" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Sabor_label" label="{i18n>CQLinhaDetail.amostra.Sabor}" visible="{path: 'HideSabor', formatter: '.formatter.hideFormatter'}">
                                        <Text id="CQDetailLinha_amostra_Sabor" emptyIndicatorMode="On" text="{SaborDesc}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout135" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Select id="CQDetailLinha_amostra_Sabor_edit" selectedKey="{Sabor}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout136" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Select>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_ObsRoteiro_label" label="{i18n>CQLinhaDetail.amostra.ObsRoteiro}" visible="{= !${HideObsRoteiro} }">
                                        <Text id="CQDetailLinha_amostra_ObsRoteiro" emptyIndicatorMode="On" text="{ObsRoteiro}" visible="{= !${ui>/isEditable} &amp;&amp; !${HideObsRoteiro} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout200" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <TextArea id="CQDetailLinha_amostra_ObsRoteiro_edit" value="{ObsRoteiro}" rows="4" growing="true" width="100%" change=".onFieldChange" visible="{= ${ui>/isEditable} &amp;&amp; !${HideObsRoteiro} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout201" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </TextArea>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_amostra_Responsavel_label" label="{i18n>CQLinhaDetail.amostra.Responsavel}" visible="{= !${HideLinhasResponsavel} }">
                                        <Text id="CQDetailLinha_amostra_Responsavel" emptyIndicatorMode="On" text="{Responsavel}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout202" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_amostra_Responsavel_edit" value="{Responsavel}" maxLength="100" showValueHelp="true" valueHelpRequest=".onValueHelpRequest" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout203" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>
                                </form:FormContainer>
                            </form:Form>

                            <Title id="CQDetailLinha_mps_title" level="Auto" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" visible="{path: 'HideMps', formatter: '.formatter.hideFormatter'}" text="{i18n>cqDetail.amostragens.subsection.mps.title}"/>
                            <layout:Grid id="CQDetailLinha_mps_grid3" defaultSpan="XL12 L12 M12 S12">
                                <OverflowToolbar id="CQDetailLinha_mps_table_toolbar" visible="{= ${ui>/isEditable} &amp;&amp; !${HideMps} }">
                                    <Button id="CQDetailLinha_mps_btn_getMp" text="{i18n>cqDetail.amostragens.subsection.mps.btn.getMp}" icon="sap-icon://factory" type="Emphasized" press=".onGetMp" visible="{= ${ui>/isEditable} &amp;&amp; !${HideMps} }"></Button>
                                </OverflowToolbar>

                                <macros:Table id="CQDetailLinha_mps_table" header="{i18n>cqDetail.amostragens.subsection.mps.title}" metaPath="_mps/@com.sap.vocabularies.UI.v1.LineItem" visible="{path: 'HideMps', formatter: '.formatter.hideFormatter'}" enableAutoColumnWidth="true">
                                    <macros:columns>
                                        <macros:Column id="CQDetailLinha_mps_column_Qtd1" key="num_Mp_Qtd1" header="{i18n>cqDetail.amostragens.subsection.mps.Qtd1}" anchor="DataField::Percent1" placement="Before" width="10rem" hAlign="End">
                                            <VBox id="CQDetailLinha_mps_Qtd1_box">
                                                <Text id="CQDetailLinha_mps_Qtd1" text="{path:'Qtd1', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_mps_Qtd1_edit" value="{path:'Qtd1', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_mps_column_Qtd2" key="num_Mp_Qtd2" header="{i18n>cqDetail.amostragens.subsection.mps.Qtd2}" anchor="DataField::Percent2" placement="Before" width="10rem" hAlign="End">
                                            <VBox id="CQDetailLinha_mps_Qtd2_box">
                                                <Text id="CQDetailLinha_mps_Qtd2" text="{path:'Qtd2', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_mps_Qtd2_edit" value="{path:'Qtd2', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>
                                    </macros:columns>
                                </macros:Table>
                            </layout:Grid>

                            <Title id="CQDetailLinha_perdaPeso_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.perdaPeso.title}"></Title>
                            <form:Form id="CQDetailLinha_perdaPeso" editable="{ui>/isEditable}">
                                <form:layout>
                                    <form:ColumnLayout id="CQDetailLinha_perdaPeso_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                </form:layout>

                                <form:FormContainer id="CQDetailLinha_perdaPeso_container">
                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPDeclarado_label" label="{i18n>CQLinhaDetail.perdaPeso.PPDeclarado}">
                                        <Text id="CQDetailLinha_perdaPeso_PPDeclarado" emptyIndicatorMode="On" text="{path:'PPDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout137" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPDeclarado_edit" value="{path:'PPDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout138" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPBruto_label" label="{i18n>CQLinhaDetail.perdaPeso.PPBruto}">
                                        <Text id="CQDetailLinha_perdaPeso_PPBruto" emptyIndicatorMode="On" text="{path:'PPBruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout139" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPBruto_edit" value="{path:'PPBruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout140" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPLiquido_label" label="{i18n>CQLinhaDetail.perdaPeso.PPLiquido}">
                                        <Text id="CQDetailLinha_perdaPeso_PPLiquido" emptyIndicatorMode="On" text="{path:'PPLiquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout141" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPLiquido_edit" value="{path:'PPLiquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout142" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPLiquidoEsc_label" label="{i18n>CQLinhaDetail.perdaPeso.PPLiquidoEsc}">
                                        <Text id="CQDetailLinha_perdaPeso_PPLiquidoEsc" emptyIndicatorMode="On" text="{path:'PPLiquidoEsc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout143" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPLiquidoEsc_edit" value="{path:'PPLiquidoEsc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout144" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPAposDescong_label" label="{i18n>CQLinhaDetail.perdaPeso.PPAposDescong}">
                                        <Text id="CQDetailLinha_perdaPeso_PPAposDescong" emptyIndicatorMode="On" text="{path:'PPAposDescong', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout145" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPAposDescong_edit" value="{path:'PPAposDescong', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout146" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPAposCozer_label" label="{i18n>CQLinhaDetail.perdaPeso.PPAposCozer}">
                                        <Text id="CQDetailLinha_perdaPeso_PPAposCozer" emptyIndicatorMode="On" text="{path:'PPAposCozer', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {PPUom}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout147" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPAposCozer_edit" value="{path:'PPAposCozer', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{PPUom}" fieldWidth="60%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout148" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>
                                </form:FormContainer>

                                <form:FormContainer id="CQDetailLinha_perdaPeso_container2">
                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercVidPlePl_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercVidPlePl}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercVidPlePl" emptyIndicatorMode="On" text="{PPPercVidPlePl}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercVidPleDec_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercVidPleDec}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercVidPleDec" emptyIndicatorMode="On" text="{PPPercVidPleDec}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercSal_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercSal}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercSal" emptyIndicatorMode="On" text="{path:'PPPercSal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" visible="{= !${ui>/isEditable} }">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout149" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Text>
                                        <Input id="CQDetailLinha_perdaPeso_PPPercSal_edit" value="{path:'PPPercSal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_layout150" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </Input>
                                    </form:FormElement>
                                </form:FormContainer>

                                <form:FormContainer id="CQDetailLinha_perdaPeso_container3">
                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercCozPl_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercCozPl}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercCozPl" emptyIndicatorMode="On" text="{PPPercCozPl}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercCozPle_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercCozPle}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercCozPle" emptyIndicatorMode="On" text="{PPPercCozPle}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercCozDec_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercCozDec}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercCozDec" emptyIndicatorMode="On" text="{PPPercCozDec}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercDesPl_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercDesPl}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercDesPl" emptyIndicatorMode="On" text="{PPPercDesPl}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_perdaPeso_PPPercDesCoz_label" label="{i18n>CQLinhaDetail.perdaPeso.PPPercDesCoz}">
                                        <Text id="CQDetailLinha_perdaPeso_PPPercDesCoz" emptyIndicatorMode="On" text="{PPPercDesCoz}"></Text>
                                    </form:FormElement>
                                </form:FormContainer>
                            </form:Form>

                            <Title id="CQDetailLinha_Peso_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.Peso.title}"></Title>

                            <Title id="CQDetailLinha_Peso_cx_title" titleStyle="H4" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.PesoCX.title}"></Title>

                            <layout:Grid id="CQDetailLinha_Peso_grid" defaultSpan="XL12 L12 M12 S12" hSpacing="0" class="sapUiTinyMarginTop">
                                <form:Form id="CQDetailLinha_PesoCX" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_PesoCX_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:toolbar>
                                        <OverflowToolbar id="CQDetailLinha_Peso_toolbar" visible="{= ${ui>/isEditable}}">
                                            <Button id="CQDetailLinha_Peso_btn_convertUm" text="{i18n>CQLinhaDetail.Peso.btn.convertUm}" icon="sap-icon://measure" type="Emphasized" press=".onPesosConverterUm" visible="{= ${ui>/isEditable}}"></Button>
                                        </OverflowToolbar>
                                    </form:toolbar>

                                    <form:FormContainer id="CQDetailLinha_PesoCX_container">
                                        <form:title>
                                            <core:Title id="CQDetailLinha_PesoCX_title" level="H4" text="{i18n>CQLinhaDetail.PesoCX.container.dim}"></core:Title>
                                        </form:title>

                                        <form:FormElement id="CQDetailLinha_PesoCX_Cxpesobruto_label" label="{i18n>CQLinhaDetail.PesoCX.Cxpesobruto}">
                                            <Text id="CQDetailLinha_PesoCX_Cxpesobruto" emptyIndicatorMode="On" text="{path:'Cxpesobruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuompeso}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoCX_Cxpesoliquido_label" label="{i18n>CQLinhaDetail.PesoCX.Cxpesoliquido}">
                                            <Text id="CQDetailLinha_PesoCX_Cxpesoliquido" emptyIndicatorMode="On" text="{path:'Cxpesoliquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuompeso}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoCX_Cxpesoliquidoesc_label" label="{i18n>CQLinhaDetail.PesoCX.Cxpesoliquidoesc}">
                                            <Text id="CQDetailLinha_PesoCX_Cxpesoliquidoesc" emptyIndicatorMode="On" text="{path:'Cxpesoliquidoesc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuompeso}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoCX_Cxtara_label" label="{i18n>CQLinhaDetail.PesoCX.Cxtara}">
                                            <Text id="CQDetailLinha_PesoCX_Cxtara" emptyIndicatorMode="On" text="{path:'Cxtara', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Cxuompeso}"></Text>
                                        </form:FormElement>
                                    </form:FormContainer>

                                </form:Form>
                                <form:Form id="CQDetailLinha_PesoCX2" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_PesoCX_layout2" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:FormContainer id="CQDetailLinha_PesoCX_container2">
                                        <form:title>
                                            <core:Title id="CQDetailLinha_PesoCX_title1" level="H4" text="{i18n>CQLinhaDetail.PesoCX.container.resumo}"></core:Title>
                                        </form:title>

                                        <form:FormElement id="CQDetailLinha_PesoCX_UnSumPb_label" label="{i18n>CQLinhaDetail.PesoCX.UnSumPb}">
                                            <Text id="CQDetailLinha_PesoCX_UnSumPb" emptyIndicatorMode="On" text="{path:'UnSumPb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {UnUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoCX_UnSumPl_label" label="{i18n>CQLinhaDetail.PesoCX.UnSumPl}">
                                            <Text id="CQDetailLinha_PesoCX_UnSumPl" emptyIndicatorMode="On" text="{path:'UnSumPl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {UnUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoCX_UnSumPle_label" label="{i18n>CQLinhaDetail.PesoCX.UnSumPle}">
                                            <Text id="CQDetailLinha_PesoCX_UnSumPle" emptyIndicatorMode="On" text="{path:'UnSumPle', 
                                            type:'Decimal',
                                            formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, 
                                            constraints:{precision:12,scale:2}} {UnUom}"></Text>
                                        </form:FormElement>
                                    </form:FormContainer>
                                </form:Form>


                                <macros:Table id="CQDetailLinha_PesoCX_table" header="{i18n>CQLinhaDetail.PesoCX.title}" metaPath="_PesosCX/@com.sap.vocabularies.UI.v1.LineItem">
                                    <macros:columns>
                                        <macros:Column id="CQDetailLinha_PesoCX_column_balanca" key="pesoCx_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_PesoCx_Pb" placement="Before" width="8rem" importance="High">
                                            <Button id="CQDetailLinha_PesoCX_btn_balanca" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoCxBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoCX_column_Pb" key="num_PesoCx_Pb" header="{i18n>CQLinhaDetail.PesoCX.Pb.column}" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_PesoCX_Pb_box">
                                                <Text id="CQDetailLinha_PesoCX_Pb" text="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_PesoCX_Pb_edit" value="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" fieldWidth="70%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoCX_column_Pl" key="num_PesoCx_Pl" header="{i18n>CQLinhaDetail.PesoCX.Pl.column}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoCX_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoCX_column_Declarado" key="num_PesoCx_Declarado" header="{i18n>CQLinhaDetail.PesoCX.Declarado.column}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoCX_Declarado" text="{path:'Declarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoCX_column_Ple" key="num_PesoCx_Ple" header="{i18n>CQLinhaDetail.PesoCX.Ple.column}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoCX_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>
                                    </macros:columns>
                                </macros:Table>


                                <Title id="CQDetailLinha_PesoUn_title" titleStyle="H4" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.PesoUN.title}"></Title>

                                <form:Form id="CQDetailLinha_PesoUn" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_PesoUn_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:toolbar>
                                        <OverflowToolbar id="CQDetailLinha_PesoUn_toolbar" visible="{= ${ui>/isEditable}}">
                                            <Button id="CQDetailLinha_PesoUn_btn_balanca" text="{i18n>CQLinhaDetail.PesoUN.btn.balanca}" icon="sap-icon://compare-2" type="Emphasized" press=".onPesoUnBalanca" visible="{= ${ui>/isEditable}}"></Button>
                                        </OverflowToolbar>
                                    </form:toolbar>

                                    <form:FormContainer id="CQDetailLinha_PesoUn_container">
                                        <form:title>
                                            <core:Title id="CQDetailLinha_PesoUn_form_title" level="H4" text="{i18n>CQLinhaDetail.PesoUN.container.dim}"></core:Title>
                                        </form:title>

                                        <form:FormElement id="CQDetailLinha_PesoUn_Nembalporcaixa_label" label="{i18n>CQLinhaDetail.PesoUN.Nembalporcaixa}">
                                            <Text id="CQDetailLinha_PesoUn_Nembalporcaixa" emptyIndicatorMode="On" text="{Nembalporcaixa}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoUn_Unpesobruto_label" label="{i18n>CQLinhaDetail.PesoUN.Unpesobruto}">
                                            <Text id="CQDetailLinha_PesoUn_Unpesobruto" emptyIndicatorMode="On" text="{path:'Unpesobruto', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoUn_Unpesoliquido_label" label="{i18n>CQLinhaDetail.PesoUN.Unpesoliquido}">
                                            <Text id="CQDetailLinha_PesoUn_Unpesoliquido" emptyIndicatorMode="On" text="{path:'Unpesoliquido', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoUn_Unpesoliquidoesc_label" label="{i18n>CQLinhaDetail.PesoUN.Unpesoliquidoesc}">
                                            <Text id="CQDetailLinha_PesoUn_Unpesoliquidoesc" emptyIndicatorMode="On" text="{path:'Unpesoliquidoesc', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}"></Text>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_PesoUn_Untara_label" label="{i18n>CQLinhaDetail.PesoUN.Untara}">
                                            <Text id="CQDetailLinha_PesoUn_Untara" emptyIndicatorMode="On" text="{path:'Untara', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Unuompeso}"></Text>
                                        </form:FormElement>
                                    </form:FormContainer>

                                </form:Form>

                                <form:Form id="CQDetailLinha_PesoUn2" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_PesoUn_layout2" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:FormContainer id="CQDetailLinha_PesoUn_container2">
                                        <form:title>
                                            <core:Title id="CQDetailLinha_PesoUn_form_title2" level="H4" text="{i18n>CQLinhaDetail.PesoUN.container.resumo}"></core:Title>
                                        </form:title>

                                        <form:FormElement id="CQDetailLinha_PesoUn_CxMinPl_label" label="{i18n>CQLinhaDetail.PesoUN.CxMinPl}">
                                            <Text id="CQDetailLinha_PesoUn_CxMinPl" emptyIndicatorMode="On" text="{path:'CxMinPl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {CxUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoUn_UnMedPl_label" label="{i18n>CQLinhaDetail.PesoUN.UnMedPl}">
                                            <Text id="CQDetailLinha_PesoUn_UnMedPl" emptyIndicatorMode="On" text="{path:'UnMedPl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {UnUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoUn_CxMaxPl_label" label="{i18n>CQLinhaDetail.PesoUN.CxMaxPl}">
                                            <Text id="CQDetailLinha_PesoUn_CxMaxPl" emptyIndicatorMode="On" text="{path:'CxMaxPl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {CxUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoUn_CxMinPle_label" label="{i18n>CQLinhaDetail.PesoUN.CxMinPle}">
                                            <Text id="CQDetailLinha_PesoUn_CxMinPle" emptyIndicatorMode="On" text="{path:'CxMinPle', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {CxUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoUn_UnMedPle_label" label="{i18n>CQLinhaDetail.PesoUN.UnMedPle}">
                                            <Text id="CQDetailLinha_PesoUn_UnMedPle" emptyIndicatorMode="On" text="{path:'UnMedPle', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {UnUom}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_PesoUn_CxMaxPle_label" label="{i18n>CQLinhaDetail.PesoUN.CxMaxPle}">
                                            <Text id="CQDetailLinha_PesoUn_CxMaxPle" emptyIndicatorMode="On" text="{path:'CxMaxPle', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {CxUom}"></Text>
                                        </form:FormElement>
                                    </form:FormContainer>
                                </form:Form>
                                <macros:Table id="CQDetailLinha_PesoUn_table" header="{i18n>CQLinhaDetail.PesoUN.title}" metaPath="_PesosUn/@com.sap.vocabularies.UI.v1.LineItem">
                                    <macros:columns>
                                        <macros:Column id="CQDetailLinha_PesoUn_column_Pb" key="num_PesoUn_Pb" header="{i18n>CQLinhaDetail.PesoUN.Pb}" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_PesoUn_Pb_box">
                                                <Text id="CQDetailLinha_PesoUn_Pb" text="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_PesoUn_Pb_edit" value="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" fieldWidth="80%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoUn_column_Pl" key="num_PesoUn_Pl" header="{i18n>CQLinhaDetail.PesoUN.Pl}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoUn_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoUn_column_Declarado" key="num_PesoUn_Declarado" header="{i18n>CQLinhaDetail.PesoUN.Declarado}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoUn_Declarado" text="{path:'Declarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoUn_column_PesoDeclarado" key="num_PesoUn_PesoDeclarado" header="{i18n>CQLinhaDetail.PesoUN.PesoDeclarado}" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_PesoUn_PesoDeclarado_box">
                                                <Text id="CQDetailLinha_PesoUn_PesoDeclarado" text="{path:'PesoDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_PesoUn_PesoDeclarado_edit" value="{path:'PesoDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" fieldWidth="80%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_PesoUn_column_Ple" key="num_PesoUn_Ple" header="{i18n>CQLinhaDetail.PesoUN.Ple}" width="10.7rem" hAlign="End" importance="High">
                                            <Text id="CQDetailLinha_PesoUn_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
                                        </macros:Column>
                                    </macros:columns>
                                </macros:Table>
                            </layout:Grid>

                            <Title id="CQDetailLinha_vidragem_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.Vidragem.title}"></Title>
                            <layout:Grid id="CQDetailLinha_vidragem_grid" defaultSpan="XL12 L12 M12 S12" hSpacing="0" class="sapUiTinyMarginTop">
                                <form:Form id="CQDetailLinha_vidragem" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_vidragem_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:FormContainer id="CQDetailLinha_vidragem_container">
                                        <form:FormElement id="CQDetailLinha_vidragem_MedVidragem_label" label="{i18n>CQLinhaDetail.Vidragem.MedVidragem}">
                                            <Text id="CQDetailLinha_vidragem_MedVidragem" emptyIndicatorMode="On" text="{MedVidragem}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_vidragem_Teorvidragem_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Teorvidragem}">
                                            <Text id="CQDetailLinha_vidragem_Teorvidragem" emptyIndicatorMode="On" text="{path:'Teorvidragem', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}"/>
                                        </form:FormElement>
                                        <form:FormElement id="CQDetailLinha_vidragem_VidragemM_label" label="{i18n>cqDetail.dadosProduto.ss.lote.VidragemM}">
                                            <Text id="CQDetailLinha_vidragem_VidragemM" emptyIndicatorMode="On" text="{path:'VidragemM', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}"/>
                                        </form:FormElement>
                                    </form:FormContainer>
                                </form:Form>

                                <macros:Table id="CQDetailLinha_Vidragem_table" header="{i18n>CQLinhaDetail.Vidragem.title}" metaPath="_Vidragens/@com.sap.vocabularies.UI.v1.LineItem">
                                    <macros:columns>
                                        <macros:Column id="CQDetailLinha_Vidragem_column_Ple" key="num_Vid_Ple" header="{i18n>CQLinhaDetail.Vidragem.VidPle}" anchor="DataField::Vidragem" placement="Before" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_Vidragem_Ple_box">
                                                <Text id="CQDetailLinha_Vidragem_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_Vidragem_Ple_edit" value="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" fieldWidth="80%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_Vidragem_column_balancaPle" key="pesoPle_vid_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_Vid_Ple" placement="Before" width="8rem" importance="High">
                                            <Button id="CQDetailLinha_Vidragem_btn_balancaPle" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoVidPleBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_Vidragem_column_Pl" key="num_Vid_Pl" header="{i18n>CQLinhaDetail.Vidragem.Pl}" anchor="pesoPle_vid_balanca" placement="Before" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_Vidragem_Pl_box">
                                                <Text id="CQDetailLinha_Vidragem_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_Vidragem_Pl_edit" value="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" fieldWidth="80%" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>

                                        <macros:Column id="CQDetailLinha_Vidragem_column_balancaPl" key="pesoPl_Vid_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_Vid_Pl" placement="Before" width="8rem" importance="High">
                                            <Button id="CQDetailLinha_Vidragem_btn_balancaPl" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoVidPlBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
                                        </macros:Column>
                                    </macros:columns>
                                </macros:Table>
                            </layout:Grid>

                            <Title id="CQDetailLinha_calibre_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.calibre.title}"></Title>
                            <layout:Grid id="CQDetailLinha_calibre_grid" defaultSpan="XL12 L12 M12 S12" hSpacing="0" class="sapUiTinyMarginTop">
                                <form:Form id="CQDetailLinha_calibre" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_calibre_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:toolbar>
                                        <OverflowToolbar id="CQDetailLinha_calibre_toolbar">
                                            <Button id="CQDetailLinha_calibre_btn_balanca" text="{i18n>CQLinhaDetail.PesoUN.btn.balanca}" icon="sap-icon://compare-2" type="Emphasized" press=".onPesoCalibreBalanca" visible="{= ${ui>/isEditable}}"></Button>
                                            <Button id="CQDetailLinha_calibre_btn_convertUm" text="{i18n>CQLinhaDetail.calibre.convertUm}" icon="sap-icon://measure" type="Emphasized" press=".onCalibresConverterUm" visible="{= ${ui>/isEditable}}"></Button>
                                        </OverflowToolbar>
                                    </form:toolbar>

                                    <form:FormContainer id="CQDetailLinha_calibre_container">
                                        <form:FormElement id="CQDetailLinha_calibre_CalibreUom_label" label="{i18n>CQLinhaDetail.calibre.CalibreUom}">
                                            <Text id="CQDetailLinha_calibre_CalibreUom" emptyIndicatorMode="On" text="{parts:[ 'CalibreUom', 'CalibreUomDesc' ], formatter:'.formatter.detailFieldFormatter'}" visible="{= !${ui>/isEditable} }">
                                                <layoutData>
                                                    <form:ColumnElementData id="CQDetailLinha_layout151" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Text>
                                            <Select id="CQDetailLinha_calibre_CalibreUom_edit" selectedKey="{CalibreUom}" forceSelection="false" width="100%" change=".onFieldChange" visible="{ui>/isEditable}" app:valueList="true">
                                                <layoutData>
                                                    <form:ColumnElementData id="CQDetailLinha_layout152" cellsSmall="12" cellsLarge="12"/>
                                                </layoutData>
                                            </Select>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_calibre_Calibremin_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Calibremin}">
                                            <Text id="CQDetailLinha_calibre_Calibremin" emptyIndicatorMode="On" text="{path:'Calibremin', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}"/>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_calibre_Calibremax_label" label="{i18n>cqDetail.dadosProduto.ss.lote.Calibremax}">
                                            <Text id="CQDetailLinha_calibre_Calibremax" emptyIndicatorMode="On" text="{path:'Calibremax', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:16,scale:2}}"/>
                                        </form:FormElement>
                                    </form:FormContainer>
                                </form:Form>

                                <macros:Table id="CQDetailLinha_calibre_table" header="{i18n>CQLinhaDetail.calibre.title}" metaPath="_Calibres/@com.sap.vocabularies.UI.v1.LineItem">
                                    <macros:columns>
                                        <macros:Column id="CQDetailLinha_calibre_column_Medicao" key="num_Cal_Medicao" header="{i18n>CQLinhaDetail.calibre.Medicao}" anchor="DataField::Posnr" placement="After" width="10.7rem" hAlign="End" importance="High">
                                            <VBox id="CQDetailLinha_calibre_Medicao_box">
                                                <Text id="CQDetailLinha_calibre_Medicao" text="{path:'Medicao', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                                                <Input id="CQDetailLinha_calibre_Medicao_edit" value="{path:'Medicao', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
                                            </VBox>
                                        </macros:Column>
                                    </macros:columns>
                                </macros:Table>
                            </layout:Grid>

                            <Title id="CQDetailLinha_Temperaturas_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.Temperatura.title}" visible="{path: 'HideTemperaturas', formatter: '.formatter.hideFormatter'}"></Title>
                            <layout:Grid id="CQDetailLinha_Temperaturas_grid" defaultSpan="XL12 L12 M12 S12" hSpacing="0" class="sapUiTinyMarginTop" visible="{path: 'HideTemperaturas', formatter: '.formatter.hideFormatter'}">
                                <form:Form id="CQDetailLinha_Temperaturas" editable="false">
                                    <form:layout>
                                        <form:ColumnLayout id="CQDetailLinha_Temperaturas_layout" columnsM="2" columnsL="3" columnsXL="6"/>
                                    </form:layout>

                                    <form:FormContainer id="CQDetailLinha_Temperaturas_container">
                                        <form:FormElement id="CQDetailLinha_Temperatura_MinTemp_label" label="{i18n>CQLinhaDetail.Temperatura.MinTemp}">
                                            <Text id="CQDetailLinha_Temperatura_MinTemp" emptyIndicatorMode="On" text="{MinTemp}"></Text>
                                        </form:FormElement>

                                        <form:FormElement id="CQDetailLinha_Temperatura_Maxtemp_label" label="{i18n>CQLinhaDetail.Temperatura.Maxtemp}">
                                            <Text id="CQDetailLinha_Temperatura_Maxtemp" emptyIndicatorMode="On" text="{Maxtemp}"></Text>
                                        </form:FormElement>
                                    </form:FormContainer>
                                </form:Form>
                                <macros:Table id="CQDetailLinha_Temperatura_table" header="{i18n>CQLinhaDetail.Temperatura.title}" metaPath="_Temperaturas/@com.sap.vocabularies.UI.v1.LineItem" />
                            </layout:Grid>

                            <!-- Observações Linha  -->
                            <Title id="CQDetailLinha_Observacoes_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.Observacoes.title}"></Title>
                            <form:Form id="CQDetailLinha_Observacoes_form" editable="{ui>/isEditable}" class="sapUiTinyMarginTop">
                                <form:layout>
                                    <form:ColumnLayout id="CQDetailLinha_Observacoes_form_layout" columnsM="1" columnsL="1" columnsXL="1"></form:ColumnLayout>
                                </form:layout>
                                <form:FormContainer id="CQDetailLinha_Observacoes_container">
                                    <form:FormElement id="CQDetailLinha_Observacoes_elem">
                                        <Text id="CQDetailLinha_Observacoes_obs" emptyIndicatorMode="On" text="{ObsLin}" visible="{= !${ui>/isEditable} }"></Text>
                                        <TextArea id="CQDetailLinha_Observacoes_obs_input" value="{ObsLin}" rows="4" growing="true" width="100%" change=".onFieldChange" visible="{ui>/isEditable}">
                                            <layoutData>
                                                <form:ColumnElementData id="CQDetailLinha_Observacoes_obs_input_layout" cellsSmall="12" cellsLarge="12"/>
                                            </layoutData>
                                        </TextArea>
                                    </form:FormElement>
                                </form:FormContainer>
                            </form:Form>

                            <!-- Administração Linha -->
                            <Title id="CQDetailLinha_admin_title" titleStyle="H3" class="sapUiTinyMarginBottom sapUiSmallMarginTop" text="{i18n>CQLinhaDetail.admin.title}"></Title>
                            <form:Form id="CQDetailLinha_admin_form" editable="false">
                                <form:layout>
                                    <form:ColumnLayout id="CQDetailLinha_admin_form_layout" columnsM="2" columnsL="3" columnsXL="3"></form:ColumnLayout>
                                </form:layout>
                                <form:FormContainer id="CQDetailLinha_admin_container">
                                    <form:FormElement id="CQDetailLinha_admin_DataCriacao_label" label="{i18n>CQLinhaDetail.admin.DataCriacao}">
                                        <Text id="CQDetailLinha_admin_DataCriacao" emptyIndicatorMode="On" text="{DataCriacao}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_admin_HorasCriacao_label" label="{i18n>CQLinhaDetail.admin.HorasCriacao}">
                                        <Text id="CQDetailLinha_admin_HorasCriacao" emptyIndicatorMode="On" text="{HorasCriacao}"></Text>
                                    </form:FormElement>

                                    <form:FormElement id="CQDetailLinha_admin_UserCriacao_label" label="{i18n>CQLinhaDetail.admin.UserCriacao}">
                                        <Text id="CQDetailLinha_admin_UserCriacao" emptyIndicatorMode="On" text="{UserCriacao}"></Text>
                                    </form:FormElement>
                                </form:FormContainer>
                            </form:Form>
                        </VBox>
                    </ScrollContainer>
                </content>
            </IconTabBar>
            </VBox>
        </f:content>

        <!-- NEW: draft footer (sample is a draft node: Apply only; Save/Cancel live on the Controlo page) -->
        <f:footer>
            <OverflowToolbar id="CQDetailLinha_footer">
                <Button id="CQDetailLinha_footer_messages" icon="sap-icon://message-popup" type="Emphasized" text="{= ${message>/}.length }" tooltip="{i18n>cqDetail.btn.messages}" visible="{= ${message>/}.length > 0 }" press=".onMessagesPress"/>
                <DraftIndicator id="CQDetailLinha_footer_draftIndicator"/>
                <ToolbarSpacer id="CQDetailLinha_footer_spacer"/>
                <Button id="CQDetailLinha_footer_apply" text="{i18n>CQLinhaDetail.btn.Apply}" type="Emphasized" press=".onApply"/>
            </OverflowToolbar>
        </f:footer>
    </f:DynamicPage>
</mvc:View>
```
