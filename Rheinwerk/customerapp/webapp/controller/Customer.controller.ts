import Input from "sap/m/Input";
import Page from "sap/m/Page";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import Route from "sap/ui/core/routing/Route";
import UIComponent from "sap/ui/core/UIComponent";

/**
 * @namespace com.sappress.customerapp.controller
 */
export default class Customer extends Controller {

    //Life-Cycle-Methods
    public onInit(): void {
        const oRouter = (this.getOwnerComponent() as UIComponent).getRouter();
        oRouter.getRoute("RouteDetail")?.attachPatternMatched(this._onPatternMatched.bind(this));
    }

    onBeforeRendering(): void | undefined {
        console.log("onBeforeRendering executed");
    }

    onAfterRendering(): void | undefined {
        console.log("onAfterRendering executed");
    }

    onExit(): void | undefined {
        console.log("onExit executed");
    }

    //Event-Handlers
    _onPatternMatched(oEvent: Event) {
        const oCustomerId = (oEvent as any).getParameter("arguments").customerId;
        this.getView()?.bindElement("/customers/" + oCustomerId);
        this._showCustomerFragment("CustomerDisplay");
    }

    _showCustomerFragment(sFragmentName: string) {
        Fragment.load({
            id: this.getView()?.createId(sFragmentName),
            name: "com.sappress.customerapp.view.fragments." + sFragmentName,
            controller: this
        }).then((oContent) => {
            const oPage = this.getView()?.byId("customer_page") as Page;
            oPage.removeAllContent();
            oPage.addContent(oContent as Control);
        })
    }

    onEditPress(oEvent: Event) {
        this._showCustomerFragment("CustomerEdit");
    }
}