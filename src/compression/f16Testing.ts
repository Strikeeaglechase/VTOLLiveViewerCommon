import fs from "fs";

import { Float16Array } from "@petamoriken/float16";

import { roundToFloat16Bits } from "./f16Converter.js";

const f16Buffer = Buffer.alloc(2);
const f16View = new Float16Array(f16Buffer.buffer);
const f16ByteView = new Uint8Array(f16Buffer.buffer);

const f16 = new Float16Array(1);
const i16Ui8Arr = new Uint8Array(f16.buffer);
function libraryF16Pl(num: number) {
	f16[0] = num;
	return Math.abs(f16[0] - num);
}

function libraryNumToF16Bytes(num: number) {
	f16[0] = num;

	return i16Ui8Arr;
}

function libraryF16BytesToNum(lowerByte: number, upperByte: number): number {
	f16ByteView[0] = lowerByte;
	f16ByteView[1] = upperByte;

	return f16View[0];
}

function numToF16(num: number): [number, number] {
	const bits = roundToFloat16Bits(num);
	return [
		bits & 0x00ff, // Lower byte
		(bits >> 8) & 0x00ff // Upper byte
	];
}

for (let i = 0; i < 100000; i++) {
	const n = Math.random() * 1000 - 500; // Random number between -500 and 500
	const [lowerByte, upperByte] = numToF16(n);
	const testResult = libraryF16BytesToNum(lowerByte, upperByte);

	const libBytes = libraryNumToF16Bytes(n);
	const libResult = libraryF16BytesToNum(libBytes[0], libBytes[1]);

	const expectedPl = libraryF16Pl(n);
	const libPl = Math.abs(libResult - n);
	const actualPl = Math.abs(testResult - n);

	// console.log(`Input: ${n.toFixed(4)}, Expected PL: ${expectedPl.toFixed(4)}, Lib PL: ${libPl.toFixed(4)}, Actual PL: ${actualPl.toFixed(4)}`);
	if (actualPl > expectedPl) {
		console.error(`Mismatch: Original ${n}, F16 ${testResult}, Expected PL ${expectedPl}, Actual PL ${actualPl}`);
	}
}

/*
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
// console.log({ result, result2, result3 });

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

*/
