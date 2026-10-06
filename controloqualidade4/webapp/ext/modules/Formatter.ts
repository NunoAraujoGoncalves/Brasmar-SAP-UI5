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

    // public qtdFormatter(this: CQLinhaDetail, sQtd: string | undefined, sUom: string) {
    //     let rounded: string;
    //     if (typeof sQtd === 'string') {
    //         const normalised = sQtd.replace('.', '').replace(',', '.');
    //          rounded = this.formatter.formatWithSpace(parseFloat(normalised));               
    //         // rounded = parseFloat(normalised).toFixed(2);
    //     } else {
    //         rounded = parseFloat('0').toFixed(2);
    //     }

    //     return `${rounded} ${sUom}`;
    // }

    // public formatWithSpace(value: number) {
    //     return new Intl.NumberFormat('fr-FR', {
    //         minimumFractionDigits: 2,
    //         maximumFractionDigits: 2
    //     }).format(value);
    // }

    public detailLineFormatter(this: Controller, sI18n: string, sLine: string) {
        return `${sI18n}: ${sLine}`;
    }
}