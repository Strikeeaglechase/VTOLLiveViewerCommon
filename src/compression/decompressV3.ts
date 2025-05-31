import { RPCPacket } from "../rpc.js";
import { bitCheck, Index } from "./compress.js";
import { debug_decompress } from "./vtcompression.js";

enum PacketFlags {
	NoId = 0b00000001,
	HasId = 0b00000010,
	JSONBody = 0b00000100,
	BinBody = 0b00001000,
	IdIsNumber = 0b00010000,
	IdIsString = 0b00100000,
	HasTimestamp = 0b01000000
}

enum ArgumentType {
	String = 0b00000001,
	Number = 0b00000010,
	Boolean = 0b00000100,
	Null = 0b00001000,
	Vector = 0b00010000
}

function exactBytesToNum(buf: number[] | Buffer, index: Index) {
	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 8));
	const f64 = new Float64Array(ui8.buffer);
	index.increment(8);
	return f64[0];
}

function decompressInt(readOne: () => number) {
	const first = readOne();
	if (first < 128) {
		return first;
	} else {
		const second = readOne();
		return (first & 0x7f) | (second << 7);
	}
}

function bytesToNum(buf: number[] | Buffer, index: Index) {
	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 4));
	const f32 = new Float32Array(ui8.buffer);
	index.increment(4);

	return f32[0];
}

function decompressArgs(values: number[] | Buffer, index: Index, length: number) {
	if (debug_decompress) console.log(` - Arg data: ${values.join(" ")}`);
	const result: unknown[] = [];
	// let i = 0;
	const endPoint = index.idx + length;
	while (index.idx < endPoint) {
		const type = values[index.plusplus];
		switch (type) {
			case ArgumentType.String: {
				const len = values[index.plusplus];
				const str = String.fromCharCode(...values.slice(index.idx, index.idx + len));
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

export function decompressRpcPacketsV3(bytes: number[] | Buffer) {
	if (bytes.length == 0) return [];
	const index = new Index();

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

export function* decompressRpcPacketsV3Gen(bytes: number[] | Buffer): Generator<RPCPacket, void, unknown> {
	if (bytes.length == 0) return;
	const index = new Index();

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
