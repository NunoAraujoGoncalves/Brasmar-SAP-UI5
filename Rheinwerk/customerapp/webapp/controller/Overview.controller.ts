import Controller from "sap/ui/core/mvc/Controller";
import GenderFormatter from "./modules/GenderFormatter";
import Event from "sap/ui/base/Event";
import ColumnListItem from "sap/m/ColumnListItem";
import UIComponent from "sap/ui/core/UIComponent";

/**
 * @namespace com.sappress.customerapp.controller
 */
export default class Overview extends Controller {
    formatter = new GenderFormatter();


    //Life-Cycle-Methods
    public onInit(): void {

        // let oModel = new JSONModel({
        //     firstName: "Max",
        //     age: 27,
        //     isEditable: true,
        //     people: [{
        //         firstName: "Max",
        //         age: 27
        //     }, {
        //         firstName: "Daniel",
        //         age: 26
        //     }]
        // });

        // this.getView()?.setModel(oModel);
    }

    onCustomerPress(oEvent: Event) {
        const oColumnListItem = oEvent.getSource() as ColumnListItem,
            oBindingContext = oColumnListItem.getBindingContext(),
            oCustomer = oBindingContext?.getObject(),
            sCustomerID2 = oBindingContext?.getPath().split("/").at(-1),
            sCustomerID = (oCustomer as any)?.Customerid;

        const oRouter = (this.getOwnerComponent() as UIComponent)?.getRouter();
        oRouter.navTo("RouteDetail", {
            customerId: sCustomerID2
        })
        debugger;
    }
}