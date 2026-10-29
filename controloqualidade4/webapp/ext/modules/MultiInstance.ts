import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";

//Tipo de um separator
export type AmostraTab = { path: string; linha: string };

/** "/CQCab(...)" no início do caminho de uma amostra "/CQCab(...)/_linhas(...)" */
const CAB_PATH = /^\/CQCab\([^)]*\)/;

/**
 * Estado partilhado entre o CQDetail (seleção na tabela de amostras) e o CQLinhaDetail (TabContainer).
 * São views diferentes, por isso o modelo é estático (mesmo padrão que SerialScale.model).
 */
export default class MultiInstance {
    static readonly model = new JSONModel({ tabs: [] as AmostraTab[], selectedPath: "" });

    // chamada depois de se criar uma amostra nova   
    static refreshAmostras?: () => void;

    //Metodo para abrir as amostras selecionas na tabela => default selecionada é a primeira
    static open(contexts: Context[]): void {
        const tabs = contexts.map((context) => ({
            path: context.getPath(),
            linha: String(context.getProperty("Linha") ?? "")
        }));
        MultiInstance.model.setData({ tabs, selectedPath: tabs[0].path ?? "" });
    }

    /**
     * A página da amostra foi ligada a `path`. Se não estiver nos separadores (navegação normal,
     * clique numa linha da tabela) passa a ser o único separador. Fica sempre selecionado.
     * Usado para quando a navegação é externa e não a partir da tabela
     */
    static ensure(path: string, linha: string): void {
        const tabs = MultiInstance.getTabs();
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            MultiInstance.model.setProperty("/tabs", [{ path, linha }]);
        } else if (linha && tabs[index].linha !== linha) {
            MultiInstance.model.setProperty(`/tabs/${index}/linha`, linha);
        }
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /** Novo separador (amostra acabada de criar), já selecionado */
    static add(path: string, linha: string): void {
        MultiInstance.model.setProperty("/tabs", [...MultiInstance.getTabs(), { path, linha }]);
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /**
     * Fecha o separador (NÃO apaga a amostra).
     * Devolve o caminho a mostrar a seguir: o vizinho se o fechado era o selecionado,
     * o selecionado atual nos outros casos, ou undefined se não sobrar nenhum separador.
     */
    static remove(path: string): string | undefined {
        const tabs = MultiInstance.getTabs();
        const selected = MultiInstance.model.getProperty("/selectedPath") as string;
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            return selected || undefined;
        }

        const remaining = tabs.filter((_tab, i) => i !== index);
        const next = remaining.length === 0
            ? undefined
            : selected !== path ? selected : remaining[Math.min(index, remaining.length - 1)].path;

        MultiInstance.model.setProperty("/selectedPath", next ?? "");
        MultiInstance.model.setProperty("/tabs", remaining);
        return next;
    }

    static getSelectedPath(): string {
        return (MultiInstance.model.getProperty("/selectedPath") as string | undefined) ?? "";
    }

    static clear(): void {
        MultiInstance.model.setData({ tabs: [], selectedPath: "" });
    }

    static getPaths(): string[] {
        return MultiInstance.getTabs().map((tab) => tab.path);
    }

    /** "/CQCab(...)/_linhas(...)" -> "/CQCab(...)" */
    static getCabPath(path: string): string | undefined {
        return CAB_PATH.exec(path)?.[0];
    }

    private static getTabs(): AmostraTab[] {
        return (MultiInstance.model.getProperty("/tabs") as AmostraTab[] | undefined) ?? [];
    }
}