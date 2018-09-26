
function clip( value: number ) {
    return Math.max( 0.0, Math.min( required, value ) );
}

function create( a: number, b: number, c: number, w: number = 1.0 ) {
    let result: number = 0.0;
    result += Math.max( 0.0, Math.min( 1000.0, a * w ) ) * 1000000.0;
    result += Math.max( 0.0, Math.min( 1000.0, b * w ) ) * 1000.0;
    result += Math.max( 0.0, Math.min( 1000.0, c * w ) );
    return result;
}

const required = create( 1000.0, 1000.0, 1000.0 );
const strong   = create( 1.0, 0.0, 0.0 );
const medium   = create( 0.0, 1.0, 0.0 );
const weak     = create( 0.0, 0.0, 1.0 );

export const Strength = { create, clip, required, strong, medium, weak };
