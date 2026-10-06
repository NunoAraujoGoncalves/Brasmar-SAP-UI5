export const SERVICE_NAMESPACE = "com.sap.gateway.srvd.zui_tabcq_o4.v0001";

export const Actions = {
    print: `${SERVICE_NAMESPACE}.printCQ`,
    copy: `${SERVICE_NAMESPACE}.copy2`,
    changeMaterial: `${SERVICE_NAMESPACE}.changeMat`,
    doCalculations: `${SERVICE_NAMESPACE}.doCalculations`,
    concluir: `${SERVICE_NAMESPACE}.concluirCQ`,
    reabrir: `${SERVICE_NAMESPACE}.reabrirCQ`,
    aprovar: `${SERVICE_NAMESPACE}.aprovarCQ`,
    desaprovar: `${SERVICE_NAMESPACE}.desaprovarCQ`
} as const;