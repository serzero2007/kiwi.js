import { ISymbol, ISymbolType, INVALID_SYMBOL } from "./isymbol"
import { createMap, IMap } from "./maptype";

/**
 * Test whether a value is approximately zero.
 * @private
 */
function nearZero( value: number ): boolean {
    const eps = 1.0e-8;
    return value < 0.0 ? -value < eps : value < eps;
}


/**
 * An internal row class used by the solver.
 * @private
 */
export class Row {
    /**
     * Construct a new Row.
     */
    constructor(public constant: number = 0.0 ) {}

    /**
     * Returns true if the row is a constant value.
     */
    public isConstant(): boolean {
        return this.cells.empty();
    }

    /**
     * Returns true if the Row has all dummy symbols.
     */
    public allDummies(): boolean {
        return this.cells.map(pair => pair.first.type === ISymbolType.Dummy)
                  .reduce((a, b) => a && b)

    }

    /**
     * Create a copy of the row.
     */
    public copy(): Row {
        let theCopy = new Row( this.constant );
        theCopy.cells = this.cells.copy();
        return theCopy;
    }

    /**
     * Add a constant value to the row constant.
     *
     * Returns the new value of the constant.
     */
    public add( value: number ): number {
        return this.constant += value;
    }

    /**
     * Insert the symbol into the row with the given coefficient.
     *
     * If the symbol already exists in the row, the coefficient
     * will be added to the existing coefficient. If the resulting
     * coefficient is zero, the symbol will be removed from the row.
     */
    public insertISymbol( symbol: ISymbol, coefficient: number = 1.0 ): void {
        let pair = this.cells.setDefault( symbol, coefficient );
        if (nearZero(pair.second)) this.cells.erase( symbol );
    }

    /**
     * Insert a row into this row with a given coefficient.
     *
     * The constant and the cells of the other row will be
     * multiplied by the coefficient and added to this row. Any
     * cell with a resulting coefficient of zero will be removed
     * from the row.
     */
    public insertRow( other: Row, coefficient: number = 1.0 ): void {
        this.constant += other.constant * coefficient;
        other.cells.map(pair => {
          this.insertISymbol( pair.first, pair.second * coefficient );
        })
    }

    /**
     * Remove a symbol from the row.
     */
    public removeISymbol( symbol: ISymbol ): void {
        this.cells.erase( symbol );
    }

    /**
     * Reverse the sign of the constant and cells in the row.
     */
    public reverseSign(): void {
        this.constant = -this.constant;
        this.cells.map(pair => {
          pair.second = -pair.second;
        })
    }

    /**
     * Solve the row for the given symbol.
     *
     * This method assumes the row is of the form
     * a * x + b * y + c = 0 and (assuming solve for x) will modify
     * the row to represent the right hand side of
     * x = -b/a * y - c / a. The target symbol will be removed from
     * the row, and the constant and other cells will be multiplied
     * by the negative inverse of the target coefficient.
     *
     * The given symbol *must* exist in the row.
     */
    public solveFor( symbol: ISymbol ): void {
        let pair = this.cells.erase( symbol );
        let coeff = -1.0 / pair.second;

        this.constant *= coeff;
        this.cells.map(p => { p.second *= coeff })
    }

    /**
     * Solve the row for the given symbols.
     *
     * This method assumes the row is of the form
     * x = b * y + c and will solve the row such that
     * y = x / b - c / b. The rhs symbol will be removed from the
     * row, the lhs added, and the result divided by the negative
     * inverse of the rhs coefficient.
     *
     * The lhs symbol *must not* exist in the row, and the rhs
     * symbol must* exist in the row.
     */
    public solveForEx( lhs: ISymbol, rhs: ISymbol ): void {
        this.insertISymbol( lhs, -1.0 );
        this.solveFor( rhs );
    }

    /**
     * Returns the coefficient for the given symbol.
     */
    public coefficientFor( symbol: ISymbol ): number {
        let pair = this.cells.find(symbol);
        return pair !== undefined ? pair.second : 0.0;
    }

    /**
     * Substitute a symbol with the data from another row.
     *
     * Given a row of the form a * x + b and a substitution of the
     * form x = 3 * y + c the row will be updated to reflect the
     * expression 3 * a * y + a * c + b.
     *
     * If the symbol does not exist in the row, this is a no-op.
     */
    public substitute( symbol: ISymbol, row: Row ): void {
        let pair = this.cells.erase( symbol );
        if ( pair !== undefined ) {
            this.insertRow( row, pair.second );
        }
    }

    public cells = createMap<ISymbol, number>( ISymbol.Compare );
}
