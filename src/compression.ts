// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

const VERSION = 2;
const debug_decompress = false;

import { RPCPacket } from "./rpc.js";

enum PacketFlags {
	NoId = 0b00000001,
	HasId = 0b00000010,
	JSONBody = 0b00000100,
	BinBody = 0b00001000,
	IdIsNumber = 0b00010000,
	IdIsString = 0b00100000,
	HasTimestamp = 0b01000000,
}

enum ArgumentType {
	String = 0b00000001,
	Number = 0b00000010,
	Boolean = 0b00000100,
	Null = 0b00001000,
	Vector = 0b00010000,
}

const bitCheck = (value: number, bit: number) => (value & bit) === bit;
const isNum = (num?: string) => num != undefined && parseInt(num) < 2 ** 16 && num.split("").every(c => !isNaN(parseInt(c)));

function allArgsCanCompress(args: unknown[]) {
	return args.every(arg => {
		if (typeof arg === 'string') return true;
		if (typeof arg === 'number') return true;
		if (typeof arg === 'boolean') return true;
		if (arg === null) return true;
		if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) return true;
		return false;
	});
}

function numToBytes(num: number) {
	const f32 = new Float32Array(1);
	f32[0] = num;
	return new Uint8Array(f32.buffer);
}

function bytesToNum(bytes: number[]) {
	const ui8 = new Uint8Array(bytes);
	const f32 = new Float32Array(ui8.buffer);
	return f32[0];
}

function exactNumToBytes(num: number) {
	const i32 = new Float64Array(1);
	i32[0] = num;
	return new Uint8Array(i32.buffer);
}

function exactBytesToNum(bytes: number[]) {
	const ui8 = new Uint8Array(bytes);
	const i32 = new Float64Array(ui8.buffer);
	return i32[0];
}

// If the number is <128 then store as one byte, otherwise two bytes, highest bit is used for indicating if the number is >127
function compressInt(num: number) {
	if (num < 128) {
		return [num];
	} else {
		return [0x80 | (num & 0x7F), num >> 7];
	}
}

function decompressInt(readOne: () => number) {
	const first = readOne();
	if (first < 128) {
		return first;
	} else {
		const second = readOne();
		return (first & 0x7F) | (second << 7);
	}
}

function compressArgs(args: unknown[], stat: (name: string, len: number) => void = () => { }) {
	const result: number[] = [];
	args.forEach(arg => {
		if (typeof arg == "string") {
			result.push(ArgumentType.String, arg.length);
			result.push(...arg.split('').map(c => c.charCodeAt(0)));
			stat("arg header", 2);
			stat("arg string", arg.length);
		} else if (typeof arg == "number") {
			result.push(ArgumentType.Number, ...numToBytes(arg));
			stat("arg header", 1);
			stat("arg number", 4);
		} else if (typeof arg == "boolean") {
			result.push(ArgumentType.Boolean, arg ? 1 : 0);
			stat("arg header", 1);
			stat("arg bool", 1);
		} else if (arg === null) {
			result.push(ArgumentType.Null);
			stat("arg header", 1);
		} else if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) {
			const a = arg as { x: number, y: number, z: number; };
			result.push(ArgumentType.Vector, ...numToBytes(a.x), ...numToBytes(a.y), ...numToBytes(a.z));
			stat("arg header", 1);
			stat("arg vector", 4 * 3);
		}
	});

	return result;
}

function decompressArgs(values: number[]) {
	const result: unknown[] = [];
	let i = 0;
	while (i < values.length) {
		const type = values[i++];
		switch (type) {
			case ArgumentType.String: {
				const len = values[i++];
				const str = String.fromCharCode(...values.slice(i, i + len));
				i += len;
				result.push(str);
				break;
			}
			case ArgumentType.Number: {
				const num = bytesToNum(values.slice(i, i + 4));
				i += 4;
				result.push(num);
				break;
			}
			case ArgumentType.Boolean: {
				const bool = values[i++] === 1;
				result.push(bool);
				break;
			}
			case ArgumentType.Null: {
				result.push(null);
				break;
			}
			case ArgumentType.Vector: {
				const x = bytesToNum(values.slice(i, i + 4));
				i += 4;
				const y = bytesToNum(values.slice(i, i + 4));
				i += 4;
				const z = bytesToNum(values.slice(i, i + 4));
				i += 4;
				result.push({ x, y, z });
				break;
			}
			default:
				throw new Error(`Unknown argument type ${type}`);
		}
	}
	return result;
}


function compressRpcPackets(rpcPackets: RPCPacket[]) {
	const result: number[] = [];
	// Format
	// {version} {num strs} {str1len} [str1] {str2len} [str2] ...
	// {num rpc packets} {rpc1 len} [rpc1] {rpc2 len} [rpc2] ...

	result.push(VERSION);

	// Find all strings, store in beginning of packet
	const strs = new Set<string>();
	rpcPackets.forEach(packet => {
		strs.add(packet.className.toString());
		strs.add(packet.method.toString());
		if (packet.id && !isNum(packet.id)) strs.add(packet.id);
	});

	const strings = [...strs];
	result.push(...compressInt(strings.length));

	strings.forEach(string => {
		result.push(string.length);
		result.push(...string.split('').map(c => c.charCodeAt(0)));
	});

	if (strings.length > 2 ** 16) throw new Error(`Too many strings (${strings.length})`);

	// Timestamp offset for the packets
	const timestampOffset = rpcPackets[0].timestamp ?? 0;
	result.push(...exactNumToBytes(timestampOffset));

	// Add rpc packets
	// RPC Packet format: {classNameIdx} {methodNameIdx} {PacketFlags} {idIdx} {arglen} [arg str]
	result.push(...exactNumToBytes(rpcPackets.length));
	rpcPackets.forEach(packet => {
		const argCompress = allArgsCanCompress(packet.args);
		const idIsNum = isNum(packet.id);
		const packetFlags = (packet.id ? PacketFlags.HasId : PacketFlags.NoId) |
			(argCompress ? PacketFlags.BinBody : PacketFlags.JSONBody) |
			(idIsNum ? PacketFlags.IdIsNumber : PacketFlags.IdIsString) |
			(packet.timestamp ? PacketFlags.HasTimestamp : 0);

		result.push(strings.indexOf(packet.className.toString()));
		result.push(strings.indexOf(packet.method.toString()));

		result.push(packetFlags);

		// Should this be done in multiple lines, yes, am I going to? No!
		if (packet.id) result.push(...(idIsNum ? compressInt(parseInt(packet.id)) : [strings.indexOf(packet.id)]));
		if (packet.timestamp) {
			result.push(...compressInt(packet.timestamp - timestampOffset));
		}

		if (argCompress) {
			const args = compressArgs(packet.args);
			if (args.length > 2 ** 16) throw new Error(`Binary Arguments too long (${args.length})`);
			result.push(...compressInt(args.length), ...args);
		} else {
			const argStr = JSON.stringify(packet.args);
			if (argStr.length > 2 ** 16) throw new Error(`JSON Argument string too long (${argStr.length})`);
			result.push(...compressInt(argStr.length), ...argStr.split('').map(c => c.charCodeAt(0)));
		}
	});

	return result;
}

function compressRpcPacketsWithStats(rpcPackets: RPCPacket[]) {
	const stats: Record<string, number> = {};
	function stat(name: string, len: number) {
		if (stats[name]) stats[name] += len;
		else stats[name] = len;
	}

	const result: number[] = [];
	// Format
	// {version} {num strs} {str1len} [str1] {str2len} [str2] ...
	// {num rpc packets} {rpc1 len} [rpc1] {rpc2 len} [rpc2] ...

	result.push(VERSION);
	stat('version', 1);

	// Find all strings, store in beginning of packet
	const strs = new Set<string>();
	rpcPackets.forEach(packet => {
		strs.add(packet.className.toString());
		strs.add(packet.method.toString());
		if (packet.id && !isNum(packet.id)) strs.add(packet.id);
	});

	const strings = [...strs];
	const strLenInts = compressInt(strings.length);
	result.push(...strLenInts);
	stat('num strings', strLenInts.length);

	strings.forEach(string => {
		result.push(string.length);
		result.push(...string.split('').map(c => c.charCodeAt(0)));
		stat('string', string.length + 1);
	});

	if (strings.length > 2 ** 16) throw new Error(`Too many strings (${strings.length})`);

	const timestampOffset = rpcPackets[0].timestamp ?? 0;
	result.push(...exactNumToBytes(timestampOffset));
	stat('timestamp offset', 8);

	// Add rpc packets
	// RPC Packet format: {classNameIdx} {methodNameIdx} {PacketFlags} {idIdx} {arglen} [arg str]
	result.push(...exactNumToBytes(rpcPackets.length));
	stat('num packets', 8);
	rpcPackets.forEach(packet => {
		const argCompress = allArgsCanCompress(packet.args);
		const idIsNum = isNum(packet.id);
		const packetFlags = (packet.id ? PacketFlags.HasId : PacketFlags.NoId) |
			(argCompress ? PacketFlags.BinBody : PacketFlags.JSONBody) |
			(idIsNum ? PacketFlags.IdIsNumber : PacketFlags.IdIsString) |
			(packet.timestamp ? PacketFlags.HasTimestamp : 0);

		result.push(strings.indexOf(packet.className.toString()));
		result.push(strings.indexOf(packet.method.toString()));

		result.push(packetFlags);
		stat('packet header', 3);

		// Should this be done in multiple lines, yes, am I going to? No!
		if (packet.id) {
			result.push(...(idIsNum ? compressInt(parseInt(packet.id)) : [strings.indexOf(packet.id)]));
			stat('id', idIsNum ? 2 : 1);
		}
		if (packet.timestamp) {
			const timestampBytes = compressInt(packet.timestamp - timestampOffset);
			// result.push(...exactNumToBytes(packet.timestamp));
			result.push(...timestampBytes);
			stat('timestamp', timestampBytes.length);
		}

		if (argCompress) {
			const args = compressArgs(packet.args, stat);
			if (args.length > 2 ** 16) throw new Error(`Binary Arguments too long (${args.length})`);
			result.push(...compressInt(args.length), ...args);
			// stat('bin args', args.length + 2);
		} else {
			const argStr = JSON.stringify(packet.args);
			if (argStr.length > 2 ** 16) throw new Error(`JSON Argument string too long (${argStr.length})`);
			result.push(...compressInt(argStr.length), ...argStr.split('').map(c => c.charCodeAt(0)));
			stat('json args', argStr.length + 2);
		}
	});

	return { result, stats };
}

function decompressRpcPacketsV1(bytes: number[]) {
	if (bytes.length == 0) return [];
	let idx = 0;

	function read(amt = 1) {
		const result = bytes.slice(idx, idx + amt);
		idx += amt;
		return result;
	}

	function readOne() {
		return read(1)[0];
	}

	function peak() {
		return bytes[idx];
	}

	let version = peak();
	if (debug_decompress) console.log(`Version: ${version}`);
	if (version != VERSION) {
		console.error(`Invalid version for decompress, expected ${VERSION}, got ${version}`);
		// Attempt to parse packet without a version
		version = -1;
	} else {
		readOne(); // Remove version from bytes
	}

	const numStrs = decompressInt(readOne);
	if (debug_decompress) console.log(`Str count: ${numStrs}`);
	const strings = [];
	for (let i = 0; i < numStrs; i++) {
		const strLen = readOne();
		const str = read(strLen).map(c => String.fromCharCode(c)).join('');
		strings.push(str);
		if (debug_decompress) console.log(` #${i} - ${str}`);
	}

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = version == -1 ? decompressInt(readOne) : exactBytesToNum(read(8));
	const rpcPackets: RPCPacket[] = [];
	if (debug_decompress) console.log(`RPC Count: ${numRpcPackets}`);
	for (let i = 0; i < numRpcPackets; i++) {
		const classNameIdx = readOne();
		const methodNameIdx = readOne();
		const packetFlags = readOne();


		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);

		if (debug_decompress) {
			console.log(`RPC #${i}`);
			console.log(` - Class: ${classNameIdx} - ${strings[classNameIdx]}`);
			console.log(` - Method: ${methodNameIdx} - ${strings[methodNameIdx]}`);
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
				id = strings[readOne()];
			}
		}
		if (debug_decompress) console.log(` - ID: ${id}`);

		let timestamp: number | undefined = undefined;
		if (hasTimestamp) timestamp = exactBytesToNum(read(8));
		if (debug_decompress) console.log(` - Timestamp: ${timestamp}`);

		const argLen = decompressInt(readOne);
		if (debug_decompress) console.log(` - Arg len: ${argLen}`);
		let args: unknown[] = [];
		if (bitCheck(packetFlags, PacketFlags.BinBody)) {
			args = decompressArgs(read(argLen));
		} else {
			const argStr = read(argLen).map(c => String.fromCharCode(c)).join('');
			if (debug_decompress) console.log(` - Arg str: ${argStr}`);
			args = JSON.parse(argStr);
		}

		rpcPackets.push({
			className: strings[classNameIdx],
			method: strings[methodNameIdx],
			id: id,
			timestamp: timestamp,
			args: args
		});
	}

	return rpcPackets;
}

function decompressRpcPacketsV2(bytes: number[]) {
	if (bytes.length == 0) return [];
	let idx = 0;

	function read(amt = 1) {
		const result = bytes.slice(idx, idx + amt);
		idx += amt;
		return result;
	}

	function readOne() {
		return read(1)[0];
	}

	function peak() {
		return bytes[idx];
	}

	let version = peak();
	if (debug_decompress) console.log(`Version: ${version}`);
	if (version != VERSION) {
		console.error(`Invalid version for decompress, expected ${VERSION}, got ${version}`);
		// Attempt to parse packet without a version
		version = -1;
	} else {
		readOne(); // Remove version from bytes
	}

	const numStrs = decompressInt(readOne);
	if (debug_decompress) console.log(`Str count: ${numStrs}`);
	const strings = [];
	for (let i = 0; i < numStrs; i++) {
		const strLen = readOne();
		const str = read(strLen).map(c => String.fromCharCode(c)).join('');
		strings.push(str);
		if (debug_decompress) console.log(` #${i} - ${str}`);
	}

	// Get timestamp offset
	const timestampOffset = exactBytesToNum(read(8));
	if (debug_decompress) console.log(`Timestamp offset: ${timestampOffset}`);

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = version == -1 ? decompressInt(readOne) : exactBytesToNum(read(8));
	const rpcPackets: RPCPacket[] = [];
	if (debug_decompress) console.log(`RPC Count: ${numRpcPackets}`);
	for (let i = 0; i < numRpcPackets; i++) {
		const classNameIdx = readOne();
		const methodNameIdx = readOne();
		const packetFlags = readOne();


		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);

		if (debug_decompress) {
			console.log(`RPC #${i}`);
			console.log(` - Class: ${classNameIdx} - ${strings[classNameIdx]}`);
			console.log(` - Method: ${methodNameIdx} - ${strings[methodNameIdx]}`);
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
				id = strings[readOne()];
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
			args = decompressArgs(read(argLen));
		} else {
			const argStr = read(argLen).map(c => String.fromCharCode(c)).join('');
			if (debug_decompress) console.log(` - Arg str: ${argStr}`);
			args = JSON.parse(argStr);
		}

		rpcPackets.push({
			className: strings[classNameIdx],
			method: strings[methodNameIdx],
			id: id,
			timestamp: timestamp,
			args: args
		});
	}

	return rpcPackets;
}

type Decompressor = (bytes: number[]) => RPCPacket[];

const decompressVersions: Decompressor[] = [
	// @ts-ignore
	() => { },
	decompressRpcPacketsV1,
	decompressRpcPacketsV2,
];

function decompressRpcPackets(bytes: number[]) {
	if (bytes.length == 0) return [];
	const version = bytes[0];
	if (version < 1 || version >= decompressVersions.length) {
		console.error(`Invalid version for decompress, expected 1-${decompressVersions.length}, got ${version}`);
		return [];
	}

	const decompressor = decompressVersions[version];
	return decompressor(bytes);
}

export { compressRpcPackets, decompressRpcPackets, compressRpcPacketsWithStats };