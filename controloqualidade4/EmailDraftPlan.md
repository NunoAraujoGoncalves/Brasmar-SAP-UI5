# EmailDraftPlan: HTML email draft for one or many CQs (detail page + list selection)

## Context
The **Enviar email** button on `CQDetail` (`CQDetail_dynamicPage_Email`, `press=".onMail"`) calls `URLHelper.triggerEmail` with hard-coded addresses and an HTML string ([CQDetail.controller.ts:181](controloqualidade4/webapp/ext/view/CQDetail.controller.ts#L181)). `triggerEmail` only builds a `mailto:` URL, and `mailto:` bodies are **plain text only** (RFC 6068). The HTML tags show up literally in the email, and long bodies hit the ~2,000-character URL limit.

**Intended outcome:**
1. **The backend builds the email.** A new RAP action **`getEmailData`** receives **one or more CQ keys** and returns **one** email for all of them: To, CC, BCC, subject and HTML body. For example, one table in the body with a row per CQ.
2. **Two entry points, same logic:**
   - **CQ detail:** the existing **Enviar email** button sends just the current CQ (active or draft).
   - **CQ list (Main):** a new **Enviar email** table action, enabled when rows are selected, sends **all selected CQs** and produces **one** email.
3. **The frontend opens it as an HTML draft (option 1):** it builds an `.eml` file with `X-Unsent: 1` and downloads it. When opened, Outlook shows a **new, editable message** with the HTML formatting kept. The user reviews it and presses Send.

### Why a *static* action (and not an instance action)
- **Instance action:** the backend handles each selected CQ as a separate instance (`keys` has one row per CQ, and the result has one row per CQ). Through OData V4, N contexts become N POSTs, so you would get **N** emails, or N fragments the frontend would have to merge.
- **Static action:** in OData V4 a RAP static action is bound to the **collection** (`/CQCab/<ns>.getEmailData`). It is called **once**, receives the list of CQs as a parameter, and returns **one** result.
- **Same action everywhere:** the detail page calls it with a list of one CQ, so there is only one backend method and one frontend code path.

## Part A: Backend (RAP), declaration only
Names in angle brackets are your existing objects. Replace them with the real BDEF, alias and class names.

### A1. Parameter: abstract entity `ZA_CQ_EMAIL_PARAM`

```abap
@EndUserText.label: 'Parâmetro: controlos de qualidade para o email'
define abstract entity ZA_CQ_EMAIL_PARAM
{
  "! Lista de CQs em JSON:
  "! [ { "Centro": "1000", "ID": "1000000003", "IsActiveEntity": true }, ... ]
  "! IsActiveEntity = false -> ler o draft do utilizador (email enviado a partir do CQ em edição)
  Keys : abap.string(0);
}
```

**Why a JSON string:** a flat `string` parameter works on every RAP release. The backend parses it, for example with `/ui2/cl_json=>deserialize` into a table of `{ centro, id, isactiveentity }` (use `pretty_name = camel_case`), or with `XCO_CP_JSON` in ABAP Cloud.

**Alternative for S/4HANA 2023 or later / ABAP Cloud:** a **deep parameter** (an abstract entity with a composition to a key list: `static action getEmailData deep parameter ZA_CQ_EMAIL_DEEP …`) avoids the JSON. The frontend would then send a structured `Keys` array instead of `JSON.stringify(...)`. The rest of this plan stays the same.

### A2. Result structure (DDIC): `ZRETURN_CQ_EMAIL`
This follows the existing `zreturn_cq_descodifica_*` result structures.

| Component | Type | OData property | Content |
|---|---|---|---|
| `TO_ADDRESSES` | `STRING` | `ToAddresses` | Recipients, separated by `;` (for all the CQs together, without duplicates) |
| `CC_ADDRESSES` | `STRING` | `CcAddresses` | CC recipients, separated by `;` (may be empty) |
| `BCC_ADDRESSES` | `STRING` | `BccAddresses` | BCC recipients, separated by `;` (may be empty) |
| `SUBJECT` | `STRING` | `Subject` | For example "Controlo de qualidade 1000000003", or "Controlos de qualidade (5)" for several |
| `HTML_BODY` | `STRING` | `HtmlBody` | One HTML body covering all the CQs, with **inline styles only**, because Outlook ignores `<style>` and CSS classes |

### A3. Behavior definition (root BDEF), entity `CQCab`

```abap
  " Dados de UM email para 1..n controlos (destinatários, assunto e corpo HTML),
  " para o frontend abrir um rascunho. Estática: é chamada uma vez com a lista de CQs.
  " Não altera dados.
  static action getEmailData parameter ZA_CQ_EMAIL_PARAM result [1] zreturn_cq_email;
```

- **No lock or instance features:** a static action isn't tied to one instance, so it never locks a CQ. It can be called from the list and from the detail page in display or edit mode without touching the draft or the edit lock.
- **Alternative:** in recent RAP releases a **`static function`** (`static function getEmailData parameter … result [1] …`) is the semantically correct type for a read-only operation, and is called with GET. It also works with the frontend code below, because the operation binding handles both.

### A4. Projection BDEF

```abap
  use action getEmailData;
```

The service definition needs no change. After activation, `$metadata` contains:

```xml
<Action Name="getEmailData" IsBound="true">
    <Parameter Name="_it" Type="Collection(com.sap.gateway.srvd.zui_tabcq_o4.v0001.CQCabType)" Nullable="false"/>
    <Parameter Name="Keys" Type="Edm.String" Nullable="false"/>
    <ReturnType Type="com.sap.gateway.srvd.zui_tabcq_o4.v0001.zreturn_cq_email" Nullable="false"/>
</Action>
<ComplexType Name="zreturn_cq_email">
    <Property Name="ToAddresses" Type="Edm.String" Nullable="false"/>
    <Property Name="CcAddresses" Type="Edm.String" Nullable="false"/>
    <Property Name="BccAddresses" Type="Edm.String" Nullable="false"/>
    <Property Name="Subject" Type="Edm.String" Nullable="false"/>
    <Property Name="HtmlBody" Type="Edm.String" Nullable="false"/>
</ComplexType>
```

### A5. Behavior pool (`<behavior implementation class>`, local handler for `CQCab`): method declaration

```abap
    "! <p class="shorttext">Dados de um rascunho de email para 1..n controlos de qualidade</p>
    "! Ação ESTÁTICA: KEYS tem uma linha por chamada (%cid + %param), não uma por CQ.
    "! <ul>
    "!   <li>Entrada %param-keys: JSON com a lista de CQs
    "!       [ { "Centro": "...", "ID": "...", "IsActiveEntity": true|false }, ... ]
    "!       IsActiveEntity = false -> ler os dados do draft (READ ENTITIES ... %is_draft = if_abap_behv=>mk-on)</li>
    "!   <li>Saída: UMA linha em RESULT por linha de KEYS (%cid = keys-%cid), com %param:
    "!     <ul>
    "!       <li>to_addresses  : destinatários de todos os CQs, sem duplicados (separados por ';')</li>
    "!       <li>cc_addresses  : destinatários em CC (separados por ';', pode ser vazio)</li>
    "!       <li>bcc_addresses : destinatários em BCC (separados por ';', pode ser vazio)</li>
    "!       <li>subject       : assunto (singular para 1 CQ, plural para vários)</li>
    "!       <li>html_body     : corpo HTML único com a informação de TODOS os CQs (estilos inline)</li>
    "!     </ul></li>
    "! </ul>
    "! Não altera dados. Erros (JSON inválido, CQ inexistente, sem destinatários) em FAILED / REPORTED
    "! com %cid = keys-%cid e a mensagem para o utilizador.
    METHODS getEmailData FOR MODIFY
      IMPORTING keys FOR ACTION CQCab~getEmailData RESULT result.
```

As requested, there is no implementation logic. For a static action, the result row must carry the `%cid` of its key row: `APPEND VALUE #( %cid = <key>-%cid %param = ... ) TO result`.

### A6. Local mock metadata
After activation, refresh `controloqualidade4/webapp/localService/mainService/metadata.xml` (Fiori tools: *Update service metadata*) so `npm run start-mock` knows the action. The live service (`npm start`) reads the new `$metadata` directly.

## Part B: Frontend

### B1. Files
| File | Change |
|---|---|
| `controloqualidade4/webapp/ext/modules/Constants.ts` | `Actions.getEmailData` |
| `controloqualidade4/webapp/ext/modules/EmailDraft.ts` | **new**: builds and downloads the `.eml` draft (generic, no OData) |
| `controloqualidade4/webapp/ext/modules/CqEmail.ts` | **new**: turns CQ contexts into keys, calls `getEmailData` once and opens the draft. Used by both pages |
| `controloqualidade4/webapp/ext/view/CQDetail.controller.ts` | `onMail` calls `openCqEmailDraft([this.getContext()])`, `URLHelper` field removed (full source below) |
| `controloqualidade4/webapp/ext/main/Main.view.xml` | New table action **Enviar email** (`requiresSelection`) |
| `controloqualidade4/webapp/ext/main/Main.controller.ts` | `onMail` calls `openCqEmailDraft(selectedContexts)` (full source below) |
| `controloqualidade4/webapp/i18n/i18n.properties` | 2 keys for CQDetail and 3 for Main |

The CQDetail view doesn't change: the button already calls `.onMail`.

### B2. Flow (both pages)
1. **Contexts:** CQDetail uses `[pageContext]`, which may be the draft. Main uses `table.getSelectedContexts()`.
2. **Keys:** `CqEmail.toKey(context)` reads `Centro`, `ID` and `IsActiveEntity` with `requestProperty`. Duplicates are removed and the table order is kept.
3. **One static action call:**
   - `model.bindContext("/CQCab/<ns>.getEmailData(...)")`, then `setParameter("Keys", JSON.stringify(keys))`, then `await execute()`, then `getBoundContext().requestObject()`. The binding is destroyed afterwards.
   - This is **one** POST to `/CQCab/com.sap.gateway.srvd.zui_tabcq_o4.v0001.getEmailData`.
   - The edit flow's `invokeAction` isn't used: in 1.120 it returns `Promise<void>`, so the result can't be read from it.
4. **Draft:** `openEmailDraft({ to, cc, bcc, subject, htmlBody })` builds and downloads `<subject>.eml`, and a toast tells the user to open it.
5. **Errors:** the backend messages (`FAILED`/`REPORTED`) are shown in a `MessageBox`, and nothing is downloaded.

### B3. How the `.eml` is built (`EmailDraft.ts`)
- **Headers:** `To`, `Cc` and `Bcc` (empty ones are left out), and `Subject`. A non-ASCII subject is encoded as `=?UTF-8?B?…?=`. Then `X-Unsent: 1` (Outlook opens it as a **new draft**), `MIME-Version: 1.0`, and `Content-Type: text/html; charset=UTF-8`.
- **Body:** `Content-Transfer-Encoding: base64`, in 76-character lines. This keeps accented characters intact and avoids the 998-character line limit for long HTML, such as a table with many CQs.
- **HTML document:** if `HtmlBody` isn't already a full document, it's wrapped in `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>…</body></html>`.
- **Addresses:** `a@x.pt; b@x.pt` is normalised to `a@x.pt, b@x.pt`.
- **File name:** taken from the subject, without `\ / : * ? " < > |`. The default is `email.eml`.

### B4. Full source: `webapp/ext/modules/Constants.ts`

```ts
export const SERVICE_NAMESPACE = "com.sap.gateway.srvd.zui_tabcq_o4.v0001";

export const Actions = {
    print: `${SERVICE_NAMESPACE}.printCQ`,
    copy: `${SERVICE_NAMESPACE}.copy2`,
    changeMaterial: `${SERVICE_NAMESPACE}.changeMat`,
    doCalculations: `${SERVICE_NAMESPACE}.doCalculations`,
    concluir: `${SERVICE_NAMESPACE}.concluirCQ`,
    reabrir: `${SERVICE_NAMESPACE}.reabrirCQ`,
    aprovar: `${SERVICE_NAMESPACE}.aprovarCQ`,
    desaprovar: `${SERVICE_NAMESPACE}.desaprovarCQ`,
    copySemControlo: `${SERVICE_NAMESPACE}.copy`, // bound to CQLinhasSemControloType (overload resolved by the context)
    convertUom: `${SERVICE_NAMESPACE}.convertUom`,
    convertUomCalibre: `${SERVICE_NAMESPACE}.convertUomCalibre`,
    getMp: `${SERVICE_NAMESPACE}.getMp`,
    getEmailData: `${SERVICE_NAMESPACE}.getEmailData` // static (bound to the CQCab collection): 1 email for 1..n CQs
} as const;
```

### B5. New file: `webapp/ext/modules/EmailDraft.ts`

```ts
/** Dados de um rascunho de email (endereços separados por ";" ou ",") */
export type EmailDraft = {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    htmlBody?: string;
};

const CRLF = "\r\n";
const INVALID_FILE_CHARS = /[\\/:*?"<>|]+/g;

/**
 * Abre um rascunho de email HTML: gera um ficheiro .eml (com X-Unsent: 1) e faz o download.
 * O Outlook abre-o como NOVA mensagem editável, com a formatação HTML (tabelas, cores...).
 * (mailto:/URLHelper.triggerEmail só suporta texto simples.)
 */
export function openEmailDraft(draft: EmailDraft): void {
    const subject = (draft.subject ?? "").trim();

    const headers = [
        header("To", normalizeAddresses(draft.to)),
        header("Cc", normalizeAddresses(draft.cc)),
        header("Bcc", normalizeAddresses(draft.bcc)),
        `Subject: ${encodeHeaderValue(subject)}`,
        "X-Unsent: 1",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64"
    ].filter((line): line is string => line !== undefined);

    const body = toBase64Utf8(toHtmlDocument(draft.htmlBody ?? "")).replace(/.{1,76}/g, `$&${CRLF}`);
    const eml = `${headers.join(CRLF)}${CRLF}${CRLF}${body}`;

    download(new Blob([eml], { type: "message/rfc822" }), `${safeFileName(subject) || "email"}.eml`);
}

/** Linha de cabeçalho só se houver valor (To/Cc/Bcc vazios não são escritos) */
function header(name: string, value: string): string | undefined {
    return value ? `${name}: ${value}` : undefined;
}

/** "a@x.pt; b@x.pt" -> "a@x.pt, b@x.pt" (separador dos cabeçalhos de email) */
function normalizeAddresses(addresses?: string): string {
    return (addresses ?? "")
        .split(/[;,]/)
        .map((address) => address.trim())
        .filter((address) => address !== "")
        .join(", ");
}

/** Assunto com acentos -> encoded-word RFC 2047 (=?UTF-8?B?...?=); ASCII fica como está */
function encodeHeaderValue(value: string): string {
    return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${toBase64Utf8(value)}?=`;
}

/** Garante um documento HTML completo com charset UTF-8 */
function toHtmlDocument(html: string): string {
    return /<html[\s>]/i.test(html)
        ? html
        : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

/** Texto -> bytes UTF-8 -> base64 (btoa só aceita Latin-1) */
function toBase64Utf8(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function safeFileName(name: string): string {
    return name.replace(INVALID_FILE_CHARS, "").trim().slice(0, 100);
}

function download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### B6. New file: `webapp/ext/modules/CqEmail.ts`

```ts
import Context from "sap/ui/model/odata/v4/Context";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { Actions } from "./Constants";
import { openEmailDraft } from "./EmailDraft";

/** Chave de um CQ enviada à ação getEmailData (IsActiveEntity=false -> draft) */
export type CqKey = { Centro: string; ID: string; IsActiveEntity: boolean };

/** Resultado da ação getEmailData (estrutura ZRETURN_CQ_EMAIL) */
type EmailData = {
    ToAddresses?: string;
    CcAddresses?: string;
    BccAddresses?: string;
    Subject?: string;
    HtmlBody?: string;
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
    const email = await requestEmailData(contexts[0].getModel(), keys);
    openEmailDraft({
        to: email.ToAddresses,
        cc: email.CcAddresses,
        bcc: email.BccAddresses,
        subject: email.Subject,
        htmlBody: email.HtmlBody
    });
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
    const operation = model.bindContext(`/CQCab/${Actions.getEmailData}(...)`) as ODataContextBinding;
    try {
        operation.setParameter("Keys", JSON.stringify(keys));
        await operation.execute();
        return ((await operation.getBoundContext().requestObject()) ?? {}) as EmailData;
    } finally {
        operation.destroy();
    }
}
```

### B7. Full source: `webapp/ext/view/CQDetail.controller.ts`

Changes compared with your current file:
- **New imports:** `MessageBox` and `openCqEmailDraft`.
- **Removed:** the `URLHelper` field. It was only used by the old `onMail`; `onPrint` uses `mobileLibrary.URLHelper` directly.
- **Rewritten:** `onMail`, which sends the page's CQ, active or draft.
- **Unchanged:** everything else.

```ts
import Controller from "sap/fe/core/PageController";
import Formatter from "../modules/Formatter";
import { GenericTag$PressEvent } from "sap/m/GenericTag";
import { Actions } from "../modules/Constants"
import Fragment from "sap/ui/core/Fragment";
import Popover from "sap/m/Popover";
import EditHelper from "../modules/EditHelper";
import { openCqEmailDraft } from "../modules/CqEmail";
import Context from "sap/ui/model/odata/v4/Context";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import mobileLibrary from "sap/m/library";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button, { Button$PressEvent } from "sap/m/Button";
import Input from "sap/m/Input";
import DynamicPage from "sap/f/DynamicPage";
import Dialog from "sap/m/Dialog";
import List from "sap/m/List";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import TableAPI from "sap/fe/macros/table/TableAPI";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQDetail extends Controller {

    formatter = new Formatter();
    editHelper: EditHelper;
    oPopover: Promise<Popover> | undefined;
    cbCaixaFragment: Dialog;
    cbUnidadeFragment: Dialog;


    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.editHelper = new EditHelper(this.getView()!, "CQDetail_footer_draftIndicator");
    }

    public onExit(): void {
        this.editHelper.destroy();
    }

    /* ---------- title bar, display mode ---------- */

    public async onEdit(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        await this.getExtensionAPI().getEditFlow().editDocument(this.getContext());
        page.setBusy(false);
    }

    public async onDelete(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        const context = this.getContext();

        try {
            await this.getExtensionAPI().getEditFlow().deleteDocument(context, {
                title: this.getText("cqDetail.delete.title"),
                description: this.getText("cqDetail.delete.description", [String(context.getProperty("ID"))])
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onPrint(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);
        const context = this.getContext();

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.print, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.print"),
            });
        } catch (error) { }

        page.setBusy(false);
        const url = (await context.requestProperty("Attachment")) as string | undefined;
        if (url) {
            mobileLibrary.URLHelper.redirect(url, true);
        }
    }

    public async onCopy(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.copy, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.copy"),
                requiresNavigation: false
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onConcluir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.concluir, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Concluir")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onReabrir(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.reabrir, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Reabrir")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onAprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.aprovar, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Aprovar")
            });
        } catch (error) { }

        page.setBusy(false);
    }

    public async onDesaprovar(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.desaprovar, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.btn.Desaprovar")
            })
        } catch (error) { }

        page.setBusy(false);
    }

    public async onGetMp(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.getMp, {
                contexts: this.getContext(),
                invocationGrouping: "Isolated",
                label: this.getText("cqDetail.amostragens.subsection.mps.btn.getMp")
            })
        } catch (error) { }

        page.setBusy(false);
    }


    /**
     * Enviar email: rascunho HTML (.eml) para ESTE controlo (ativo ou draft),
     * com os dados devolvidos pela ação estática getEmailData.
     */
    public async onMail(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await openCqEmailDraft([this.getContext()]);
            MessageToast.show(this.getText("cqDetail.email.msg.draft"));
        } catch (error) {
            MessageBox.error(this.getText("cqDetail.email.error"), {
                details: String((error as Error)?.message ?? error)
            });
        } finally {
            page.setBusy(false);
        }
    }

    /* ---------- title bar, edit mode ---------- */

    public async onChangeMaterial(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.changeMaterial, {
                contexts: this.getContext(),
                label: this.getText("cqDetail.btn.modifyMaterial")
            })
        } catch (error) { }

        page.setBusy(false);
    }

    /* ---------- Fragemnt CB Caixa ---------- */
    public async onCbCaixa(): Promise<void> {
        if (!this.cbCaixaFragment) {
            this.cbCaixaFragment = (await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.descodificaCaixa",
                controller: this
            })) as Dialog;
            this.getView()?.addDependent(this.cbCaixaFragment);
        }
        this.cbCaixaFragment.open();
    }


    public async onPressDescodifica(event: Button$PressEvent): Promise<void> {
        const sList = this.getView()?.byId("descodificaCBList") as List;
        sList.setBusy(true);

        const oDialog = this.getView()?.byId("descodificaCBDialog") as Dialog,
            oAction = oDialog.getObjectBinding() as ODataContextBinding;

        try {
            await oAction.execute();
            MessageToast.show(this.getText("cbcaixa.msg.sucesso"));
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            MessageToast.show(this.getText("cbcaixa.msg.erro", [err.message]));
        }

        this.getContext().refresh();
        sList.setBusy(false);
    }


    public async onPressCloseDialog(event: Button$PressEvent): Promise<void> {
        this.cbCaixaFragment.close();
        this.getContext().refresh();
    }


    /* ---------- Fragment CB Unidade ---------- */
    public async onCbUnidade(): Promise<void> {
        if (!this.cbUnidadeFragment) {
            this.cbUnidadeFragment = (await Fragment.load({
                id: this.getView()?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.descodificaUnidade",
                controller: this
            })) as Dialog;
            this.getView()?.addDependent(this.cbUnidadeFragment);
        }
        this.cbUnidadeFragment.open();
    }


    public async onPressDescodificaUN(event: Button$PressEvent): Promise<void> {
        const sList = this.getView()?.byId("descodificaUnidadeList") as List;
        sList.setBusy(true);

        const oDialog = this.getView()?.byId("descodificaUnidadeDialog") as Dialog,
            oAction = oDialog.getObjectBinding() as ODataContextBinding;

        try {
            await oAction.execute();
            MessageToast.show(this.getText("cbcaixa.msg.sucesso"));
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            MessageToast.show(this.getText("cbcaixa.msg.erro", [err.message]));
        }

        this.getContext().refresh();
        sList.setBusy(false);
    }


    public async onPressUnCloseDialog(event: Button$PressEvent): Promise<void> {
        this.cbUnidadeFragment.close();
        this.getContext().refresh();
    }


    /* ---------- Tabela Sem Controlo ---------- */
    public async onCopySemControlo(): Promise<void> {
        const table = this.byId("CQDetail_fcontrolo_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            return;
        }

        // replaces Core.OperationAvailable (_it/__OperationControl/copy) of the generated button
        const available = await Promise.all(selected.map((context) =>
            context.requestProperty("__OperationControl/copy") as Promise<boolean | undefined>));
        const contexts = selected.filter((_context, index) => available[index] === true);
        if (contexts.length === 0) {
            MessageToast.show(this.getText("cqDetail.semControlo.copy.notAvailable"));
            return;
        }

        try {
            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.copySemControlo, {
                contexts,
                invocationGrouping: "ChangeSet",
                label: this.getText("cqDetail.semControlo.btn.copy")
            });
        } catch (error) {
            // parameter dialog cancelled or backend error (FE already shows the messages): nothing to refresh
            return;
        }

        // the table is bound relative to the CQ (_semControlo), so it can't be refreshed directly:
        // ask the CQ context to reload the navigation instead
        await this.getContext().requestSideEffects([{ $NavigationPropertyPath: "_semControlo" }]);
    }


    /* ---------- footer ---------- */

    public async onSave(): Promise<void> {
        const page = this.byId("CQDetail_dynamicPage") as DynamicPage;
        page.setBusy(true);

        await this.getExtensionAPI().getEditFlow().saveDocument(this.getContext());

        page.setBusy(false);
    }

    public async onCancel(oEvent: Event): Promise<void> {
        await this.getExtensionAPI().getEditFlow().cancelDocument(this.getContext(), {
            control: oEvent.getSource() as Control
        });
    }

    public onMessagesPress(oEvent: Event): void {
        this.editHelper.openMessages(oEvent.getSource() as Button);
    }

    /* ---------- fields ---------- */

    public onFieldChange(oEvent: Event): void {
        void this.editHelper.requestSideEffects(oEvent.getSource() as Control);
    }

    public onValueHelpRequest(oEvent: Event): void {
        void this.editHelper.openValueHelp(oEvent.getSource() as Input);
    }

    /* ---------- header tag popover  ---------- */
    onGenericTagPress(oEvent: GenericTag$PressEvent) {
        const oView = this.getView(),
            oSourceControl = oEvent.getSource();

        if (!this.oPopover) {
            this.oPopover = Fragment.load({
                id: oView?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.IDTag",
                controller: this
            }) as Promise<Popover>;
            this.oPopover.then((_Popover) => {
                oView?.addDependent(_Popover);
            })
        }

        this.oPopover.then((_Popover) => {
            _Popover.openBy(oSourceControl);
        });
    }


    /* ---------- helpers ---------- */
    private getContext(): Context {
        return this.getView()!.getBindingContext() as Context;
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }
}
```

### B8. `Main.view.xml`: new table action (inside the existing `<macros:actions>` of `main_table`)

```xml
                        <macros:actions>
                            <macros:Action id="main_table_create" key="create" text="{i18n>main.btn.create}" press=".onCreate"/>
                            <macros:Action id="main_table_delete" key="delete" text="{i18n>main.btn.delete}" press=".onDelete" requiresSelection="true"/>
                            <macros:Action id="main_table_email" key="email" text="{i18n>main.btn.email}" press=".onMail" requiresSelection="true"/>
                        </macros:actions>
```

The table already has `selectionMode="Multi"`, so nothing else changes in the view.

### B9. Full source: `webapp/ext/main/Main.controller.ts`

Changes compared with your current file:
- **New imports:** `openCqEmailDraft`, and `import type MDCTable` from `sap/ui/mdc/Table`. That one is used for typing only, so no extra module is loaded at runtime.
- **New handler:** `onMail`, in the "main tab buttons" section. After the email is generated, it **clears the table selection**. If generating fails, the selection is kept so the user can retry.
- **New private helper:** `clearTableSelection(table)`. In 1.120, `TableAPI` has no `clearSelection`, so it finds the `sap.ui.mdc.Table` inside the building block with `findAggregatedObjects` and calls its public `clearSelection()`.
- **Unchanged:** everything else.

```ts
import Controller from "sap/fe/core/PageController";
import Event from "sap/ui/base/Event";
import FilterBar from "sap/fe/macros/filterBar/FilterBarAPI";
import TableAPI from "sap/fe/macros/table/TableAPI";
import MessageToast from "sap/m/MessageToast";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import type MDCTable from "sap/ui/mdc/Table";
import { openCqEmailDraft } from "../modules/CqEmail";

const COUNT_TABS = ["main_IconTabBar_todos", "main_IconTabBar_pendentes", "main_IconTabBar_concluidos", "main_IconTabBar_aprovados"];

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.main
 */
export default class Main extends Controller {

    private firstRouteMatch = true;

    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
        this.getAppComponent().getRouter().getRoute("CQCabMain")?.attachPatternMatched(this.onRouteMatched, this);
    }


    public onExit(): void {
        this.getAppComponent().getRouter().getRoute("CQCabMain")?.detachPatternMatched(this.onRouteMatched, this);
    }

    /*  Filtros section  */

    onFilterSelect(oEvent: Event) {
        let sKey = (oEvent as any).getParameter("key"),
            oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        this.setStatusFilter(sKey);
    }

    private async setStatusFilter(oKey: string) {
        let oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        if (oKey === 'all') {
            await oFilterSelect.setFilterValues("Estado", "", []);

        } else if (oKey === 'pendentes') {
            await oFilterSelect.setFilterValues("Estado", "", ["A"]);

        } else if (oKey === 'concluidos') {
            await oFilterSelect.setFilterValues("Estado", "", ["B"]);

        } else if (oKey === 'aprovados') {
            await oFilterSelect.setFilterValues("Estado", "", ["C"]);
        }
        oFilterSelect.triggerSearch();
    }


    /* ---------- main tab buttons ---------- */
    public async onCreate(): Promise<void> {
        await this.getExtensionAPI().getEditFlow().createDocument("/CQCab", {
            creationMode: "NewPage"
        });
    }


    public async onDelete(): Promise<void> {
        const table = this.byId("main_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            MessageBox.warning(this.getText("main.noSelections.error"));
            // MessageToast.show(this.getText("main.noSelections.error"));
            return;
        }

        //Verifica se as linhas selecionadas podem ser apagadas
        const deletable = await Promise.all(selected.map((context) =>
            context.requestProperty("__EntityControl/Deletable") as Promise<boolean | undefined>));
        const toDelete = selected.filter((_context, index) => deletable[index] === true);
        const skipped = selected.length - toDelete.length;

        if (toDelete.length === 0) {
            MessageBox.warning(this.getText("main.delete.notAllowed"));
            return;
        }

        const confirmed = await this.confirm(
            this.getText("main.delete.title"),
            this.getText("main.delete.confirm", [String(toDelete.length)])
            + (skipped > 0 ? `\n\n${this.getText("main.delete.skipped", [String(skipped)])}` : "")
        );

        if (!confirmed) {
            return;
        }

        table.setBusy(true);
        const results = await Promise.allSettled(toDelete.map((context) => context.delete()));
        table.setBusy(false);

        const failed = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
        if (failed.length > 0) {
            MessageBox.error(this.getText("main.delete.failed", [String(failed.length)]), {
                details: failed.map((result) => String((result.reason as Error)?.message ?? result.reason)).join("\n")
            });
            table.refresh();
        } else {
            MessageToast.show(this.getText("main.delete.success", [String(toDelete.length)]));
        }
        this.refreshCounts();
    }


    /**
     * Enviar email: UM rascunho HTML (.eml) com a informação de TODOS os controlos selecionados
     * (uma única chamada à ação estática getEmailData).
     */
    public async onMail(): Promise<void> {
        const table = this.byId("main_table") as TableAPI;
        const selected = table.getSelectedContexts();
        if (selected.length === 0) {
            MessageBox.warning(this.getText("main.noSelections.error"));
            return;
        }

        table.setBusy(true);
        try {
            await openCqEmailDraft(selected);
            // só limpa depois de gerar o email: se falhar, a seleção fica para tentar de novo
            this.clearTableSelection(table);
            MessageToast.show(this.getText("main.email.msg.draft", [String(selected.length)]));
        } catch (error) {
            MessageBox.error(this.getText("main.email.error"), {
                details: String((error as Error)?.message ?? error)
            });
        } finally {
            table.setBusy(false);
        }
    }


    /* ---------- helpers ---------- */
    /**
     * Ao voltar do CQDetail (novo controlo gravado, alterado ou eliminado)
     * atualiza a tabela e os contadores dos separadores.
     * Na primeira entrada não faz nada para não duplicar o pedido inicial.
     */
    private onRouteMatched(): void {
        if (this.firstRouteMatch) {
            this.firstRouteMatch = false;
            return;
        }
        (this.byId("main_table") as TableAPI | undefined)?.refresh();
        this.refreshCounts();

        const uiModel = this.getView()?.getModel("ui") as JSONModel | undefined;
        if (uiModel && uiModel.getProperty("/isEditable") !== false) {
            uiModel?.setProperty("/isEditable", false);
            uiModel.setProperty("/editMode", "Display");
        }
    }

    private refreshCounts(): void {
        COUNT_TABS.forEach((id) => this.byId(id)?.getBinding("count")?.refresh());
    }

    /**
     * Limpa as linhas selecionadas da tabela FE.
     * TableAPI (1.120) não tem clearSelection: usa o sap.ui.mdc.Table interno (API pública clearSelection),
     * encontrado com findAggregatedObjects (API pública de ManagedObject).
     */
    private clearTableSelection(table: TableAPI): void {
        const [mdcTable] = table.findAggregatedObjects(true, (object) => object.isA("sap.ui.mdc.Table")) as MDCTable[];
        mdcTable?.clearSelection();
    }

    private confirm(title: string, text: string): Promise<boolean> {
        return new Promise((resolve) => {
            MessageBox.confirm(text, {
                title,
                actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.DELETE,
                onClose: (action: string) => resolve(action === MessageBox.Action.DELETE)
            })
        });
    }

    private getText(key: string, args?: string[]): string {
        const bundle = (this.getView()!.getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return bundle.getText(key, args) ?? key;
    }
}
```

### B10. `i18n.properties`

After `cqDetail.btn.email`:

```properties
cqDetail.email.msg.draft=Rascunho de email criado. Abra o ficheiro transferido para o rever e enviar no Outlook.
cqDetail.email.error=Não foi possível preparar o email deste controlo.
```

After `main.btn.delete` (main block):

```properties
main.btn.email=Enviar email
main.email.msg.draft=Rascunho de email criado para {0} controlo(s). Abra o ficheiro transferido para o rever e enviar no Outlook.
main.email.error=Não foi possível preparar o email dos controlos selecionados.
```

## Design notes
- **One action, one code path:** CQDetail (one CQ) and Main (N CQs) both call `openCqEmailDraft(contexts)` and send **one** POST with the CQ list. The backend can make the body and subject singular or plural based on the number of keys.
- **Draft vs active:** each key carries `IsActiveEntity`. From CQDetail in edit mode, the email reflects the **draft** data the user is working on. From the list, the rows are normally active, or the user's own drafts if the list shows them. The backend reads with `%is_draft` accordingly.
- **No lock:** a static action never locks instances, so emailing never blocks editing.
- **Why `.eml` + `X-Unsent: 1`:** it is the only client-side way to hand Outlook an **HTML** draft. `mailto:` only carries plain text, with a length limit. The user opens the downloaded file with one click. In Chrome and Edge, "Always open files of this type" opens it straight away next time. Outlook on the web can't open local `.eml` files as drafts.
- **HTML rules for the backend:** use inline styles, tables for layout and absolute image URLs. For N CQs, one `<table>` with a row per CQ, or one block per CQ, reads best in Outlook.
- **Selection size:** there is no limit in the frontend, because the keys travel in the POST body, not the URL. If the backend should cap it (for example at 100 CQs), it reports that in `FAILED`/`REPORTED` and the frontend shows the message.

## Verification
1. **Backend:**
   - after activation, `$metadata` contains the action bound to `Collection(...CQCabType)` with parameter `Keys`, as in A4;
   - `POST /CQCab/com.sap.gateway.srvd.zui_tabcq_o4.v0001.getEmailData` with body `{"Keys":"[{\"Centro\":\"1000\",\"ID\":\"1000000003\",\"IsActiveEntity\":true}]"}` (with a CSRF token) returns the 5 fields.
2. Run `npm run ts-typecheck` and `npm run lint`, then `npm start`.
3. **List:** select 3 CQs, then **Enviar email**.
   - **Network:** **one** `POST /CQCab/…getEmailData` whose `Keys` contains the 3 CQs in table order.
   - **Screen:** one `.eml` is downloaded and the toast says "para 3 controlo(s)". Opening it in Outlook shows one new message with the combined recipients and the HTML body covering all 3 CQs (tables and colours kept).
   - **After the download:** the table has **no rows selected**, and **Enviar email** and **Eliminar** are disabled again.
   - **When generating fails:** for example a backend error, the 3 rows **stay selected**.
4. **List:** with no selection, the button is disabled (`requiresSelection`).
5. **Detail, display mode:** **Enviar email** sends the same call with one key (`IsActiveEntity: true`).
6. **Detail, edit mode:** click Editar, change a field, then Enviar email. The key has `IsActiveEntity: false` and the email reflects the unsaved change. Afterwards there is no lock or "editing" message, and Save works.
7. **Bcc:** the BCC addresses appear in Outlook's Bcc field (show the field if it's hidden).
8. **Backend error** (invalid key or no recipients): the error box shows the backend message, and nothing is downloaded.
9. **Long body:** 50 CQs in one email still open complete, because there is no URL limit and the base64 lines are 76 characters.
