class PID {
	private previousError: number = 0;
	private integral: number = 0;

	constructor(public kP: number, public kI: number, public kD: number, public maxIntegral = 10) {
		this.kP = kP;
		this.kI = kI;
		this.kD = kD;
	}

	public update(error: number, dt: number) {
		this.integral += error * dt;
		const derivative = (error - this.previousError) / dt;
		this.previousError = error;

		this.integral = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integral));

		return this.kP * error + this.kI * this.integral + this.kD * derivative;
	}

	public copy(): PID {
		return new PID(this.kP, this.kI, this.kD, this.maxIntegral);
	}

	public reset() {
		this.previousError = 0;
		this.integral = 0;
	}
}

export { PID };
