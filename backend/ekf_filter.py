"""
ekf_filter.py — Extended Kalman Filter for sensor smoothing.

Each ScalarEKF instance tracks a 2-state vector:
    x = [value, rate_of_change]

This lets the alert engine distinguish real trends (voltage sagging at
-0.06 V/s) from sensor noise, which is critical for a college EV
prototype with noisy ADC readings.

Three independent instances are maintained (one per tracked parameter):
    voltage_ekf, current_ekf, speed_ekf

Filter state persists between polling cycles — it is NOT reset each loop.
The EKF accumulates confidence over time, making later estimates more
accurate than early ones.

Tuning guide:
    PROCESS_NOISE_VALUE  — higher = trust measurements more (noisier model)
    PROCESS_NOISE_RATE   — higher = allow rate to change faster
    MEASUREMENT_NOISE    — higher = trust model more (noisier sensor)
    For an ESP32 ADC reading voltage through a divider, R ≈ 0.01–0.05 is
    reasonable. For current via ACS712, R ≈ 0.02–0.1.
"""

import numpy as np

# ── Configurable noise defaults ───────────────────────────────────────
# Process noise (Q diagonal) — how much we expect the true state to
# change per second beyond what the model predicts.
PROCESS_NOISE_VALUE = 0.01    # variance in value per second²
PROCESS_NOISE_RATE  = 0.005   # variance in rate per second²

# Measurement noise (R) — variance of the raw sensor reading.
MEASUREMENT_NOISE   = 0.03


class ScalarEKF:
    """
    2-state Extended Kalman Filter for a single scalar parameter.

    State vector:  x = [value, rate_of_change]
    Transition:    x_k = F @ x_{k-1}   where F = [[1, dt], [0, 1]]
    Measurement:   z_k = H @ x_k       where H = [1, 0]

    Usage:
        ekf = ScalarEKF()
        smoothed_val, rate = ekf.process_reading(raw_measurement, dt)
    """

    def __init__(
        self,
        process_noise_value: float = PROCESS_NOISE_VALUE,
        process_noise_rate: float = PROCESS_NOISE_RATE,
        measurement_noise: float = MEASUREMENT_NOISE,
    ):
        # State vector [value, rate_of_change] — initialized on first reading
        self.x = None  # np.array shape (2,)
        self.P = None  # covariance matrix shape (2, 2)
        self._initialized = False

        # Noise parameters
        self._q_val = process_noise_value
        self._q_rate = process_noise_rate
        self._r = measurement_noise

        # Measurement matrix (we only observe the value, not the rate)
        self._H = np.array([[1.0, 0.0]])

    @property
    def initialized(self) -> bool:
        return self._initialized

    @property
    def value(self) -> float:
        """Current smoothed value estimate."""
        return float(self.x[0]) if self._initialized else 0.0

    @property
    def rate(self) -> float:
        """Current rate-of-change estimate (units/second)."""
        return float(self.x[1]) if self._initialized else 0.0

    def _init_state(self, first_measurement: float):
        """Initialize state from the very first measurement."""
        self.x = np.array([first_measurement, 0.0])
        # High initial covariance = "we're not sure yet"
        self.P = np.array([
            [1.0, 0.0],
            [0.0, 1.0],
        ])
        self._initialized = True

    def predict(self, dt: float):
        """
        Time-update (prediction) step.

        Propagates state forward by dt seconds using the constant-rate model:
            value_new = value_old + rate * dt
            rate_new  = rate_old  (assumed constant between measurements)
        """
        if not self._initialized:
            return

        # State transition matrix
        F = np.array([
            [1.0, dt],
            [0.0, 1.0],
        ])

        # Process noise covariance (scaled by dt)
        Q = np.array([
            [self._q_val * dt, 0.0],
            [0.0, self._q_rate * dt],
        ])

        # Predict
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q

    def update(self, measurement: float):
        """
        Measurement-update (correction) step.

        Fuses the raw sensor reading with the prediction to produce
        an optimal estimate.
        """
        if not self._initialized:
            self._init_state(measurement)
            return

        H = self._H
        R = np.array([[self._r]])

        # Innovation (measurement residual)
        y = np.array([measurement]) - H @ self.x

        # Innovation covariance
        S = H @ self.P @ H.T + R

        # Kalman gain
        K = self.P @ H.T @ np.linalg.inv(S)

        # Update state and covariance
        self.x = self.x + (K @ y).flatten()
        I = np.eye(2)
        self.P = (I - K @ H) @ self.P

    def process_reading(self, measurement: float, dt: float) -> tuple[float, float]:
        """
        Convenience method: predict → update → return (smoothed_value, rate).

        Args:
            measurement: raw sensor reading
            dt: time elapsed since last reading (seconds)

        Returns:
            (smoothed_value, rate_of_change)
        """
        if not self._initialized:
            self.update(measurement)
            return (self.value, self.rate)

        self.predict(dt)
        self.update(measurement)
        return (self.value, self.rate)

    def filter_series(
        self, measurements: list[float], timestamps: list[float]
    ) -> tuple[list[float], list[float]]:
        """
        Process a batch of readings (e.g. on first startup to warm up the filter).

        Args:
            measurements: list of raw values, oldest-first
            timestamps:   list of epoch seconds, oldest-first

        Returns:
            (smoothed_values, rates) — same length as inputs
        """
        smoothed = []
        rates = []

        for idx, (m, t) in enumerate(zip(measurements, timestamps)):
            if idx == 0:
                val, rate = self.process_reading(m, dt=1.0)
            else:
                dt = max(timestamps[idx] - timestamps[idx - 1], 0.01)
                val, rate = self.process_reading(m, dt)
            smoothed.append(val)
            rates.append(rate)

        return smoothed, rates


# ── Pre-built filter instances (persistent across polling cycles) ─────
voltage_ekf = ScalarEKF(
    process_noise_value=0.008,
    process_noise_rate=0.004,
    measurement_noise=0.02,
)

current_ekf = ScalarEKF(
    process_noise_value=0.015,
    process_noise_rate=0.008,
    measurement_noise=0.05,
)

speed_ekf = ScalarEKF(
    process_noise_value=0.02,
    process_noise_rate=0.01,
    measurement_noise=0.1,
)
