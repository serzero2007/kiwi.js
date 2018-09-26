/*-----------------------------------------------------------------------------
| Copyright (c) 2014, Nucleic Development Team.
|
| Distributed under the terms of the Modified BSD License.
|
| The full license is in the file COPYING.txt, distributed with this software.
|----------------------------------------------------------------------------*/

import { Constraint, Operator } from "./constraint";
import { Expression } from "./expression";
import { createMap, IMap } from "./maptype";
import { Strength } from "./strength";
import { Variable } from "./variable";

/**
 * The constraint solver class.
 *
 * @class
 */
export
class Solver {
    /**
     * Creates and add a constraint to the solver.
     *
     * @param {Expression|Variable} lhs Left hand side of the expression
     * @param {Operator} operator Operator
     * @param {Expression|Variable|Number} rhs Right hand side of the expression
     * @param {Number} [strength=Strength.required] Strength
     */
    public createConstraint(
        lhs: Expression|Variable,
        operator: Operator,
        rhs: Expression|Variable|number,
        strength: number = Strength.required): Constraint {
        const cn = new Constraint(lhs, operator, rhs, strength);
        this.addConstraint(cn);
        return cn;
    }

    /**
     * Add a constraint to the solver.
     *
     * @param {Constraint} constraint Constraint to add to the solver
     */
    public addConstraint(constraint: Constraint): void {
        if (this.constraints.find(constraint) !== undefined) {
            throw new Error("duplicate constraint");
        }

        // Creating a row causes symbols to be reserved for the variables
        // in the constraint. If this method exits with an exception,
        // then its possible those variables will linger in the var map.
        // Since its likely that those variables will be used in other
        // constraints and since exceptional conditions are uncommon,
        // i'm not too worried about aggressive cleanup of the var map.
        const { row, tag } = this._createRow(constraint);
        let subject = this._chooseSubject( row, tag );

        // If chooseSubject couldnt find a valid entering symbol, one
        // last option is available if the entire row is composed of
        // dummy variables. If the constant of the row is zero, then
        // this represents redundant constraints and the new dummy
        // marker can enter the basis. If the constant is non-zero,
        // then it represents an unsatisfiable constraint.
        if ( subject.type === ISymbolType.Invalid && row.allDummies() ) {
            if ( !nearZero( row.constant ) ) {
                throw new Error( "unsatisfiable constraint" );
            } else {
                subject = tag.marker;
            }
        }

        // If an entering symbol still isn't found, then the row must
        // be added using an artificial variable. If that fails, then
        // the row represents an unsatisfiable constraint.
        if ( subject.type === ISymbolType.Invalid ) {
            if ( !this._addWithArtificialVariable( row ) ) {
                throw new Error( "unsatisfiable constraint" );
            }
        } else {
            row.solveFor( subject );
            this._substitute( subject, row );
            this.rows.insert( subject, row );
        }

        this.constraints.insert( constraint, tag );

        // Optimizing after each constraint is added performs less
        // aggregate work due to a smaller average system size. It
        // also ensures the solver remains in a consistent state.
        this._optimize( this.objective );
    }

    /**
     * Remove a constraint from the solver.
     *
     * @param {Constraint} constraint Constraint to remove from the solver
     */
    public removeConstraint( constraint: Constraint ): void {
        const cnPair = this.constraints.erase( constraint );
        if ( cnPair === undefined ) {
            throw new Error( "unknown constraint" );
        }
        const cnTag = cnPair.second;

        // Remove the error effects from the objective function
        // *before* pivoting, or substitutions into the objective
        // will lead to incorrect solver results.
        this._removeConstraintEffects(constraint,  cnTag);

        // If the marker is basic, simply drop the row. Otherwise,
        // pivot the marker into the basis and then drop the row.
        const { marker } = cnTag;
        let rowPair = this.rows.erase( marker );

        if ( rowPair === undefined ) {
            const leaving = this._getMarkerLeavingISymbol( marker );
            if ( leaving.type === ISymbolType.Invalid ) {
                throw new Error( "failed to find leaving row" );
            }
            rowPair = this.rows.erase( leaving );
            rowPair.second.solveForEx( leaving, marker );
            this._substitute( marker, rowPair.second );
        }

        // Optimizing after each constraint is removed ensures that the
        // solver remains consistent. It makes the solver api easier to
        // use at a small tradeoff for speed.
        this._optimize( this.objective );
    }

    /**
     * Test whether the solver contains the constraint.
     *
     * @param {Constraint} constraint Constraint to test for
     * @return {Bool} true or false
     */
    public hasConstraint( constraint: Constraint ): boolean {
        return this.constraints.contains( constraint );
    }

    /**
     * Add an edit variable to the solver.
     *
     * @param {Variable} variable Edit variable to add to the solver
     * @param {Number} strength Strength, should be less than `Strength.required`
     */
    public addEditVariable( variable: Variable, strength: number ): void {
        const editPair = this.edits.find( variable );
        if ( editPair !== undefined ) {
            throw new Error( "duplicate edit variable" );
        }
        strength = Strength.clip( strength );
        if ( strength === Strength.required ) {
            throw new Error( "bad strength" );
        }
        const expr = new Expression( variable );
        const cn = new Constraint( expr, Operator.Eq, undefined, strength );
        this.addConstraint( cn );
        const tag = this.constraints.find( cn ).second;

        this.edits.insert( variable, { tag, constraint: cn, constant: 0.0 } );
    }

    /**
     * Remove an edit variable from the solver.
     *
     * @param {Variable} variable Edit variable to remove from the solver
     */
    public removeEditVariable( variable: Variable ): void {
        const editPair = this.edits.erase( variable );
        if ( editPair === undefined ) {
            throw new Error( "unknown edit variable" );
        }
        this.removeConstraint( editPair.second.constraint );
    }

    /**
     * Test whether the solver contains the edit variable.
     *
     * @param {Variable} variable Edit variable to test for
     * @return {Bool} true or false
     */
    public hasEditVariable( variable: Variable ): boolean {
        return this.edits.contains( variable );
    }

    /**
     * Suggest the value of an edit variable.
     *
     * @param {Variable} variable Edit variable to suggest a value for
     * @param {Number} value Suggested value
     */
    public suggestValue( variable: Variable, value: number ): void {
        const editPair = this.edits.find( variable );
        if ( editPair === undefined ) {
            throw new Error( "unknown edit variable" );
        }

        const rows = this.rows;
        const info = editPair.second;
        const delta = value - info.constant;
        info.constant = value;

        // Check first if the positive error variable is basic.
        const marker = info.tag.marker;
        let rowPair = rows.find( marker );
        if ( rowPair !== undefined ) {
            if ( rowPair.second.add( -delta ) < 0.0 ) {
                this._infeasibleRows.push( marker );
            }
            this._dualOptimize();
            return;
        }

        // Check next if the negative error variable is basic.
        const other = info.tag.other;
        rowPair = rows.find( other );
        if ( rowPair !== undefined ) {
            if ( rowPair.second.add( delta ) < 0.0 ) {
                this._infeasibleRows.push( other );
            }
            this._dualOptimize();
            return;
        }

        // Otherwise update each row where the error variables exist.
        for ( let i = 0, n = rows.size(); i < n; ++i ) {
            const rowPair = rows.itemAt( i );
            const row = rowPair.second;
            const coeff = row.coefficientFor( marker );
            if ( coeff !== 0.0 && row.add( delta * coeff ) < 0.0 &&
                rowPair.first.type !== ISymbolType.External ) {
                this._infeasibleRows.push( rowPair.first );
            }
        }
        this._dualOptimize();
    }

    /**
     * Update the values of the variables.
     */
    public updateVariables(): void {
        for ( let i = 0, n = this.vars.size(); i < n; ++i ) {
            const pair = this.vars.itemAt( i );
            const rowPair = this.rows.find( pair.second );
            pair.first.value = rowPair ? rowPair.second.constant : 0.0;
        }
    }

    /**
     * Get the symbol for the given variable.
     *
     * If a symbol does not exist for the variable, one will be created.
     * @private
     */
    private _getVarISymbol( variable: Variable ): ISymbol {
      const symbol = this._makeISymbol( ISymbolType.External );
        return this.vars.setDefault( variable, () => symbol ).second;
    }

    /**
     * Create a new Row object for the given constraint.
     *
     * The terms in the constraint will be converted to cells in the row.
     * Any term in the constraint with a coefficient of zero is ignored.
     * This method uses the `_getVarISymbol` method to get the symbol for
     * the variables added to the row. If the symbol for a given cell
     * variable is basic, the cell variable will be substituted with the
     * basic row.
     *
     * The necessary slack and error variables will be added to the row.
     * If the constant for the row is negative, the sign for the row
     * will be inverted so the constant becomes positive.
     *
     * Returns the created Row and the tag for tracking the constraint.
     * @private
     */
    private _createRow( constraint: Constraint ): IRowCreation {
        const expr = constraint.expression;
        const row = new Row( expr.constant );

        // Substitute the current basic variables into the row.
        const terms = expr.terms;
        for ( let i = 0, n = terms.size(); i < n; ++i ) {
            let termPair = terms.itemAt( i );
            if ( !nearZero( termPair.second ) ) {
                let symbol = this._getVarISymbol( termPair.first );
                let basicPair = this.rows.find( symbol );
                if ( basicPair !== undefined ) {
                    row.insertRow( basicPair.second, termPair.second );
                } else {
                    row.insertISymbol( symbol, termPair.second );
                }
            }
        }

        // Add the necessary slack, error, and dummy variables.
        const objective = this.objective;
        const strength = constraint.strength;
        const tag = { marker: INVALID_SYMBOL, other: INVALID_SYMBOL };
        switch (constraint.operator) {
            case Operator.Le:
            case Operator.Ge:
            {
                let coeff = constraint.operator === Operator.Le ? 1.0 : -1.0;
                let slack = this._makeISymbol( ISymbolType.Slack );
                tag.marker = slack;
                row.insertISymbol( slack, coeff );
                if ( strength < Strength.required ) {
                    let error = this._makeISymbol( ISymbolType.Error );
                    tag.other = error;
                    row.insertISymbol( error, -coeff );
                    objective.insertISymbol( error, strength );
                }
                break;
            }
            case Operator.Eq:
            {
                if ( strength < Strength.required ) {
                    let errplus = this._makeISymbol( ISymbolType.Error );
                    let errminus = this._makeISymbol( ISymbolType.Error );
                    tag.marker = errplus;
                    tag.other = errminus;
                    row.insertISymbol( errplus, -1.0 ); // v = eplus - eminus
                    row.insertISymbol( errminus, 1.0 ); // v - eplus + eminus = 0
                    objective.insertISymbol( errplus, strength );
                    objective.insertISymbol( errminus, strength );
                } else {
                    let dummy = this._makeISymbol( ISymbolType.Dummy );
                    tag.marker = dummy;
                    row.insertISymbol( dummy );
                }
                break;
            }
        }

        // Ensure the row has a positive constant.
        if ( row.constant < 0.0 ) {
            row.reverseSign();
        }

        return { row, tag };
    }

    /**
     * Choose the subject for solving for the row.
     *
     * This method will choose the best subject for using as the solve
     * target for the row. An invalid symbol will be returned if there
     * is no valid target.
     *
     * The symbols are chosen according to the following precedence:
     *
     * 1) The first symbol representing an external variable.
     * 2) A negative slack or error tag variable.
     *
     * If a subject cannot be found, an invalid symbol will be returned.
     *
     * @private
     */
    private _chooseSubject( row: Row, tag: ITag ): ISymbol {
        let cells = row.cells();
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            if ( pair.first.type === ISymbolType.External ) {
                return pair.first;
            }
        }
        let type = tag.marker.type;
        if ( type === ISymbolType.Slack || type === ISymbolType.Error ) {
            if ( row.coefficientFor( tag.marker ) < 0.0 ) {
                return tag.marker;
            }
        }
        type = tag.other.type;
        if ( type === ISymbolType.Slack || type === ISymbolType.Error ) {
            if ( row.coefficientFor( tag.other ) < 0.0 ) {
                return tag.other;
            }
        }
        return INVALID_SYMBOL;
    }

    /**
     * Add the row to the tableau using an artificial variable.
     *
     * This will return false if the constraint cannot be satisfied.
     *
     * @private
     */
    private _addWithArtificialVariable( row: Row ): boolean {
        // Create and add the artificial variable to the tableau.
        let art = this._makeISymbol( ISymbolType.Slack );
        this.rows.insert( art, row.copy() );
        this._artificial = row.copy();

        // Optimize the artificial objective. This is successful
        // only if the artificial objective is optimized to zero.
        this._optimize( this._artificial );
        let success = nearZero( this._artificial.constant );
        this._artificial = null;

        // If the artificial variable is basic, pivot the row so that
        // it becomes non-basic. If the row is constant, exit early.
        let pair = this.rows.erase( art );
        if ( pair !== undefined ) {
            let basicRow = pair.second;
            if ( basicRow.isConstant() ) {
                return success;
            }
            let entering = this._anyPivotableISymbol( basicRow );
            if ( entering.type === ISymbolType.Invalid ) {
                return false;  // unsatisfiable (will this ever happen?)
            }
            basicRow.solveForEx( art, entering );
            this._substitute( entering, basicRow );
            this.rows.insert( entering, basicRow );
        }

        // Remove the artificial variable from the tableau.
        let rows = this.rows;
        for ( let i = 0, n = rows.size(); i < n; ++i ) {
            rows.itemAt( i ).second.removeISymbol( art );
        }
        this.objective.removeISymbol( art );
        return success;
    }

    /**
     * Substitute the parametric symbol with the given row.
     *
     * This method will substitute all instances of the parametric symbol
     * in the tableau and the objective function with the given row.
     *
     * @private
     */
    private _substitute( symbol: ISymbol, row: Row ): void {
        let rows = this.rows;
        for ( let i = 0, n = rows.size(); i < n; ++i ) {
            let pair = rows.itemAt( i );
            pair.second.substitute( symbol, row );
            if ( pair.second.constant < 0.0 &&
                pair.first.type !== ISymbolType.External ) {
                this._infeasibleRows.push( pair.first );
            }
        }
        this.objective.substitute( symbol, row );
        if ( this._artificial ) {
            this._artificial.substitute( symbol, row );
        }
    }

    /**
     * Optimize the system for the given objective function.
     *
     * This method performs iterations of Phase 2 of the simplex method
     * until the objective function reaches a minimum.
     *
     * @private
     */
    private _optimize( objective: Row ): void {
        while ( true ) {
            let entering = this._getEnteringISymbol( objective );
            if ( entering.type === ISymbolType.Invalid ) {
                return;
            }
            let leaving = this._getLeavingISymbol( entering );
            if ( leaving.type === ISymbolType.Invalid ) {
                throw new Error( "the objective is unbounded" );
            }
            // pivot the entering symbol into the basis
            let row = this.rows.erase( leaving ).second;
            row.solveForEx( leaving, entering );
            this._substitute( entering, row );
            this.rows.insert( entering, row );
        }
    }

    /**
     * Optimize the system using the dual of the simplex method.
     *
     * The current state of the system should be such that the objective
     * function is optimal, but not feasible. This method will perform
     * an iteration of the dual simplex method to make the solution both
     * optimal and feasible.
     *
     * @private
     */
    private _dualOptimize(): void {
        let rows = this.rows;
        let infeasible = this._infeasibleRows;
        while ( infeasible.length !== 0 ) {
            let leaving = infeasible.pop();
            let pair = rows.find( leaving );
            if ( pair !== undefined && pair.second.constant < 0.0 ) {
                let entering = this._getDualEnteringISymbol( pair.second );
                if ( entering.type === ISymbolType.Invalid ) {
                    throw new Error( "dual optimize failed" );
                }
                // pivot the entering symbol into the basis
                let row = pair.second;
                rows.erase( leaving );
                row.solveForEx( leaving, entering );
                this._substitute( entering, row );
                rows.insert( entering, row );
            }
        }
    }

    /**
     * Compute the entering variable for a pivot operation.
     *
     * This method will return first symbol in the objective function which
     * is non-dummy and has a coefficient less than zero. If no symbol meets
     * the criteria, it means the objective function is at a minimum, and an
     * invalid symbol is returned.
     *
     * @private
     */
    private _getEnteringISymbol( objective: Row ): ISymbol {
        let cells = objective.cells();
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            let symbol = pair.first;
            if ( pair.second < 0.0 && symbol.type !== ISymbolType.Dummy ) {
                return symbol;
            }
        }
        return INVALID_SYMBOL;
    }

    /**
     * Compute the entering symbol for the dual optimize operation.
     *
     * This method will return the symbol in the row which has a positive
     * coefficient and yields the minimum ratio for its respective symbol
     * in the objective function. The provided row *must* be infeasible.
     * If no symbol is found which meats the criteria, an invalid symbol
     * is returned.
     *
     * @private
     */
    private _getDualEnteringISymbol( row: Row ): ISymbol {
        let ratio = Number.MAX_VALUE;
        let entering = INVALID_SYMBOL;
        let cells = row.cells();
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            let symbol = pair.first;
            let c = pair.second;
            if ( c > 0.0 && symbol.type !== ISymbolType.Dummy ) {
                let coeff = this.objective.coefficientFor( symbol );
                let r = coeff / c;
                if ( r < ratio ) {
                    ratio = r;
                    entering = symbol;
                }
            }
        }
        return entering;
    }

    /**
     * Compute the symbol for pivot exit row.
     *
     * This method will return the symbol for the exit row in the row
     * map. If no appropriate exit symbol is found, an invalid symbol
     * will be returned. This indicates that the objective function is
     * unbounded.
     *
     * @private
     */
    private _getLeavingISymbol( entering: ISymbol ): ISymbol {
        let ratio = Number.MAX_VALUE;
        let found = INVALID_SYMBOL;
        let rows = this.rows;
        for ( let i = 0, n = rows.size(); i < n; ++i ) {
            let pair = rows.itemAt( i );
            let symbol = pair.first;
            if ( symbol.type !== ISymbolType.External ) {
                let row = pair.second;
                let temp = row.coefficientFor( entering );
                if ( temp < 0.0 ) {
                    let tempRatio = -row.constant / temp;
                    if ( tempRatio < ratio ) {
                        ratio = tempRatio;
                        found = symbol;
                    }
                }
            }
        }
        return found;
    }

    /**
     * Compute the leaving symbol for a marker variable.
     *
     * This method will return a symbol corresponding to a basic row
     * which holds the given marker variable. The row will be chosen
     * according to the following precedence:
     *
     * 1) The row with a restricted basic varible and a negative coefficient
     *    for the marker with the smallest ratio of -constant / coefficient.
     *
     * 2) The row with a restricted basic variable and the smallest ratio
     *    of constant / coefficient.
     *
     * 3) The last unrestricted row which contains the marker.
     *
     * If the marker does not exist in any row, an invalid symbol will be
     * returned. This indicates an internal solver error since the marker
     * *should* exist somewhere in the tableau.
     *
     * @private
     */
    private _getMarkerLeavingISymbol( marker: ISymbol ): ISymbol {
        const dmax = Number.MAX_VALUE;
        let r1 = dmax;
        let r2 = dmax;
        const invalid = INVALID_SYMBOL;
        let first = invalid;
        let second = invalid;
        let third = invalid;
        const rows = this.rows;
        for ( let i = 0, n = rows.size(); i < n; ++i ) {
            const pair = rows.itemAt( i );
            const row = pair.second;
            let c = row.coefficientFor( marker );
            if ( c === 0.0 ) {
                continue;
            }
            const symbol = pair.first;
            if ( symbol.type === ISymbolType.External ) {
                third = symbol;
            } else if ( c < 0.0 ) {
                const r = -row.constant / c;
                if ( r < r1 ) {
                    r1 = r;
                    first = symbol;
                }
            } else {
                const r = row.constant / c;
                if ( r < r2 ) {
                    r2 = r;
                    second = symbol;
                }
            }
        }
        if ( first !== invalid ) {
            return first;
        }
        if ( second !== invalid ) {
            return second;
        }
        return third;
    }

    /**
     * Remove the effects of a constraint on the objective function.
     *
     * @private
     */
    private _removeConstraintEffects( cn: Constraint, tag: ITag ): void {
        if ( tag.marker.type === ISymbolType.Error ) {
            this._removeMarkerEffects( tag.marker, cn.strength );
        }
        if ( tag.other.type === ISymbolType.Error ) {
            this._removeMarkerEffects( tag.other, cn.strength );
        }
    }

    /**
     * Remove the effects of an error marker on the objective function.
     *
     * @private
     */
    private _removeMarkerEffects( marker: ISymbol, strength: number ): void {
        const pair = this.rows.find( marker );
        if ( pair !== undefined ) {
            this.objective.insertRow( pair.second, -strength );
        } else {
            this.objective.insertISymbol( marker, -strength );
        }
    }

    /**
     * Get the first Slack or Error symbol in the row.
     *
     * If no such symbol is present, an invalid symbol will be returned.
     *
     * @private
     */
    private _anyPivotableISymbol( row: Row ): ISymbol {
        const cells = row.cells();
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            const pair = cells.itemAt( i );
            const type = pair.first.type;
            if ( type === ISymbolType.Slack || type === ISymbolType.Error ) {
                return pair.first;
            }
        }
        return INVALID_SYMBOL;
    }

    /**
     * Returns a new ISymbol of the given type.
     *
     * @private
     */
    private _makeISymbol( type: ISymbolType ): ISymbol {
        return new ISymbol( type, this._idTick++ );
    }

    private constraints = createCnMap();
    private rows = createRowMap();
    private vars = createVarMap();
    private edits = createEditMap();
    private _infeasibleRows: ISymbol[] = [];
    private objective: Row = new Row();
    private _artificial: Row = null;
    private _idTick: number = 0;
}

/**
 * Test whether a value is approximately zero.
 * @private
 */
function nearZero( value: number ): boolean {
    const eps = 1.0e-8;
    return value < 0.0 ? -value < eps : value < eps;
}

/**
 * The internal interface of a tag value.
 */
interface ITag {
    marker: ISymbol;
    other: ISymbol;
}

/**
 * The internal interface of an edit info object.
 */
interface IEditInfo {
    tag: ITag;
    constraint: Constraint;
    constant: number;
}

/**
 * The internal interface for returning created row data.
 */
interface IRowCreation {
    row: Row;
    tag: ITag;
}

/**
 * An internal function for creating a constraint map.
 * @private
 */
function createCnMap(): IMap<Constraint, ITag> {
    return createMap<Constraint, ITag>( Constraint.Compare );
}

/**
 * An internal function for creating a row map.
 * @private
 */
function createRowMap(): IMap<ISymbol, Row> {
    return createMap<ISymbol, Row>( ISymbol.Compare );
}

/**
 * An internal function for creating a variable map.
 * @private
 */
function createVarMap(): IMap<Variable, ISymbol> {
    return createMap<Variable, ISymbol>( Variable.Compare );
}

/**
 * An internal function for creating an edit map.
 * @private
 */
function createEditMap(): IMap<Variable, IEditInfo> {
    return createMap<Variable, IEditInfo>( Variable.Compare );
}

/**
 * An enum defining the available symbol types.
 * @private
 */
enum ISymbolType {
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
class ISymbol {
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
let INVALID_SYMBOL = new ISymbol( ISymbolType.Invalid, -1 );

/**
 * An internal row class used by the solver.
 * @private
 */
class Row {
    /**
     * Construct a new Row.
     */
    constructor(public constant: number = 0.0 ) {}

    /**
     * Returns the mapping of symbols to coefficients.
     */
    public cells(): IMap<ISymbol, number> {
        return this._cellMap;
    }

    /**
     * Returns true if the row is a constant value.
     */
    public isConstant(): boolean {
        return this._cellMap.empty();
    }

    /**
     * Returns true if the Row has all dummy symbols.
     */
    public allDummies(): boolean {
        let cells = this._cellMap;
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            if ( pair.first.type !== ISymbolType.Dummy ) {
                return false;
            }
        }
        return true;
    }

    /**
     * Create a copy of the row.
     */
    public copy(): Row {
        let theCopy = new Row( this.constant );
        theCopy._cellMap = this._cellMap.copy();
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
        let pair = this._cellMap.setDefault( symbol, () => 0.0 );
        if ( nearZero( pair.second += coefficient ) ) {
            this._cellMap.erase( symbol );
        }
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
        let cells = other._cellMap;
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            this.insertISymbol( pair.first, pair.second * coefficient );
        }
    }

    /**
     * Remove a symbol from the row.
     */
    public removeISymbol( symbol: ISymbol ): void {
        this._cellMap.erase( symbol );
    }

    /**
     * Reverse the sign of the constant and cells in the row.
     */
    public reverseSign(): void {
        this.constant = -this.constant;
        let cells = this._cellMap;
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            let pair = cells.itemAt( i );
            pair.second = -pair.second;
        }
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
        let cells = this._cellMap;
        let pair = cells.erase( symbol );
        let coeff = -1.0 / pair.second;
        this.constant *= coeff;
        for ( let i = 0, n = cells.size(); i < n; ++i ) {
            cells.itemAt( i ).second *= coeff;
        }
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
        let pair = this._cellMap.find( symbol );
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
        let pair = this._cellMap.erase( symbol );
        if ( pair !== undefined ) {
            this.insertRow( row, pair.second );
        }
    }

    private _cellMap = createMap<ISymbol, number>( ISymbol.Compare );
}
