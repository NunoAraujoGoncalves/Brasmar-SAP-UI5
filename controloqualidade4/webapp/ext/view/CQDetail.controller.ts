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


    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetail_footer_draftIndicator");
    }

    public onExit(): void {
        this.editHelper.destroy();
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


    /* ---------- footer ---------- */

    public async onSave(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().saveDocument(this.getContext());

        page.setBusy(false);
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