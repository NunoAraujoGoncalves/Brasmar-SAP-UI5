import Controller from "sap/fe/core/PageController";
import Event from "sap/ui/base/Event";
import FilterBar from "sap/fe/macros/filterBar/FilterBarAPI";
import TableAPI from "sap/fe/macros/table/TableAPI";
import MessageToast from "sap/m/MessageToast";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";

const COUNT_TABS = ["main_IconTabBar_todos", "main_IconTabBar_pendentes", "main_IconTabBar_concluidos", "main_IconTabBar_aprovados"];

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.main
 */
export default class Main extends Controller {

    private firstRouteMatch = true;

    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.getAppComponent().getRouter().getRoute("CQCabMain")?.attachPatternMatched(this.onRouteMatched, this);
    }


    public onExit(): void {
        this.getAppComponent().getRouter().getRoute("CQCabMain")?.detachPatternMatched(this.onRouteMatched, this);
    }

    /*  Filtros section  */

    onFilterSelect(oEvent: Event) {
        let sKey = (oEvent as any).getParameter("key"),
            oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        this.setStatusFilter(sKey);
    }

    private async setStatusFilter(oKey: string) {
        let oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        if (oKey === 'all') {
            await oFilterSelect.setFilterValues("Estado", "", []);

        } else if (oKey === 'pendentes') {
            await oFilterSelect.setFilterValues("Estado", "", ["A"]);

        } else if (oKey === 'concluidos') {
            await oFilterSelect.setFilterValues("Estado", "", ["B"]);

        } else if (oKey === 'aprovados') {
            await oFilterSelect.setFilterValues("Estado", "", ["C"]);
        }
        oFilterSelect.triggerSearch();
    }


    /* ---------- main tab buttons ---------- */
    public async onCreate(): Promise<void> {
        await this.getExtensionAPI().getEditFlow().createDocument("/CQCab", {
            creationMode: "NewPage"
        });
    }


    public async onDelete(): Promise<void> {
        const table = this.byId("main_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            MessageBox.warning(this.getText("main.noSelections.error"));
            // MessageToast.show(this.getText("main.noSelections.error"));
            return;
        }

        //Verifica se as linhas selecionadas podem ser apagadas
        const deletable = await Promise.all(selected.map((context) =>
            context.requestProperty("__EntityControl/Deletable") as Promise<boolean | undefined>));
        const toDelete = selected.filter((_context, index) => deletable[index] === true);
        const skipped = selected.length - toDelete.length;

        if (toDelete.length === 0) {
            MessageBox.warning(this.getText("main.delete.notAllowed"));
            return;
        }

        const confirmed = await this.confirm(
            this.getText("main.delete.title"),
            this.getText("main.delete.confirm", [String(toDelete.length)])
            + (skipped > 0 ? `\n\n${this.getText("main.delete.skipped", [String(skipped)])}` : "")
        );

        if (!confirmed) {
            return;
        }

        table.setBusy(true);
        const results = await Promise.allSettled(toDelete.map((context) => context.delete()));
        table.setBusy(false);

        const failed = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
        if (failed.length > 0) {
            MessageBox.error(this.getText("main.delete.failed", [String(failed.length)]), {
                details: failed.map((result) => String((result.reason as Error)?.message ?? result.reason)).join("\n")
            });
            table.refresh();
        } else {
            MessageToast.show(this.getText("main.delete.success", [String(toDelete.length)]));
        }
        this.refreshCounts();
    }


    /* ---------- helpers ---------- */
    /**
     * Ao voltar do CQDetail (novo controlo gravado, alterado ou eliminado)
     * atualiza a tabela e os contadores dos separadores.
     * Na primeira entrada não faz nada para não duplicar o pedido inicial.
     */
    private onRouteMatched(): void {
        if (this.firstRouteMatch) {
            this.firstRouteMatch = false;
            return;
        }
        (this.byId("main_table") as TableAPI | undefined)?.refresh();
        this.refreshCounts();

        const uiModel = this.getView()?.getModel("ui") as JSONModel | undefined;
        if (uiModel && uiModel.getProperty("/isEditable") !== false) {
            uiModel?.setProperty("/isEditable", false);
            uiModel.setProperty("/editMode", "Display");
        }
    }

    private refreshCounts(): void {
        COUNT_TABS.forEach((id) => this.byId(id)?.getBinding("count")?.refresh());
    }

    private confirm(title: string, text: string): Promise<boolean> {
        return new Promise((resolve) => {
            MessageBox.confirm(text, {
                title,
                actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.DELETE,
                onClose: (action: string) => resolve(action === MessageBox.Action.DELETE)
            })
        });
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }
}