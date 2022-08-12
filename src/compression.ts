// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

const VERSION = 1;
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

function compressArgs(args: unknown[]) {
	const result: number[] = [];
	args.forEach(arg => {
		if (typeof arg == "string") {
			result.push(ArgumentType.String, arg.length);
			result.push(...arg.split('').map(c => c.charCodeAt(0)));
		} else if (typeof arg == "number") {
			result.push(ArgumentType.Number, ...numToBytes(arg));
		} else if (typeof arg == "boolean") {
			result.push(ArgumentType.Boolean, arg ? 1 : 0);
		} else if (arg === null) {
			result.push(ArgumentType.Null);
		} else if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) {
			const a = arg as { x: number, y: number, z: number; };
			result.push(ArgumentType.Vector, ...numToBytes(a.x), ...numToBytes(a.y), ...numToBytes(a.z));
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
		if (packet.timestamp) result.push(...exactNumToBytes(packet.timestamp));

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

function decompressRpcPackets(bytes: number[]) {
	let idx = 0;

	function read(amt = 1) {
		const result = bytes.slice(idx, idx + amt);
		idx += amt;
		return result;
	}

	function readOne() {
		return read(1)[0];
	}

	const version = readOne();
	if (version != VERSION) throw new Error(`Invalid version for decompress, expected ${VERSION}, got ${version}`);

	const numStrs = decompressInt(readOne);
	if (debug_decompress) console.log(`Packet has ${numStrs} strings`);
	const strings = [];
	for (let i = 0; i < numStrs; i++) {
		const strLen = readOne();
		const str = read(strLen).map(c => String.fromCharCode(c)).join('');
		strings.push(str);
	}
	if (debug_decompress) console.log(`Packet strings: ${strings.join(', ')}`);

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = exactBytesToNum(read(8));
	const rpcPackets: RPCPacket[] = [];
	if (debug_decompress) console.log(`Packet has ${numRpcPackets} rpc packets`);
	for (let i = 0; i < numRpcPackets; i++) {
		const classNameIdx = readOne();
		const methodNameIdx = readOne();
		const packetFlags = readOne();

		if (debug_decompress) console.log(`Reading packet ${i}: ${strings[classNameIdx]} ${strings[methodNameIdx]} HasID: ${bitCheck(packetFlags, PacketFlags.HasId)} HasBinBody: ${bitCheck(packetFlags, PacketFlags.BinBody)}`);

		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);

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

export { compressRpcPackets, decompressRpcPackets };