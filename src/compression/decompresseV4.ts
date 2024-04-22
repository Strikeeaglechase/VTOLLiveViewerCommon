import { RPCPacket } from "../rpc.js";
import { ArgumentType, bitCheck, Index, PacketFlags } from "./compress.js";
import { debug_decompress } from "./vtcompression.js";

try {
	const x = Buffer.from("");
} catch (e) {
	console.warn("Buffer not defined, using global Buffer");
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	window.Buffer = buffer.Buffer;
}

function exactBytesToNum(buf: Buffer, index: Index) {
	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 8));
	const f64 = new Float64Array(ui8.buffer);
	index.increment(8);
	return f64[0];
}

function decompressInt(readOne: () => number) {
	let result = 0;
	let index = 0;
	while (index < 50) {
		const next = readOne();
		const bits = next & 0b01111111;
		result = result + (bits << (7 * index));
		if ((next & 0b10000000) == 0) break;
		index++;
	}

	return result;
}

// function _bytesToNum(buf: Buffer, index: Index) {
// 	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 4));
// 	const f32 = new Float32Array(ui8.buffer);
// 	index.increment(4);
// 	return f32[0];
// }

function bytesToNum(buf: Buffer, index: Index) {
	index.increment(4);
	return buf.readFloatLE(index.idx - 4);
}

// function __bytesToNum(buf: Buffer, index: Index) {
// 	// const idx = index.idx;
// 	index.increment(4);

// 	// if (buf[index.idx - 4] == 0 && buf[index.idx - 3] == 0 && buf[index.idx - 2] == 0 && buf[index.idx - 1] == 0) return 0;
// 	const sign = (buf[index.idx - 1] >> 7) * 2 - 1;
// 	const exponent = ((buf[index.idx - 1] & 0b01111111) << 1) | ((buf[index.idx - 2] & 0b10000000) >> 7);
// 	const mantissa = (0b1 << 23) | ((buf[index.idx - 2] & 0b01111111) << 16) | (buf[index.idx - 3] << 8) | buf[index.idx - 4];
// 	const result = -sign * 2 ** (exponent - 127) * (mantissa / 2 ** 23);
// 	return result;
// }

function decompressArgs(values: Buffer, index: Index, length: number) {
	// if (debug_decompress) console.log(` - Arg data: ${values.join(" ")}`);
	const result: unknown[] = [];
	// let i = 0;
	const endPoint = index.idx + length;
	while (index.idx < endPoint) {
		const type = values[index.plusplus];
		switch (type) {
			case ArgumentType.String: {
				const len = values[index.plusplus];
				const str = values.subarray(index.idx, index.idx + len).toString("ascii");
				index.increment(len);
				result.push(str);
				// if (debug_decompress) console.log(`  - Arg(${i - len}): String(${len})  ${str}`);
				break;
			}
			case ArgumentType.Number: {
				const num = bytesToNum(values, index);
				result.push(num);
				// if (debug_decompress) console.log(`  - Arg(${i - 4}): Number(4)  ${num}`);
				break;
			}
			case ArgumentType.Boolean: {
				const bool = values[index.plusplus] === 1;
				result.push(bool);
				// if (debug_decompress) console.log(`  - Arg(${i - 1}): Boolean(1)  ${bool}`);
				break;
			}
			case ArgumentType.Null: {
				result.push(null);
				// if (debug_decompress) console.log(`  - Arg(${i - 1}): Null`);
				break;
			}
			case ArgumentType.Vector: {
				const x = bytesToNum(values, index);
				const y = bytesToNum(values, index);
				const z = bytesToNum(values, index);
				result.push({ x, y, z });
				// if (debug_decompress) console.log(`  - Arg(${i - 4 * 3}): Vector(12)  ${x}, ${y}, ${z}`);
				break;
			}
			default:
				throw new Error(`Unknown argument type ${type}`);
			// console.error(`Unknown argument type ${type}`);
			// break;
		}
	}
	return result;
}

export function decompressRpcPacketsV4(data: number[] | Buffer) {
	if (data.length == 0) return [];
	const index = new Index();

	const bytes = data instanceof Buffer ? data : Buffer.from(data);
	function readOne() {
		return bytes[index.plusplus];
	}

	const version = readOne();
	if (debug_decompress) console.log(`Version: ${version}`);

	const numStrs = decompressInt(readOne);
	if (debug_decompress) console.log(`Str count: ${numStrs}`);
	const strings: string[] = [];
	const getStrFromIdx = () => strings[decompressInt(readOne)];
	for (let i = 0; i < numStrs; i++) {
		const strLen = readOne();
		let str = "";
		for (let j = 0; j < strLen; j++) {
			str += String.fromCharCode(readOne());
		}
		// const str = Buffer.from(read(strLen)).toString("ascii");
		strings.push(str);
		if (debug_decompress) console.log(` #${i} - ${str}`);
	}

	// Get timestamp offset
	const timestampOffset = exactBytesToNum(bytes, index);

	if (debug_decompress) console.log(`Timestamp offset: ${timestampOffset}`);

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = version == -1 ? decompressInt(readOne) : exactBytesToNum(bytes, index);
	const rpcPackets: RPCPacket[] = [];
	if (debug_decompress) console.log(`RPC Count: ${numRpcPackets}`);
	for (let i = 0; i < numRpcPackets; i++) {
		const className = getStrFromIdx();
		const methodName = getStrFromIdx();
		const packetFlags = readOne();

		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);

		if (debug_decompress) {
			console.log(`RPC #${i} at ${index}`);
			console.log(` - Class: ${className}`);
			console.log(` - Method: ${methodName}`);
			console.log(` - idIsNum: ${idIsNum}`);
			console.log(` - hasId: ${hasId}`);
			console.log(` - hasTimestamp: ${hasTimestamp}`);
		}

		// const idIdx = bitCheck(packetFlags, PacketFlags.HasId) ? readOne() : undefined;
		let id: string | undefined = undefined;
		if (hasId) {
			if (idIsNum) {
				id = decompressInt(readOne).toString();
			} else {
				id = getStrFromIdx();
			}
		}
		if (debug_decompress) console.log(` - ID: ${id}`);

		let timestamp: number | undefined = undefined;
		if (hasTimestamp) timestamp = decompressInt(readOne) + timestampOffset;
		if (debug_decompress) console.log(` - Timestamp: ${timestamp}`);

		const argLen = decompressInt(readOne);
		if (debug_decompress) console.log(` - Arg len: ${argLen}`);
		let args: unknown[];
		if (bitCheck(packetFlags, PacketFlags.BinBody)) {
			args = decompressArgs(bytes, index, argLen); // read(argLen)
		} else {
			let argStr = "";
			for (let j = 0; j < argLen; j++) {
				argStr += String.fromCharCode(readOne());
			}
			// const argStr = Buffer.from(read(argLen)).toString("ascii");
			if (debug_decompress) console.log(` - Arg str: ${argStr}`);
			args = JSON.parse(argStr);
		}

		rpcPackets.push({
			className: className,
			method: methodName,
			id: id,
			timestamp: timestamp,
			args: args
		});
	}

	return rpcPackets;
}

export function* decompressRpcPacketsV4Gen(data: number[] | Buffer) {
	if (data.length == 0) return [];

	const index = new Index();

	const bytes = data instanceof Buffer ? data : Buffer.from(data);
	function readOne() {
		return bytes[index.plusplus];
	}

	const version = readOne();
	if (debug_decompress) console.log(`Version: ${version}`);

	const numStrs = decompressInt(readOne);
	if (debug_decompress) console.log(`Str count: ${numStrs}`);
	const strings: string[] = [];
	const getStrFromIdx = () => strings[decompressInt(readOne)];
	for (let i = 0; i < numStrs; i++) {
		const strLen = readOne();
		let str = "";
		for (let j = 0; j < strLen; j++) {
			str += String.fromCharCode(readOne());
		}
		// const str = Buffer.from(read(strLen)).toString("ascii");
		strings.push(str);
		if (debug_decompress) console.log(` #${i} - ${str}`);
	}

	// Get timestamp offset
	const timestampOffset = exactBytesToNum(bytes, index);

	if (debug_decompress) console.log(`Timestamp offset: ${timestampOffset}`);

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = version == -1 ? decompressInt(readOne) : exactBytesToNum(bytes, index);

	if (debug_decompress) console.log(`RPC Count: ${numRpcPackets}`);
	for (let i = 0; i < numRpcPackets; i++) {
		const className = getStrFromIdx();
		const methodName = getStrFromIdx();
		const packetFlags = readOne();

		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);

		if (debug_decompress) {
			console.log(`RPC #${i} at ${index}`);
			console.log(` - Class: ${className}`);
			console.log(` - Method: ${methodName}`);
			console.log(` - idIsNum: ${idIsNum}`);
			console.log(` - hasId: ${hasId}`);
			console.log(` - hasTimestamp: ${hasTimestamp}`);
		}

		// const idIdx = bitCheck(packetFlags, PacketFlags.HasId) ? readOne() : undefined;
		let id: string | undefined = undefined;
		if (hasId) {
			if (idIsNum) {
				id = decompressInt(readOne).toString();
			} else {
				id = getStrFromIdx();
			}
		}
		if (debug_decompress) console.log(` - ID: ${id}`);

		let timestamp: number | undefined = undefined;
		if (hasTimestamp) timestamp = decompressInt(readOne) + timestampOffset;
		if (debug_decompress) console.log(` - Timestamp: ${timestamp}`);

		const argLen = decompressInt(readOne);
		if (debug_decompress) console.log(` - Arg len: ${argLen}`);
		let args: unknown[] = [];
		if (bitCheck(packetFlags, PacketFlags.BinBody)) {
			args = decompressArgs(bytes, index, argLen); // read(argLen)
		} else {
			let argStr = "";
			for (let j = 0; j < argLen; j++) {
				argStr += String.fromCharCode(readOne());
			}
			// const argStr = Buffer.from(read(argLen)).toString("ascii");
			if (debug_decompress) console.log(` - Arg str: ${argStr}`);
			args = JSON.parse(argStr);
		}

		const packet: RPCPacket = {
			className: className,
			method: methodName,
			id: id,
			timestamp: timestamp,
			args: args
		};

		yield packet;
	}
}
