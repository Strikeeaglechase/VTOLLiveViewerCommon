import { Matrix4 } from "./math/matrix4x4.js";
import { Quaternion } from "./math/quaternion.js";
import { clamp } from "./math/utils.js";

interface IVector3 {
	x: number;
	y: number;
	z: number;
}

function isVector(v: any): v is IVector3 {
	return typeof v == "object" && v.x != null && v.y != null && v.x != null;
}

class Vector implements IVector3 {
	public x: number;
	public y: number;
	public z: number;

	constructor(x: number = 0, y: number = 0, z: number = 0) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	set(vector: IVector3): this;
	set(x: number, y: number, z: number): this;
	set(x: number | IVector3, y?: number, z?: number): this {
		if (typeof x == "object") {
			this.x = x.x;
			this.y = x.y;
			this.z = x.z;
		} else if (y != undefined && z != undefined) {
			this.x = x;
			this.y = y;
			this.z = z;
		}
		return this;
	}

	setScalar(scalar: number): this {
		this.x = scalar;
		this.y = scalar;
		this.z = scalar;
		return this;
	}

	setX(x: number): this {
		this.x = x;
		return this;
	}

	setY(y: number): this {
		this.y = y;
		return this;
	}

	setZ(z: number): this {
		this.z = z;
		return this;
	}

	setComponent(index: number, value: number): this {
		switch (index) {
			case 0:
				this.x = value;
				break;

			case 1:
				this.y = value;
				break;

			case 2:
				this.z = value;
				break;

			default:
				throw new Error("index is out of range: " + index);
		}

		return this;
	}

	getComponent(index: number): any {
		switch (index) {
			case 0:
				return this.x;

			case 1:
				return this.y;

			case 2:
				return this.z;

			default:
				throw new Error("index is out of range: " + index);
		}
	}

	distanceTo(vector: IVector3): number {
		return Math.sqrt((vector.x - this.x) * (vector.x - this.x) + (vector.y - this.y) * (vector.y - this.y) + (vector.z - this.z) * (vector.z - this.z));
	}

	negative(): Vector {
		return new Vector(-this.x, -this.y, -this.z);
	}

	add(v: IVector3): Vector {
		if (isVector(v)) return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
		else return new Vector(this.x + v, this.y + v, this.z + v);
	}

	subtract(v: number | IVector3): Vector {
		if (isVector(v)) return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
		else return new Vector(this.x - v, this.y - v, this.z - v);
	}

	multiply(v: number | IVector3): Vector {
		if (isVector(v)) return new Vector(this.x * v.x, this.y * v.y, this.z * v.z);
		else return new Vector(this.x * v, this.y * v, this.z * v);
	}

	divide(v: number | IVector3): Vector {
		if (isVector(v)) return new Vector(this.x / v.x, this.y / v.y, this.z / v.z);
		else return new Vector(this.x / v, this.y / v, this.z / v);
	}

	equals(v: IVector3): boolean {
		return this.x == v.x && this.y == v.y && this.z == v.z;
	}

	dot(v: IVector3): number {
		return this.x * v.x + this.y * v.y + this.z * v.z;
	}

	cross(v: IVector3): Vector {
		return new Vector(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
	}

	length(): number {
		return Math.sqrt(this.dot(this));
	}

	crossVectors(a: Vector, b: Vector): this {
		const ax = a.x,
			ay = a.y,
			az = a.z;
		const bx = b.x,
			by = b.y,
			bz = b.z;
		this.x = ay * bz - az * by;
		this.y = az * bx - ax * bz;
		this.z = ax * by - ay * bx;
		return this;
	}

	projectOnVector(v: Vector): Vector {
		const denominator = v.sqrLength();
		if (denominator === 0) return this.set(0, 0, 0);
		const scalar = v.dot(this) / denominator;
		return this.copy(v).multiply(scalar);
	}

	reflect(normal: Vector): Vector {
		// reflect incident vector off plane orthogonal to normal
		// normal is assumed to have unit length
		return this.subtract(new Vector().copy(normal).multiply(2 * this.dot(normal)));
	}

	sqrLength(): number {
		return this.dot(this);
	}

	unit(): Vector {
		return this.divide(this.length());
	}

	normalized(): Vector {
		const len = this.length();
		if (len === 0) return new Vector(0, 0, 0);
		return this.divide(len);
	}

	min(): number {
		return Math.min(Math.min(this.x, this.y), this.z);
	}

	max(): number {
		return Math.max(Math.max(this.x, this.y), this.z);
	}

	toAngles(): { theta: number; phi: number } {
		return {
			theta: Math.atan2(this.z, this.x),
			phi: Math.asin(this.y / this.length())
		};
	}

	clampLength(maxLen: number): Vector {
		return this.length() > maxLen ? this.unit().multiply(maxLen) : this.clone();
	}

	angleTo(a: Vector): number {
		return Math.acos(this.dot(a) / (this.length() * a.length()));
	}

	toString() {
		return `(${this.x}, ${this.y}, ${this.z})`;
	}

	clone(): Vector {
		return new Vector(this.x, this.y, this.z);
	}

	copy(v: IVector3): this {
		this.x = v.x;
		this.y = v.y;
		this.z = v.z;
		return this;
	}

	applyEuler(euler: Vector, order: string = "XYZ"): this {
		return this.applyQuaternion(new Quaternion().setFromEuler(euler, order));
	}

	applyAxisAngle(axis: Vector, angle: number): this {
		return this.applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle));
	}

	applyQuaternion(q: Quaternion): this {
		const x = this.x,
			y = this.y,
			z = this.z;
		const qx = q.x,
			qy = q.y,
			qz = q.z,
			qw = q.w; // calculate quat * vector

		const ix = qw * x + qy * z - qz * y;
		const iy = qw * y + qz * x - qx * z;
		const iz = qw * z + qx * y - qy * x;
		const iw = -qx * x - qy * y - qz * z; // calculate result * inverse quat

		this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
		this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
		this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
		return this;
	}

	transformDirection(m: Matrix4): Vector {
		// input: THREE.Matrix4 affine matrix
		// vector interpreted as a direction
		const x = this.x,
			y = this.y,
			z = this.z;
		const e = m.elements;
		this.x = e[0] * x + e[4] * y + e[8] * z;
		this.y = e[1] * x + e[5] * y + e[9] * z;
		this.z = e[2] * x + e[6] * y + e[10] * z;
		return this.normalized();
	}

	setFromMatrixPosition(m: Matrix4): this {
		const e = m.elements;
		this.x = e[12];
		this.y = e[13];
		this.z = e[14];
		return this;
	}

	setFromMatrixScale(m: Matrix4): this {
		const sx = this.setFromMatrixColumn(m, 0).length();
		const sy = this.setFromMatrixColumn(m, 1).length();
		const sz = this.setFromMatrixColumn(m, 2).length();
		this.x = sx;
		this.y = sy;
		this.z = sz;
		return this;
	}

	setFromMatrixColumn(m: Matrix4, index: number): this {
		return this.fromArray(m.elements, index * 4);
	}

	setFromMatrix3Column(m: Matrix4, index: number): this {
		return this.fromArray(m.elements, index * 3);
	}

	setFromRotationMatrix(m: Matrix4, order: string): this {
		// assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
		const te = m.elements;
		const m11 = te[0],
			m12 = te[4],
			m13 = te[8];
		const m21 = te[1],
			m22 = te[5],
			m23 = te[9];
		const m31 = te[2],
			m32 = te[6],
			m33 = te[10];

		if (order == "XYZ") {
			this.y = Math.asin(clamp(m13, -1, 1));

			if (Math.abs(m13) < 0.9999999) {
				this.x = Math.atan2(-m23, m33);
				this.z = Math.atan2(-m12, m11);
			} else {
				this.x = Math.atan2(m32, m22);
				this.z = 0;
			}
		} else if (order == "YXZ") {
			this.x = Math.asin(-clamp(m23, -1, 1));

			if (Math.abs(m23) < 0.9999999) {
				this.y = Math.atan2(m13, m33);
				this.z = Math.atan2(m21, m22);
			} else {
				this.y = Math.atan2(-m31, m11);
				this.z = 0;
			}
		} else if (order == "ZXY") {
			this.x = Math.asin(clamp(m32, -1, 1));

			if (Math.abs(m32) < 0.9999999) {
				this.y = Math.atan2(-m31, m33);
				this.z = Math.atan2(-m12, m22);
			} else {
				this.y = 0;
				this.z = Math.atan2(m21, m11);
			}
		} else if (order == "ZYX") {
			this.y = Math.asin(-clamp(m31, -1, 1));

			if (Math.abs(m31) < 0.9999999) {
				this.x = Math.atan2(m32, m33);
				this.z = Math.atan2(m21, m11);
			} else {
				this.x = 0;
				this.z = Math.atan2(-m12, m22);
			}
		} else if (order == "YZX") {
			this.z = Math.asin(clamp(m21, -1, 1));

			if (Math.abs(m21) < 0.9999999) {
				this.x = Math.atan2(-m23, m22);
				this.y = Math.atan2(-m31, m11);
			} else {
				this.x = 0;
				this.y = Math.atan2(m13, m33);
			}
		} else if (order == "XZY") {
			this.z = Math.asin(-clamp(m12, -1, 1));

			if (Math.abs(m12) < 0.9999999) {
				this.x = Math.atan2(m32, m22);
				this.y = Math.atan2(m13, m11);
			} else {
				this.x = Math.atan2(-m23, m33);
				this.y = 0;
			}
		} else {
			console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
		}

		return this;
	}

	fromArray(array: number[], offset = 0): this {
		this.x = array[offset];
		this.y = array[offset + 1];
		this.z = array[offset + 2];
		return this;
	}

	toArray(array: number[] = [], offset = 0): any[] {
		array[offset] = this.x;
		array[offset + 1] = this.y;
		array[offset + 2] = this.z;
		return array;
	}

	init(x: number, y: number, z: number): this {
		this.x = x;
		this.y = y;
		this.z = z;
		return this;
	}

	to<K, T extends new (x: number, y: number, z: number) => K = new () => K>(ctr: T) {
		return new ctr(this.x, this.y, this.z);
	}

	static negative<T extends IVector3>(a: IVector3, b: T): T {
		b.x = -a.x;
		b.y = -a.y;
		b.z = -a.z;
		return b;
	}

	static add<T extends IVector3>(a: IVector3, b: IVector3, c: T): T {
		c.x = a.x + b.x;
		c.y = a.y + b.y;
		c.z = a.z + b.z;
		return c;
	}

	static subtract<T extends IVector3>(a: IVector3, b: IVector3, c: T): T {
		c.x = a.x - b.x;
		c.y = a.y - b.y;
		c.z = a.z - b.z;
		return c;
	}

	static multiply<T extends IVector3>(a: IVector3, b: IVector3, c: T): T {
		c.x = a.x * b.x;
		c.y = a.y * b.y;
		c.z = a.z * b.z;
		return c;
	}

	static divide<T extends IVector3>(a: IVector3, b: IVector3, c: T): T {
		c.x = a.x / b.x;
		c.y = a.y / b.y;
		c.z = a.z / b.z;
		return c;
	}

	static cross<T extends IVector3>(a: IVector3, b: IVector3, c: T): T {
		c.x = a.y * b.z - a.z * b.y;
		c.y = a.z * b.x - a.x * b.z;
		c.z = a.x * b.y - a.y * b.x;
		return c;
	}

	static unit<T extends IVector3>(a: Vector, b: T): T {
		const length = a.length();
		b.x = a.x / length;
		b.y = a.y / length;
		b.z = a.z / length;
		return b;
	}

	static fromAngles(theta: number, phi: number): Vector {
		return new Vector(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi));
	}

	static from(vec: IVector3) {
		return new Vector(vec.x, vec.y, vec.z);
	}

	static randomDirection(): Vector {
		return Vector.fromAngles(Math.random() * Math.PI * 2, Math.asin(Math.random() * 2 - 1));
	}

	static min(a: IVector3, b: IVector3): Vector {
		return new Vector(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
	}

	static max(a: IVector3, b: IVector3): Vector {
		return new Vector(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
	}

	static lerp(a: Vector, b: Vector, fraction: number): Vector {
		return b.subtract(a).multiply(fraction).add(a);
	}

	static fromArray(a: [number, number, number]): Vector {
		return new Vector(a[0], a[1], a[2]);
	}

	static angleBetween(a: Vector, b: Vector): number {
		return a.angleTo(b);
	}
}

export { Vector, IVector3 };
