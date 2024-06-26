function isVector(v) {
    return typeof v == "object" && v.x != null && v.y != null && v.x != null;
}
class Vector {
    x;
    y;
    z;
    constructor(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    }
    set(x, y, z) {
        if (typeof x == "object") {
            this.x = x.x;
            this.y = x.y;
            this.z = x.z;
        }
        else if (y != undefined && z != undefined) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        return this;
    }
    distanceTo(vector) {
        return Math.sqrt((vector.x - this.x) * (vector.x - this.x) + (vector.y - this.y) * (vector.y - this.y) + (vector.z - this.z) * (vector.z - this.z));
    }
    negative() {
        return new Vector(-this.x, -this.y, -this.z);
    }
    add(v) {
        if (isVector(v))
            return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
        else
            return new Vector(this.x + v, this.y + v, this.z + v);
    }
    subtract(v) {
        if (isVector(v))
            return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
        else
            return new Vector(this.x - v, this.y - v, this.z - v);
    }
    multiply(v) {
        if (isVector(v))
            return new Vector(this.x * v.x, this.y * v.y, this.z * v.z);
        else
            return new Vector(this.x * v, this.y * v, this.z * v);
    }
    divide(v) {
        if (isVector(v))
            return new Vector(this.x / v.x, this.y / v.y, this.z / v.z);
        else
            return new Vector(this.x / v, this.y / v, this.z / v);
    }
    equals(v) {
        return this.x == v.x && this.y == v.y && this.z == v.z;
    }
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    cross(v) {
        return new Vector(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
    }
    length() {
        return Math.sqrt(this.dot(this));
    }
    sqrLength() {
        return this.dot(this);
    }
    unit() {
        return this.divide(this.length());
    }
    min() {
        return Math.min(Math.min(this.x, this.y), this.z);
    }
    max() {
        return Math.max(Math.max(this.x, this.y), this.z);
    }
    toAngles() {
        return {
            theta: Math.atan2(this.z, this.x),
            phi: Math.asin(this.y / this.length())
        };
    }
    clampLength(maxLen) {
        return this.length() > maxLen ? this.unit().multiply(maxLen) : this.clone();
    }
    angleTo(a) {
        return Math.acos(this.dot(a) / (this.length() * a.length()));
    }
    toArray() {
        return [this.x, this.y, this.z];
    }
    toString() {
        return `(${this.x}, ${this.y}, ${this.z})`;
    }
    clone() {
        return new Vector(this.x, this.y, this.z);
    }
    init(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
    to(ctr) {
        return new ctr(this.x, this.y, this.z);
    }
    static negative(a, b) {
        b.x = -a.x;
        b.y = -a.y;
        b.z = -a.z;
        return b;
    }
    static add(a, b, c) {
        c.x = a.x + b.x;
        c.y = a.y + b.y;
        c.z = a.z + b.z;
        return c;
    }
    static subtract(a, b, c) {
        c.x = a.x - b.x;
        c.y = a.y - b.y;
        c.z = a.z - b.z;
        return c;
    }
    static multiply(a, b, c) {
        c.x = a.x * b.x;
        c.y = a.y * b.y;
        c.z = a.z * b.z;
        return c;
    }
    static divide(a, b, c) {
        c.x = a.x / b.x;
        c.y = a.y / b.y;
        c.z = a.z / b.z;
        return c;
    }
    static cross(a, b, c) {
        c.x = a.y * b.z - a.z * b.y;
        c.y = a.z * b.x - a.x * b.z;
        c.z = a.x * b.y - a.y * b.x;
        return c;
    }
    static unit(a, b) {
        const length = a.length();
        b.x = a.x / length;
        b.y = a.y / length;
        b.z = a.z / length;
        return b;
    }
    static fromAngles(theta, phi) {
        return new Vector(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi));
    }
    static from(vec) {
        return new Vector(vec.x, vec.y, vec.z);
    }
    static randomDirection() {
        return Vector.fromAngles(Math.random() * Math.PI * 2, Math.asin(Math.random() * 2 - 1));
    }
    static min(a, b) {
        return new Vector(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
    }
    static max(a, b) {
        return new Vector(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
    }
    static lerp(a, b, fraction) {
        return b.subtract(a).multiply(fraction).add(a);
    }
    static fromArray(a) {
        return new Vector(a[0], a[1], a[2]);
    }
    static angleBetween(a, b) {
        return a.angleTo(b);
    }
}
export { Vector };
//# sourceMappingURL=vector.js.map