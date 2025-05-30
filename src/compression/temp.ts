import fs from "fs";

function numToBytes(num: number) {
	const f32 = new Float32Array(1);
	f32[0] = num;
	return [...new Uint8Array(f32.buffer)];
}

const n = 151.4573;
const x = numToBytes(n);
// const x = [0x1, 0x11, 0x37, 0x36];

const result = bytesToNum(x);
const result2 = oldBytesToNum(x);
const result3 = newBytesToNum(x);
console.log({ result, result2, result3 });

function oldBytesToNum(buf) {
	const ui8 = new Uint8Array(buf);
	const f32 = new Float32Array(ui8.buffer);
	return f32[0];
}

function newBytesToNum(data: number[]) {
	const buf = Buffer.from(data);
	return buf.readFloatLE(0);
}

function bytesToNum(buf) {
	const v3 = buf[3];
	const v2 = buf[2];
	const v1 = buf[1];
	const v0 = buf[0];
	if (v3 == 0 && v2 == 0 && v1 == 0 && v0 == 0) return 0;

	const sign = (v3 >> 7) * 2 - 1;
	const exponent = ((v3 & 0b01111111) << 1) | ((v2 & 0b10000000) >> 7);
	const mantissa = (0b1 << 23) | ((v2 & 0b01111111) << 16) | (v1 << 8) | v0;
	const result = -sign * 2 ** (exponent - 127) * (mantissa / 2 ** 23);
	return result;
}
