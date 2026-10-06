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
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import DynamicPage from "sap/f/DynamicPage";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQDetail extends Controller {

    formatter = new Formatter();
    editHelper: EditHelper;
    oPopover: Promise<Popover> | undefined;


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

        await this.getExtensionAPI().getEditFlow().deleteDocument(context, {
            title: this.getText("cqDetail.delete.title"),
            description: this.getText("cqDetail.delete.description", [String(context.getProperty("ID"))])
        });

        page.setBusy(false);
    }

    public async onPrint(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        const context = this.getContext();

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.print, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.print"),
        });

        page.setBusy(false);
        const url = (await context.requestProperty("Attachment")) as string | undefined;
        if (url) {
            mobileLibrary.URLHelper.redirect(url, true);
        }
    }

    public async onCopy(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.copy, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.copy"),
            requiresNavigation: false
        });

        page.setBusy(false);
    }

    public async onConcluir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.concluir, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.Concluir")
        });

        page.setBusy(false);
    }

    public async onReabrir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.reabrir, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.Reabrir")
        });

        page.setBusy(false);
    }

    public async onAprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.aprovar, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.Aprovar")
        });

        page.setBusy(false);
    }

    public async onDesaprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.desaprovar, {
            contexts: this.getContext(),
            invocationGrouping: "Isolated",
            label: this.getText("cqDetail.btn.Desaprovar")
        })

        page.setBusy(false);
    }

    /* ---------- title bar, edit mode ---------- */

    public async onChangeMaterial(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().invokeAction(Actions.changeMaterial, {
            contexts: this.getContext(),
            label: this.getText("cqDetail.btn.modifyMaterial")
        })

        page.setBusy(false);
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