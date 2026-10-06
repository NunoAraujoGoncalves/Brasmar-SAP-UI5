import CompositeType from "sap/ui/model/CompositeType";

/**
 * Two-way type for code fields shown as "Desc (code)".
 * Binding: {parts:[{path:'Marca'}, {path:'MarcaDesc'}], type:'CodeDescType', useRawValues:true}
 * Display: "Marca X (12)". Input: "12" or "Marca X (12)" -> writes only the code (description is Computed).
 *
 * @namespace brasmar.bm01.controloqualidade4.ext.modules
 */
export default class CodeDescType extends CompositeType {

    /** parseValue receives the current raw values (needed to keep the code's model type).
     *  CompositeType has no public setter in 1.120; CompositeBinding reads this getter. */
    public getParseWithValues(): boolean {
        return true;
    }

    /** the type works on raw model values (number for Edm.Int16 codes, string for the description) */
    public getUseRawValues(): boolean {
        return true;
    }

    public formatValue(values: unknown[], _targetType: string): string {
        const [code, desc] = values;
        if (code === undefined || code === null || code === "") {
            return "";
        }
        return desc ? `${String(desc)} (${String(code)})` : String(code);
    }

    public parseValue(value: string, _sourceType: string, currentValues?: unknown[]): unknown[] {
        const text = (value ?? "").trim();
        const match = /\(([^()]*)\)\s*$/.exec(text);          // "Marca X (12)" -> "12"
        const codeText = match ? match[1].trim() : text;      // "12" -> "12"
        // keep the model type: Marca/Origem/... are Edm.Int16 (number), others are strings
        const code = typeof currentValues?.[0] === "number" && codeText !== "" ? Number(codeText) : codeText;
        return [code, undefined]; // undefined = do not write the description (Computed)
    }

    public validateValue(_values: unknown[]): void {
        // backend validates the code; nothing to check here
    }
}