import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";

export default class NotFound extends Controller {

    public onInit(): void { }

    private onNavToMain() {
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteMain", undefined, undefined, true);
    }
}