/**
 * Vectores de estado de las lunas respecto a su planeta: posición (km) y
 * velocidad (km/s) en el marco eclíptico J2000, el 1 de enero de 2026 a las
 * 00:00 UT. Fuente: JPL Horizons (ssd.jpl.nasa.gov).
 *
 * Con ellos se calculan el plano orbital real de cada luna y su posición en
 * esa fecha; a partir de ahí se propaga con su periodo orbital.
 */
export const SATELLITE_EPOCH = '2026-01-01T00:00:00Z';

export const SATELLITE_STATES = {
    fobos: { r: [-2501.350, -8873.102, 568.481], v: [1.838640, -0.589157, -0.989620] },
    deimos: { r: [10789.870, 20548.029, -3379.777], v: [-1.068235, 0.645748, 0.518073] },
    io: { r: [371756.525, -200242.735, -1923.384], v: [8.268751, 15.200643, 0.661724] },
    europa: { r: [83487.239, -669404.439, -19066.790], v: [13.543777, 1.784636, 0.340375] },
    ganimedes: { r: [1012119.095, -343141.810, 1554.765], v: [3.504934, 10.310513, 0.444550] },
    calisto: { r: [9822.759, 1879135.780, 58943.758], v: [-8.213158, 0.105645, -0.107381] },
    titan: { r: [1111984.309, -403852.410, 97602.366], v: [1.920851, 4.721101, -2.625816] },
    triton: { r: [-284500.497, -29969.154, 209759.856], v: [1.246677, 3.587220, 2.202592] },
    caronte: { r: [10154.732, 596.306, -16747.809], v: [-0.116274, -0.174275, -0.076746] },
};
