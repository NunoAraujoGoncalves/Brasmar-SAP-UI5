import Controller from "sap/fe/core/PageController";
import CQLinhaDetail from "../view/CQLinhaDetail.controller"

export default class Formatter {
    public detailHeaderFormatter(this: Controller, sID: string) {
        return `ID: ${sID === '' ? ' - ' : sID}`;
    }

    public detailFieldFormatter(this: Controller, sValue: string, sDesc: string) {
        return `${sDesc} (${sValue})`;
    }

    public detailIconFormatter(this: Controller, sValue: string, sMMValue: string) {
        return sValue !== sMMValue ? "sap-icon://alert" : "";
    }

    public detailStatusFormatter(this: Controller, sValue: string, sMMValue: string) {
        return sValue !== sMMValue ? "Warning" : "None";
    }

    public hideFormatter(this: Controller, sValue: boolean) {
        return !sValue;
    }

    public detailLineFormatter(this: Controller, sI18n: string, sLine: string) {
        return `${sI18n}: ${sLine}`;
    }
}