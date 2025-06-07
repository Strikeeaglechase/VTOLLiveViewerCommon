import { Vector } from "../vector.js";
import { Matrix4 } from "./matrix4x4.js";
import { clamp } from "./utils.js";

class AxisAngles {
	constructor(public axis: Vector, public angle: number) {}

	toString(): string {
		return `(${this.axis}, ${this.angle})`;
	}
}

class Quaternion {
	public x: number;
	public y: number;
	public z: number;
	public w: number;

	constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
	}

	static slerpFlat(dst: number[], dstOffset: number, src0: number[], srcOffset0: number, src1: number[], srcOffset1: number, t: number): void {
		// fuzz-free, array-based Quaternion SLERP operation
		let x0 = src0[srcOffset0 + 0],
			y0 = src0[srcOffset0 + 1],
			z0 = src0[srcOffset0 + 2],
			w0 = src0[srcOffset0 + 3];
		const x1 = src1[srcOffset1 + 0],
			y1 = src1[srcOffset1 + 1],
			z1 = src1[srcOffset1 + 2],
			w1 = src1[srcOffset1 + 3];

		if (t === 0) {
			dst[dstOffset + 0] = x0;
			dst[dstOffset + 1] = y0;
			dst[dstOffset + 2] = z0;
			dst[dstOffset + 3] = w0;
			return;
		}

		if (t === 1) {
			dst[dstOffset + 0] = x1;
			dst[dstOffset + 1] = y1;
			dst[dstOffset + 2] = z1;
			dst[dstOffset + 3] = w1;
			return;
		}

		if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
			let s: number = 1 - t;
			const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1,
				dir = cos >= 0 ? 1 : -1,
				sqrSin = 1 - cos * cos; // Skip the Slerp for tiny steps to avoid numeric problems:

			if (sqrSin > Number.EPSILON) {
				const sin = Math.sqrt(sqrSin),
					len = Math.atan2(sin, cos * dir);
				s = Math.sin(s * len) / sin;
				t = Math.sin(t * len) / sin;
			}

			const tDir = t * dir;
			x0 = x0 * s + x1 * tDir;
			y0 = y0 * s + y1 * tDir;
			z0 = z0 * s + z1 * tDir;
			w0 = w0 * s + w1 * tDir; // Normalize in case we just did a lerp:

			if (s === 1 - t) {
				const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
				x0 *= f;
				y0 *= f;
				z0 *= f;
				w0 *= f;
			}
		}

		dst[dstOffset] = x0;
		dst[dstOffset + 1] = y0;
		dst[dstOffset + 2] = z0;
		dst[dstOffset + 3] = w0;
	}

	static multiplyQuaternionsFlat(dst: number[], dstOffset: number, src0: number[], srcOffset0: number, src1: number[], srcOffset1: number): number[] {
		const x0 = src0[srcOffset0];
		const y0 = src0[srcOffset0 + 1];
		const z0 = src0[srcOffset0 + 2];
		const w0 = src0[srcOffset0 + 3];
		const x1 = src1[srcOffset1];
		const y1 = src1[srcOffset1 + 1];
		const z1 = src1[srcOffset1 + 2];
		const w1 = src1[srcOffset1 + 3];
		dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
		dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
		dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
		dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
		return dst;
	}

	set(x: number, y: number, z: number, w: number): this {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;

		return this;
	}

	clone(): Quaternion {
		return new Quaternion(this.x, this.y, this.z, this.w);
	}

	copy(quaternion: Quaternion): this {
		this.x = quaternion.x;
		this.y = quaternion.y;
		this.z = quaternion.z;
		this.w = quaternion.w;

		return this;
	}

	setFromEuler(euler: Vector, order: string): Quaternion {
		const x = euler.x,
			y = euler.y,
			z = euler.z;
		// 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
		//	content/SpinCalc.m

		const cos = Math.cos;
		const sin = Math.sin;
		const c1 = cos(x / 2);
		const c2 = cos(y / 2);
		const c3 = cos(z / 2);
		const s1 = sin(x / 2);
		const s2 = sin(y / 2);
		const s3 = sin(z / 2);

		switch (order) {
			case "XYZ":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "YXZ":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			case "ZXY":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "ZYX":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			case "YZX":
				this.x = s1 * c2 * c3 + c1 * s2 * s3;
				this.y = c1 * s2 * c3 + s1 * c2 * s3;
				this.z = c1 * c2 * s3 - s1 * s2 * c3;
				this.w = c1 * c2 * c3 - s1 * s2 * s3;
				break;

			case "XZY":
				this.x = s1 * c2 * c3 - c1 * s2 * s3;
				this.y = c1 * s2 * c3 - s1 * c2 * s3;
				this.z = c1 * c2 * s3 + s1 * s2 * c3;
				this.w = c1 * c2 * c3 + s1 * s2 * s3;
				break;

			default:
				console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: " + order);
		}

		return this;
	}

	// toEuler(): Vector {
	// 	const rotMat = new Matrix4().makeRotationFromQuaternion(this);
	// 	const vec = new Vector().setFromRotationMatrix(rotMat, "XYZ");
	// 	return vec;
	// }

	toEuler(order: string = "XYZ"): Vector {
		const rotMat = new Matrix4().makeRotationFromQuaternion(this);
		const vec = new Vector().setFromRotationMatrix(rotMat, order);
		return vec;
	}

	setFromAxisAngle(axis: Vector, angle: number): this {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm
		// assumes axis is normalized
		const halfAngle = angle / 2,
			s = Math.sin(halfAngle);
		this.x = axis.x * s;
		this.y = axis.y * s;
		this.z = axis.z * s;
		this.w = Math.cos(halfAngle);

		return this;
	}

	setFromRotationMatrix(m: Matrix4): this {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
		// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
		const te = m.elements,
			m11 = te[0],
			m12 = te[4],
			m13 = te[8],
			m21 = te[1],
			m22 = te[5],
			m23 = te[9],
			m31 = te[2],
			m32 = te[6],
			m33 = te[10],
			trace = m11 + m22 + m33;

		if (trace > 0) {
			const s: number = 0.5 / Math.sqrt(trace + 1.0);
			this.w = 0.25 / s;
			this.x = (m32 - m23) * s;
			this.y = (m13 - m31) * s;
			this.z = (m21 - m12) * s;
		} else if (m11 > m22 && m11 > m33) {
			const s: number = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
			this.w = (m32 - m23) / s;
			this.x = 0.25 * s;
			this.y = (m12 + m21) / s;
			this.z = (m13 + m31) / s;
		} else if (m22 > m33) {
			const s: number = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
			this.w = (m13 - m31) / s;
			this.x = (m12 + m21) / s;
			this.y = 0.25 * s;
			this.z = (m23 + m32) / s;
		} else {
			const s: number = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
			this.w = (m21 - m12) / s;
			this.x = (m13 + m31) / s;
			this.y = (m23 + m32) / s;
			this.z = 0.25 * s;
		}

		return this;
	}

	setFromUnitVectors(vFrom: Vector, vTo: Vector): this {
		// assumes direction vectors vFrom and vTo are normalized
		let r = vFrom.dot(vTo) + 1;

		if (r < Number.EPSILON) {
			// vFrom and vTo point in opposite directions
			r = 0;

			if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
				this.x = -vFrom.y;
				this.y = vFrom.x;
				this.z = 0;
				this.w = r;
			} else {
				this.x = 0;
				this.y = -vFrom.z;
				this.z = vFrom.y;
				this.w = r;
			}
		} else {
			// crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector
			this.x = vFrom.y * vTo.z - vFrom.z * vTo.y;
			this.y = vFrom.z * vTo.x - vFrom.x * vTo.z;
			this.z = vFrom.x * vTo.y - vFrom.y * vTo.x;
			this.w = r;
		}

		return this.normalize();
	}

	setFromYPR(yaw: number, pitch: number, roll: number) {
		/*
		float x = roll * 0.5f;
	float num = MathF.Sin(x);
	float num2 = MathF.Cos(x);
	float x2 = pitch * 0.5f;
	float num3 = MathF.Sin(x2);
	float num4 = MathF.Cos(x2);
	float x3 = yaw * 0.5f;
	float num5 = MathF.Sin(x3);
	float num6 = MathF.Cos(x3);
	Unsafe.SkipInit(out Quaternion result);
	result.X = num6 * num3 * num2 + num5 * num4 * num;
	result.Y = num5 * num4 * num2 - num6 * num3 * num;
	result.Z = num6 * num4 * num - num5 * num3 * num2;
	result.W = num6 * num4 * num2 + num5 * num3 * num;*/

		const x = roll * 0.5;
		const num = Math.sin(x);
		const num2 = Math.cos(x);
		const x2 = pitch * 0.5;
		const num3 = Math.sin(x2);
		const num4 = Math.cos(x2);
		const x3 = yaw * 0.5;
		const num5 = Math.sin(x3);
		const num6 = Math.cos(x3);
		this.x = num6 * num3 * num2 + num5 * num4 * num;
		this.y = num5 * num4 * num2 - num6 * num3 * num;
		this.z = num6 * num4 * num - num5 * num3 * num2;
		this.w = num6 * num4 * num2 + num5 * num3 * num;

		return this;
	}

	toPitchYawRoll() {
		const q = this;
		var yaw = Math.atan2(2.0 * (q.y * q.z + q.w * q.x), q.w * q.w - q.x * q.x - q.y * q.y + q.z * q.z);
		var pitch = Math.asin(-2.0 * (q.x * q.z - q.w * q.y));
		var roll = Math.atan2(2.0 * (q.x * q.y + q.w * q.z), q.w * q.w + q.x * q.x - q.y * q.y - q.z * q.z);

		return new Vector(pitch, yaw, roll);
	}

	angleTo(q: Quaternion): number {
		return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
	}

	rotateTowards(q: Quaternion, step: number): this {
		const angle = this.angleTo(q);
		if (angle === 0) return this;
		const t = Math.min(1, step / angle);
		this.slerp(q, t);
		return this;
	}

	identity(): this {
		return this.set(0, 0, 0, 1);
	}

	invert(): this {
		// quaternion is assumed to have unit length
		return this.conjugate();
	}

	conjugate(): this {
		this.x *= -1;
		this.y *= -1;
		this.z *= -1;

		return this;
	}

	dot(v: Quaternion): number {
		return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
	}

	lengthSq(): number {
		return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
	}

	length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
	}

	normalize(): this {
		let l = this.length();

		if (l === 0) {
			this.x = 0;
			this.y = 0;
			this.z = 0;
			this.w = 1;
		} else {
			l = 1 / l;
			this.x = this.x * l;
			this.y = this.y * l;
			this.z = this.z * l;
			this.w = this.w * l;
		}

		return this;
	}

	multiply(q: Quaternion): this {
		return this.multiplyQuaternions(this, q);
	}

	premultiply(q: Quaternion): this {
		return this.multiplyQuaternions(q, this);
	}

	multiplyQuaternions(a: Quaternion, b: Quaternion): this {
		// from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm
		const qax = a.x,
			qay = a.y,
			qaz = a.z,
			qaw = a.w;
		const qbx = b.x,
			qby = b.y,
			qbz = b.z,
			qbw = b.w;
		this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
		this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
		this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
		this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

		return this;
	}

	slerp(qb: Quaternion, t: number): this {
		if (t === 0) return this;
		if (t === 1) return this.copy(qb);
		const x = this.x,
			y = this.y,
			z = this.z,
			w = this.w; // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

		let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;

		if (cosHalfTheta < 0) {
			this.w = -qb.w;
			this.x = -qb.x;
			this.y = -qb.y;
			this.z = -qb.z;
			cosHalfTheta = -cosHalfTheta;
		} else {
			this.copy(qb);
		}

		if (cosHalfTheta >= 1.0) {
			this.w = w;
			this.x = x;
			this.y = y;
			this.z = z;
			return this;
		}

		const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;

		if (sqrSinHalfTheta <= Number.EPSILON) {
			const s: number = 1 - t;
			this.w = s * w + t * this.w;
			this.x = s * x + t * this.x;
			this.y = s * y + t * this.y;
			this.z = s * z + t * this.z;
			this.normalize();

			return this;
		}

		const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
		const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
		const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
			ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
		this.w = w * ratioA + this.w * ratioB;
		this.x = x * ratioA + this.x * ratioB;
		this.y = y * ratioA + this.y * ratioB;
		this.z = z * ratioA + this.z * ratioB;

		return this;
	}

	slerpQuaternions(qa: Quaternion, qb: Quaternion, t: number): this {
		return this.copy(qa).slerp(qb, t);
	}

	random(): this {
		// Derived from http://planning.cs.uiuc.edu/node198.html
		// Note, this source uses w, x, y, z ordering,
		// so we swap the order below.
		const u1 = Math.random();
		const sqrt1u1 = Math.sqrt(1 - u1);
		const sqrtu1 = Math.sqrt(u1);
		const u2 = 2 * Math.PI * Math.random();
		const u3 = 2 * Math.PI * Math.random();
		return this.set(sqrt1u1 * Math.cos(u2), sqrtu1 * Math.sin(u3), sqrtu1 * Math.cos(u3), sqrt1u1 * Math.sin(u2));
	}

	equals(quaternion: Quaternion): boolean {
		return quaternion.x === this.x && quaternion.y === this.y && quaternion.z === this.z && quaternion.w === this.w;
	}

	fromArray(array: number[], offset = 0): this {
		this.x = array[offset];
		this.y = array[offset + 1];
		this.z = array[offset + 2];
		this.w = array[offset + 3];

		return this;
	}

	toAxisAngles(): AxisAngles {
		if (Math.abs(this.w) > 1) this.normalize();

		const angle = 2.0 * Math.acos(this.w);
		const den = Math.sqrt(1 - this.w * this.w);
		if (den > 0.0001) {
			const axis = new Vector(this.x / den, this.y / den, this.z / den);
			return new AxisAngles(axis, angle);
		} else {
			return new AxisAngles(new Vector(1, 0, 0), angle);
		}
	}

	toArray(array: number[] = [], offset = 0): any[] {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;
		array[offset + 3] = this.w;
		return array;
	}

	// *[Symbol.iterator]() {
	// 	yield this.x;
	// 	yield this.y;
	// 	yield this.z;
	// 	yield this.w;
	// }

	toString(): string {
		return `(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
	}
}

export { Quaternion };
