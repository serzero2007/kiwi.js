
/**
 * An enum defining the available symbol types.
 * @private
 */
export enum ISymbolType {
    Invalid,
    External,
    Slack,
    Error,
    Dummy,
}

/**
 * An internal class representing a symbol in the solver.
 * @private
 */
export class ISymbol {
    /**
     * The static ISymbol comparison function.
     */
    public static Compare( a: ISymbol, b: ISymbol ): number {
        return a.id - b.id;
    }

    /**
     * Construct a new ISymbol
     *
     * @param [type] The type of the symbol.
     * @param [id] The unique id number of the symbol.
     */
    constructor(
      public type: ISymbolType,
      public id: number ) {}

}

/**
 * A static invalid symbol
 * @private
 */
export const INVALID_SYMBOL = new ISymbol( ISymbolType.Invalid, -1 );
