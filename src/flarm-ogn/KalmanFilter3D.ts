import { DateTime } from 'luxon';

// Flat row-major matrix helpers
// 6×6: index [r*6+c],  6×3: [r*3+c],  3×6: [r*6+c],  3×3: [r*3+c]

function identity6(): number[] {
    const I = new Array(36).fill(0);
    I[0]=1; I[7]=1; I[14]=1; I[21]=1; I[28]=1; I[35]=1;
    return I;
}

function mat6Mul(A: number[], B: number[]): number[] {
    const C = new Array(36).fill(0);
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
            let s = 0;
            for (let k = 0; k < 6; k++) s += A[r*6+k] * B[k*6+c];
            C[r*6+c] = s;
        }
    return C;
}

function mat6MulVec(A: number[], v: number[]): number[] {
    const r: number[] = new Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
        let s = 0;
        for (let k = 0; k < 6; k++) s += A[i*6+k] * v[k];
        r[i] = s;
    }
    return r;
}

function mat6Add(A: number[], B: number[]): number[] { return A.map((v,i) => v + B[i]); }
function mat6Sub(A: number[], B: number[]): number[] { return A.map((v,i) => v - B[i]); }

function mat6Transpose(A: number[]): number[] {
    const T = new Array(36).fill(0);
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++)
            T[c*6+r] = A[r*6+c];
    return T;
}

// 6×6 × 6×3 → 6×3
function mat6x6Mul6x3(A: number[], B: number[]): number[] {
    const C = new Array(18).fill(0);
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let k = 0; k < 6; k++) s += A[r*6+k] * B[k*3+c];
            C[r*3+c] = s;
        }
    return C;
}

// 3×6 × 6×6 → 3×6
function mat3x6Mul6x6(A: number[], B: number[]): number[] {
    const C = new Array(18).fill(0);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 6; c++) {
            let s = 0;
            for (let k = 0; k < 6; k++) s += A[r*6+k] * B[k*6+c];
            C[r*6+c] = s;
        }
    return C;
}

// 3×6 × 6×3 → 3×3
function mat3x6Mul6x3(A: number[], B: number[]): number[] {
    const C = new Array(9).fill(0);
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let k = 0; k < 6; k++) s += A[r*6+k] * B[k*3+c];
            C[r*3+c] = s;
        }
    return C;
}

// 6×3 × 3×6 → 6×6
function mat6x3Mul3x6(A: number[], B: number[]): number[] {
    const C = new Array(36).fill(0);
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += A[r*3+k] * B[k*6+c];
            C[r*6+c] = s;
        }
    return C;
}

// 6×3 × 3×3 → 6×3
function mat6x3Mul3x3(A: number[], B: number[]): number[] {
    const C = new Array(18).fill(0);
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += A[r*3+k] * B[k*3+c];
            C[r*3+c] = s;
        }
    return C;
}

// 6×3 × 3 → 6
function mat6x3MulVec3(A: number[], v: number[]): number[] {
    const r: number[] = new Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[i*3+k] * v[k];
        r[i] = s;
    }
    return r;
}

function mat3Add(A: number[], B: number[]): number[] { return A.map((v,i) => v + B[i]); }

// Analytic 3×3 inverse
function mat3Inv(M: number[]): number[] {
    const det =
        M[0] * (M[4]*M[8] - M[5]*M[7]) -
        M[1] * (M[3]*M[8] - M[5]*M[6]) +
        M[2] * (M[3]*M[7] - M[4]*M[6]);

    if (Math.abs(det) < 1e-30) {
        const s = 1 / (Math.abs(M[0]) + Math.abs(M[4]) + Math.abs(M[8]) + 1e-30);
        return [s,0,0, 0,s,0, 0,0,s];
    }

    const d = 1 / det;
    return [
        (M[4]*M[8] - M[5]*M[7]) * d,  (M[2]*M[7] - M[1]*M[8]) * d,  (M[1]*M[5] - M[2]*M[4]) * d,
        (M[5]*M[6] - M[3]*M[8]) * d,  (M[0]*M[8] - M[2]*M[6]) * d,  (M[2]*M[3] - M[0]*M[5]) * d,
        (M[3]*M[7] - M[4]*M[6]) * d,  (M[1]*M[6] - M[0]*M[7]) * d,  (M[0]*M[4] - M[1]*M[3]) * d,
    ];
}

// H (3×6): measures lat, lon, alt — identity on first 3 columns
const H: number[] = [
    1, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0,
    0, 0, 1, 0, 0, 0,
];

// H^T (6×3)
const HT: number[] = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
];

const METERS_PER_DEG_LAT = 111_320;

export class KalmanFilter3D {
    private x: number[] | null = null;  // [lat, lon, alt, vLat, vLon, vAlt]
    private P: number[] | null = null;  // 6×6 covariance
    private lastTime: DateTime | null = null;

    // Measurement noise (3×3 diagonal)
    private readonly R: number[];

    // Process noise spectral densities.
    // Q_pos/Q_vel must cover centripetal acceleration during thermalling:
    // ~5 m/s² at 100 km/h / 150 m radius → 4.7e-5 deg/s² → q ≈ (4.7e-5)² ≈ 2e-9.
    private readonly Q_pos  = 2e-9;    // deg²/s³  — horizontal position noise
    private readonly Q_vel  = 2e-9;    // deg²/s³  — horizontal velocity noise (covers ~5 m/s² centripetal)
    private readonly Q_alt  = 1e-10;   // m²/s³    — altitude changes smoothly
    private readonly Q_valt = 0.5;     // m²/s³    — vertical velocity (~0.7 m/s², covers winch)

    constructor(private readonly fieldHeight: number) {
        const R_pos = 1.82e-8;  // ~15 m horizontal GPS noise (deg²)
        const R_alt = 25;       // ~5 m vertical GPS noise (m²)
        this.R = [R_pos, 0, 0,  0, R_pos, 0,  0, 0, R_alt];
    }

    filter(lat: number, lon: number, alt: number, time: DateTime): {
        speed: number;
        climb: number;
        altitude_agl: number;
        latitude: number;
        longitude: number;
    } {
        // First message: initialize state and covariance
        if (this.x === null) {
            this.x = [lat, lon, alt, 0, 0, 0];
            this.P = [
                1.82e-8, 0,       0,   0,     0,     0,
                0,       1.82e-8, 0,   0,     0,     0,
                0,       0,       25,  0,     0,     0,
                0,       0,       0,   1e-6,  0,     0,
                0,       0,       0,   0,     1e-6,  0,
                0,       0,       0,   0,     0,     10,
            ];
            this.lastTime = time;
            return {
                speed: 0, climb: 0,
                altitude_agl: Math.max(0, Math.round(alt - this.fieldHeight)),
                latitude: lat, longitude: lon,
            };
        }

        const rawDt = time.diff(this.lastTime!).as('seconds');
        const dt = Math.min(60, Math.max(0, rawDt));
        this.lastTime = time;

        let x = this.x;
        let P = this.P!;

        if (dt > 0) {
            // ── Predict ──────────────────────────────────────────────
            const A = identity6();
            A[3]  = dt;   // A[0*6+3]: lat  += vLat * dt
            A[10] = dt;   // A[1*6+4]: lon  += vLon * dt
            A[17] = dt;   // A[2*6+5]: alt  += vAlt * dt

            const xPred = mat6MulVec(A, x);

            const dt2 = dt * dt;
            const dt3 = dt2 * dt;
            const Q = new Array(36).fill(0);
            // lat / vLat (indices 0,3)
            Q[0]  = this.Q_pos * dt3/3;   Q[3]  = this.Q_pos * dt2/2;
            Q[18] = this.Q_pos * dt2/2;   Q[21] = this.Q_vel  * dt;
            // lon / vLon (indices 1,4)
            Q[7]  = this.Q_pos * dt3/3;   Q[10] = this.Q_pos * dt2/2;
            Q[25] = this.Q_pos * dt2/2;   Q[28] = this.Q_vel  * dt;
            // alt / vAlt (indices 2,5)
            Q[14] = this.Q_alt  * dt3/3;  Q[17] = this.Q_alt  * dt2/2;
            Q[32] = this.Q_alt  * dt2/2;  Q[35] = this.Q_valt * dt;

            const AT    = mat6Transpose(A);
            const PPred = mat6Add(mat6Mul(mat6Mul(A, P), AT), Q);

            // ── Update ───────────────────────────────────────────────
            // S = H*P*H^T + R  (3×3)
            const HP   = mat3x6Mul6x6(H, PPred);       // 3×6
            const HPHT = mat3x6Mul6x3(HP, HT);         // 3×3
            const S    = mat3Add(HPHT, this.R);

            // K = P*H^T * S^{-1}  (6×3)
            const PHT  = mat6x6Mul6x3(PPred, HT);      // 6×3
            const K    = mat6x3Mul3x3(PHT, mat3Inv(S));// 6×3

            // innovation = z - H*xPred  (H just picks first 3 elements)
            const innov = [lat - xPred[0], lon - xPred[1], alt - xPred[2]];

            // x = xPred + K * innov
            const Kinnov = mat6x3MulVec3(K, innov);
            x = xPred.map((v, i) => v + Kinnov[i]);

            // P = (I - K*H) * P_pred
            const KH       = mat6x3Mul3x6(K, H);       // 6×6
            const IminusKH = mat6Sub(identity6(), KH);
            P = mat6Mul(IminusKH, PPred);
        }

        this.x = x;
        this.P = P;

        // ── Derive outputs ───────────────────────────────────────────
        const mPerDegLon = METERS_PER_DEG_LAT * Math.cos(x[0] * Math.PI / 180);
        const speedMs    = Math.sqrt(
            (x[3] * METERS_PER_DEG_LAT) ** 2 +
            (x[4] * mPerDegLon) ** 2
        );

        return {
            speed:        Math.round(speedMs * 3.6),
            climb:        Math.round(100 * x[5]) / 100,
            altitude_agl: Math.max(0, Math.round(x[2] - this.fieldHeight)),
            latitude:     x[0],
            longitude:    x[1],
        };
    }
}
