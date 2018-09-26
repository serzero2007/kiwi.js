/*-----------------------------------------------------------------------------
| Copyright (c) 2014, Nucleic Development Team.
|
| Distributed under the terms of the Modified BSD License.
|
| The full license is in the file COPYING.txt, distributed with this software.
|----------------------------------------------------------------------------*/

import { Expression } from "./expression";
import { Strength } from "./strength";
import { Variable } from "./variable";

/**
 * An enum defining the linear constraint operators.
 *
 * |Value|Operator|Description|
 * |----|-----|-----|
 * |`Le`|<=|Less than equal|
 * |`Ge`|>=|Greater than equal|
 * |`Eq`|==|Equal|
 *
 * @enum {Number}
 */
export
enum Operator {
    Le,  // <=
    Ge,  // >=
    Eq,   // ==
}

/**
 * A linear constraint equation.
 *
 * A constraint equation is composed of an expression, an operator,
 * and a strength. The RHS of the equation is implicitly zero.
 *
 * @class
 * @param {Expression} expression The constraint expression (LHS).
 * @param {Operator} operator The equation operator.
 * @param {Expression} [rhs] Right hand side of the expression.
 * @param {Number} [strength=Strength.required] The strength of the constraint.
 */
export
class Constraint {

    /**
     * A static constraint comparison function.
     * @private
     */
    public static Compare(a: Constraint, b: Constraint): number {
        return a.id - b.id;
    }

    public expression: Expression;
    public strength: number;
    public id: number = CnId++;

    constructor(
      expression: Expression|Variable,
      public operator: Operator,
      rhs?: Expression|Variable|number,
      strength: number = Strength.required,
    ) {
        this.strength = Strength.clip(strength);
        if ((rhs === undefined) && (expression instanceof Expression)) {
            this.expression = expression;
        } else {
            this.expression = expression.minus(rhs);
        }
    }

    public toString(): string {
        return this.expression.toString() + " "
        + Operator[this.operator]
        + " 0 (" + this.strength.toString() + ")";
    }

}

/**
 * The internal constraint id counter.
 * @private
 */
let CnId = 0;
