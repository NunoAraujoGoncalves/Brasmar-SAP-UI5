import Input from "sap/m/Input";
import Controller from "sap/ui/core/mvc/Controller";

/**
 * @namespace com.sappress.customerapp.controller
 */
export default class Main extends Controller {

    //Life-Cycle-Methods
    public onInit(): void {
        console.log("onInit executed");
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
    onButtonPressed() {
        let oView = this.getView();
        let oFirstNameInput = oView?.byId("inpFirstname") as Input;
        let sFirstValue = oFirstNameInput.getValue();
        
        console.log("Button pressed!");
        console.log(`First name is ${ sFirstValue }`);
    }
}