export class KalmanFilter {
    private R: number;
    private Q: number;
    private A: number;
    private B: number;
    private C: number;
    private cov: number;
    private x: number;

    /**
     * Create 1-dimensional kalman filter
     * @param R Process noise
     * @param Q Measurement noise
     * @param A State vector
     * @param B Control vector
     * @param C Measurement vector
     */
    constructor(R: number = 1, Q: number = 1, A: number = 1, B: number = 0, C: number = 1, cov: number = undefined, x: number = undefined) {
        this.R = R; // noise power desirable
        this.Q = Q; // noise power estimated

        this.A = A;
        this.B = B;
        this.C = C;
        this.cov = cov;
        this.x = x; // estimated signal without noise
    }

    /**
     * Filter a new value
     * @param z Measurement
     * @param u Control
     * @returns Filtered value
     */
    filter(z: number, u: number = 0): number {
        if (this.x === undefined)
        {
            this.x = (1 / this.C) * z;
            this.cov = (1 / this.C) * this.Q * (1 / this.C);
        }
        else
        {
            // Compute prediction
            let predX = this.A * this.x + this.B * u;
            let predCov = this.A * this.cov * this.A + this.R;

            // Kalman gain
            let K = predCov * this.C / (this.C * predCov * this.C + this.Q);

            // Correction
            this.x = predX + K * (z - this.C * predX);
            this.cov = (1 - K * this.C) * predCov;
        }

        return this.x;
    }

    /**
     * Set state
     * @param x Initial state
     * @param cov Initial covariance
     */
    setState(x: number, cov: number) {
        this.x = x;
        this.cov = cov;
    }
}
