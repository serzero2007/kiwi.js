/*-----------------------------------------------------------------------------
| Copyright (c) 2014, Nucleic Development Team.
|
| Distributed under the terms of the Modified BSD License.
|
| The full license is in the file COPYING.txt, distributed with this software.
|----------------------------------------------------------------------------*/

import { Expression } from "./expression";

/**
 * The primary user constraint variable.
 */
export class Variable {

    /**
     * A static variable comparison function.
     * @private
     */
    public static Compare(a: Variable, b: Variable): number {
        return a.id - b.id;
    }

    public id: number = VarId++;

    constructor(
      public name: string = "",
      public value: number = 0.0,
      public context: any = null) {}

    /**
     * Creates a new Expression by adding a number, variable or expression
     * to the variable.
     *
     * @param {Number|Variable|Expression} value Value to add.
     * @return {Expression} expression
     */
    public plus( value: number|Variable|Expression ): Expression {
        return new Expression(this, value);
    }

    /**
     * Creates a new Expression by substracting a number, variable or expression
     * from the variable.
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

    /**
     * Returns the JSON representation of the variable.
     * @private
     */
    public toJSON(): any {
        return {
            name: this.name,
            value: this.value,
        };
    }

    public toString(): string {
        return this.context + "[" + this.name + ":" + this.value + "]";
    }

}

/**
 * The internal variable id counter.
 * @private
 */
let VarId = 0;
