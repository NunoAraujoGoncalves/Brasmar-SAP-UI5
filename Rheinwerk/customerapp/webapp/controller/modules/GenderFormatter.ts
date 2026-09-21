import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Controller from "sap/ui/core/mvc/Controller";
import ResourceModel from "sap/ui/model/resource/ResourceModel";

export default class GenderFormatter {
    public genderFormatter(this: Controller, sGender: string) {
        let oView = this.getView(),
            oi18nModel = oView?.getModel("i18n") as ResourceModel,
            oResourceBundle = oi18nModel.getResourceBundle() as ResourceBundle;
        return oResourceBundle.getText(sGender);
    }

}