interface IVector3 {
	x: number;
	y: number;
	z: number;
}

function isVector(v: any): v is IVector3 {
	return typeof v == "object" && v.x != null && v.y != null && v.x != null;
}

class Vector implements IVector3 {
	x: number;
	y: number;
	z: number;

	constructor(x?: number, y?: number, z?: number) {
		this.x = x || 0;
		this.y = y || 0;
		this.z = z || 0;
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

	sqrLength(): number {
		return this.dot(this);
	}

	unit(): Vector {
		return this.divide(this.length());
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

	toArray(): number[] {
		return [this.x, this.y, this.z];
	}

	clone(): Vector {
		return new Vector(this.x, this.y, this.z);
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
