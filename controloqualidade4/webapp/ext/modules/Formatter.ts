import Controller from "sap/fe/core/PageController";

export default class Formatter {
    public detailHeaderFormatter(this: Controller, sID: string) {  
        return `ID: ${sID === ''? ' - ': sID }`;
    }

    public detailFieldFormatter(this: Controller, sValue: string, sDesc: string) {
        return `${sDesc} (${sValue})`;
    }
}