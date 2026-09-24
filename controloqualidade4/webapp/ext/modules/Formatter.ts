import Controller from "sap/fe/core/PageController";

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

    public qtdFormatter(this: Controller, sQtd: string | undefined, sUom: string) {
        let rounded: string;
        if (typeof sQtd === 'string') {
            const normalised = sQtd.replace(',','.');
            rounded = parseFloat(normalised).toFixed(2);
        } else {
            rounded = parseFloat('0').toFixed(2);
        }

        return `${rounded} ${sUom}`;
    }
}