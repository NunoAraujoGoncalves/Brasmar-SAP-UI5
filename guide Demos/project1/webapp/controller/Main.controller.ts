import Controller from "sap/ui/core/mvc/Controller";
// import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace project1.controller
 */
export default class Main extends Controller {

    public onInit(): void {
        let oView = this.getView();
        // oInputFirstname = oView?.byId("inputFirstname") as Input;
        // oInputFirstname.setValue("Daniel");

        const model: JSONModel = new JSONModel({
            books: [{
                name: "Call of Cthulhu",
                author: "H. P. Lovecraft",
                price: 25.00,
                priceUnit: "€",
                releaseYear: 1928,
                inStock: true
            }, {
                name: "W40K: Rise of Horus",
                author: "Dan Abnett",
                price: 12.99,
                priceUnit: "€",
                releaseYear: 2006,
                inStock: true
            }, {
                name: "Catilinarian orations",
                author: "Marcus Tullius Cicero",
                price: 18.99,
                priceUnit: "€",
                releaseYear: -63,
                inStock: false
            }, {
                name: "The Brothers Karamazov",
                author: "Fjodor Dostojewski",
                price: 10.66,
                priceUnit: "€",
                releaseYear: 1880,
                inStock: true
            }]
        });
        oView?.setModel(model);
    }


    private onSavePressed() {
        MessageToast.show("Successfully saved");
    }


    private onCancelPressed() {
        MessageBox.warning("Are you sure you want to cancel?", {
            actions: [MessageBox.Action.YES, MessageBox.Action.NO],
            emphasizedAction: MessageBox.Action.YES,
            onClose: (sSelectedAction: string | null) => {
                if (MessageBox.Action.YES === sSelectedAction) {
                    MessageBox.success("Successfully cancelled.");
                }
            }
        });
    }
}