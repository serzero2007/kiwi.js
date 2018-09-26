/*-----------------------------------------------------------------------------
| Copyright (c) 2014, Nucleic Development Team.
|
| Distributed under the terms of the Modified BSD License.
|
| The full license is in the file COPYING.txt, distributed with this software.
|----------------------------------------------------------------------------*/

/**
 * @class Strength
 */
 export class Strength {
    /**
     * Create a new symbolic strength.
     *
     * @param {Number} a strong
     * @param {Number} b medium
     * @param {Number} c weak
     * @param {Number} [w] weight
     * @return {Number} strength
     */
    public static create( a: number, b: number, c: number, w: number = 1.0 ) {
        let result: number = 0.0;
        result += Math.max( 0.0, Math.min( 1000.0, a * w ) ) * 1000000.0;
        result += Math.max( 0.0, Math.min( 1000.0, b * w ) ) * 1000.0;
        result += Math.max( 0.0, Math.min( 1000.0, c * w ) );
        return result;
    }

    /**
     * The 'required' symbolic strength.
     */
    public static required = Strength.create( 1000.0, 1000.0, 1000.0 );

    /**
     * The 'strong' symbolic strength.
     */
    public static strong = Strength.create( 1.0, 0.0, 0.0 );

    /**
     * The 'medium' symbolic strength.
     */
    public static medium = Strength.create( 0.0, 1.0, 0.0 );

    /**
     * The 'weak' symbolic strength.
     */
    public static weak = Strength.create( 0.0, 0.0, 1.0 );

    /**
     * Clip a symbolic strength to the allowed min and max.
     * @private
     */
    public static clip( value: number ) {
        return Math.max( 0.0, Math.min( Strength.required, value ) );
    }
}
