/*-----------------------------------------------------------------------------
| Copyright (c) 2014, Nucleic Development Team.
|
| Distributed under the terms of the Modified BSD License.
|
| The full license is in the file COPYING.txt, distributed with this software.
|----------------------------------------------------------------------------*/

import { createMap, IMap } from "./maptype";
import { Variable } from "./variable";

/**
 * An expression of variable terms and a constant.
 *
 * The constructor accepts an arbitrary number of parameters,
 * each of which must be one of the following types:
 *  - number
 *  - Variable
 *  - Expression
 *  - 2-tuple of [number, Variable|Expression]
 *
 * The parameters are summed. The tuples are multiplied.
 *
 * @class
 * @param {...(number|Variable|Expression|Array)} args
 */
export
class Expression {

    public terms: IMap<Variable, number>;
    public constant: number;

    constructor( ...args: any[] ) {
        let parsed = parseArgs( args );
        this.terms = parsed.terms;
        this.constant = parsed.constant;
    }

    /**
     * Returns the computed value of the expression.
     *
     * @private
     * @return {Number} computed value of the expression
     */
    public get value(): number {
        return this.constant +
               this.terms.map(p => p.first.value * p.second)
                         .reduce((a, b) => a + b)
    }

    /**
     * Creates a new Expression by adding a number, variable or expression
     * to the expression.
     *
     * @param {Number|Variable|Expression} value Value to add.
     * @return {Expression} expression
     */
    public plus( value: number|Variable|Expression ): Expression {
        return new Expression(this, value);
    }

    /**
     * Creates a new Expression by substracting a number, variable or expression
     * from the expression.
     *
     * @param {Number|Variable|Expression} value Value to substract.
     * @return {Expression} expression
     */
    public minus( value: number|Variable|Expression ): Expression {
        return new Expression(this, typeof value === "number" ? -value : [-1, value]);
    }

    /**
     * Creates a new Expression by multiplying with a fixed number.
     *
     * @param {Number} coefficient Coefficient to multiply with.
     * @return {Expression} expression
     */
    public multiply( coefficient: number ): Expression {
        return new Expression([coefficient, this]);
    }

    /**
     * Creates a new Expression by dividing with a fixed number.
     *
     * @param {Number} coefficient Coefficient to divide by.
     * @return {Expression} expression
     */
    public divide( coefficient: number ): Expression {
        return new Expression([1 / coefficient, this]);
    }

    public isConstant(): boolean {
        return this.terms.size() === 0;
    }

    public toString(): string {
        let result = this.terms.map(
          (pair) => pair.second + "*" + pair.first.toString()
        )

        if (this.constant !== 0) {
            result.push(this.constant.toString())
        }

        return result.join(" + ");
    }

}

/**
 * An internal interface for the argument parse results.
 */
interface IParseResult {
    terms: IMap<Variable, number>;
    constant: number;
}

/**
 * An internal argument parsing function.
 * @private
 */
function parseArgs( args: any[] ): IParseResult {
    let constant = 0.0;
    let factory = () => 0.0;
    let terms = createMap<Variable, number>( Variable.Compare );
    for ( let i = 0, n = args.length; i < n; ++i ) {
        let item = args[ i ];
        if ( typeof item === "number" ) {
            constant += item;
            continue
        }

        if ( item instanceof Variable ) {
            terms.setDefault(item, () => 1.0)
            continue
        }

        if (item instanceof Expression) {
            constant += item.constant;
            let terms2 = item.terms;
            for (let j = 0, k = terms2.size(); j < k; j++) {
                let termPair = terms2.itemAt(j);
                terms.setDefault(termPair.first, () => termPair.second)
            }
            continue
        }

        if ( item instanceof Array ) {
            if ( item.length !== 2 ) {
                throw new Error( "array must have length 2" );
            }
            let value: number = item[ 0 ];
            let value2 = item[ 1 ];
            if ( typeof value !== "number" ) {
                throw new Error( "array item 0 must be a number" );
            }
            if (value2 instanceof Variable) {
                terms.setDefault(value2, () => value)
            } else if (value2 instanceof Expression) {
                constant += (value2.constant * value);
                let terms2 = value2.terms;
                for (let j = 0, k = terms2.size(); j < k; j++) {
                    let termPair = terms2.itemAt(j);
                    terms.setDefault(termPair.first, () => termPair.second * value)
                }
            } else {
                throw new Error("array item 1 must be a variable or expression");
            }
            continue
        }

        throw new Error( "invalid Expression argument: " + item );
    }
    return { terms, constant };
}
