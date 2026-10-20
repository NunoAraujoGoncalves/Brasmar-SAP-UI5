import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { Actions } from "./Constants";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import { openEmailDraft } from "./EmailDraft";

/** Chave de um CQ enviada à ação getEmailData (IsActiveEntity=false -> draft) */
export type CqKey = { Centro: string, ID: string, IsActiveEntity: boolean };

/** Resultado da ação getEmailData (estrutura ZRETURN_CQ_EMAIL) */
type EmailData = {
    to_addresses?: string;
    cc_addresses?: string;
    bc_addresses?: string;
    subject?: string;
    html_body?: string;
    
};

/**
 * Gera UM rascunho de email para 1..n controlos de qualidade:
 * chama uma vez a ação estática getEmailData com a lista de CQs e abre o .eml no Outlook.
 * @param contexts contextos CQCab (página de detalhe: [contexto da página]; lista: linhas selecionadas)
 */
export async function openCqEmailDraft(contexts: Context[]): Promise<void> {
    if (contexts.length === 0) {
        throw new Error("No CQ selected");
    }
    const keys = uniqueKeys(await Promise.all(contexts.map(toKey)));
    const email = await requestEmailData(contexts[0].getModel() as ODataModel, keys);
    openEmailDraft({
        to: email.to_addresses,
        cc: email.cc_addresses,
        bcc: email.bc_addresses,
        subject: email.subject,
        htmlBody: email.html_body
    })
}


/** Chave do CQ (lida do contexto; requestProperty carrega-a se ainda não estiver em cache) */
async function toKey(context: Context): Promise<CqKey> {
    const [centro, id, isActiveEntity] = await Promise.all([
        context.requestProperty("Centro") as Promise<string>,
        context.requestProperty("ID") as Promise<string>,
        context.requestProperty("IsActiveEntity") as Promise<boolean | undefined>
    ]);
    return { Centro: centro, ID: id, IsActiveEntity: isActiveEntity !== false };
}

/** Remove repetidos mantendo a ordem da tabela */
function uniqueKeys(keys: CqKey[]): CqKey[] {
    const seen = new Set<string>();
    return keys.filter((key) => {
        const id = `${key.Centro}|${key.ID}|${String(key.IsActiveEntity)}`;
        if (seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
}

/**
 * Ação estática (ligada à coleção /CQCab): um só POST com todos os CQs.
 * Operation binding porque editFlow.invokeAction (1.120) não devolve o resultado da ação.
 */
async function requestEmailData(model: ODataModel, keys: CqKey[]): Promise<EmailData> {
    const operation = model.bindContext(`/CQCab/${Actions.getEmails}(...)`) as ODataContextBinding;
    try {
        operation.setParameter("keys", JSON.stringify(keys));
        await operation.execute();
        return ((await operation.getBoundContext().requestObject()) ?? {}) as EmailData;
    } finally {
        operation.destroy();
    }
}