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

function download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}