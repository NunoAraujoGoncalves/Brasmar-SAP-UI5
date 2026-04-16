import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";

export default class Detail extends Controller {

    public onInit(): void {
        let oRouter = (this.getOwnerComponent() as UIComponent).getRouter(),
            oRoute = oRouter.getRoute("Detail");
        oRoute?.attachPatternMatched(this.onPatternMatched.bind(this), this);
    }

    private onPatternMatched(oEvent: Event) {
        let oArguments = (oEvent as any).getParameters().arguments,
            sPath = decodeURIComponent(oArguments.path);
        this.getView()?.bindElement({
            path: sPath,
            events: {
                dataReceived: (oResult: any) => {
                    if (!oResult.getParameters().data) {
                        (this.getOwnerComponent() as UIComponent).getRouter().navTo("NotFound", undefined, undefined, true);
                    }
                }
            }
        });
    }
}