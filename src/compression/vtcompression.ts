// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

const VERSION = 3;
export const debug_decompress = false;
export const debug_compress = false;
import { RPCPacket } from "../rpc.js";
import { decompressRpcPacketsV1 } from "./decompressV1.js";
import { decompressRpcPacketsV2 } from "./decompressV2.js";
import { decompressRpcPacketsV3 } from "./decompressV3.js";

export enum PacketFlags {
	NoId = 0b00000001,
	HasId = 0b00000010,
	JSONBody = 0b00000100,
	BinBody = 0b00001000,
	IdIsNumber = 0b00010000,
	IdIsString = 0b00100000,
	HasTimestamp = 0b01000000,
}

export enum ArgumentType {
	String = 0b00000001,
	Number = 0b00000010,
	Boolean = 0b00000100,
	Null = 0b00001000,
	Vector = 0b00010000,
}

export const bitCheck = (value: number, bit: number) => (value & bit) === bit;
const isNum = (num?: string) => num != undefined && parseInt(num) < 2 ** 16 && num.split("").every(c => !isNaN(parseInt(c)));
const filterAsciiStr = (str: string) => str.split("").filter(c => c.charCodeAt(0) < 256).join("");

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

export function exactBytesToNum(bytes: number[]) {
	const ui8 = new Uint8Array(bytes);
	const i32 = new Float64Array(ui8.buffer);
	return i32[0];
}

// If the number is <128 then store as one byte, otherwise two bytes, highest bit is used for indicating if the number is >127
function compressInt(num: number) {
	if (num > 2 ** 16) {
		console.log(`compressInt called with ${num} which is too large (max: ${2 ** 16})`);
	}
	if (num < 128) {
		return [num];
	} else {
		return [0x80 | (num & 0x7F), num >> 7];
	}
}

export function decompressInt(readOne: () => number) {
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
			const strArg = filterAsciiStr(arg);
			result.push(ArgumentType.String, strArg.length);
			result.push(...strArg.split('').map(c => c.charCodeAt(0)));
			stat("arg header", 2);
			stat("arg string", strArg.length);
			// console.log(`String: ${result.slice(-(arg.length + 2))}`);
		} else if (typeof arg == "number") {
			result.push(ArgumentType.Number, ...numToBytes(arg));
			stat("arg header", 1);
			stat("arg number", 4);
			// console.log(`Number: ${result.slice(-5)}`);
		} else if (typeof arg == "boolean") {
			result.push(ArgumentType.Boolean, arg ? 1 : 0);
			stat("arg header", 1);
			stat("arg bool", 1);
			// console.log(`Bool: ${result.slice(-2)}`);
		} else if (arg === null) {
			result.push(ArgumentType.Null);
			stat("arg header", 1);
			// console.log(`Null: ${result.slice(-1)}`);
		} else if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) {
			const a = arg as { x: number, y: number, z: number; };
			result.push(ArgumentType.Vector, ...numToBytes(a.x), ...numToBytes(a.y), ...numToBytes(a.z));
			stat("arg header", 1);
			stat("arg vector", 4 * 3);
			// console.log(`Vector: ${result.slice(-13)}`);
		}
	});

	return result;
}

export function decompressArgs(values: number[]) {
	if (debug_decompress) console.log(` - Arg data: ${values.join(" ")}`);
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
				if (debug_decompress) console.log(`  - Arg(${i - len}): String(${len})  ${str}`);
				break;
			}
			case ArgumentType.Number: {
				const num = bytesToNum(values.slice(i, i + 4));
				i += 4;
				result.push(num);
				if (debug_decompress) console.log(`  - Arg(${i - 4}): Number(4)  ${num}`);
				break;
			}
			case ArgumentType.Boolean: {
				const bool = values[i++] === 1;
				result.push(bool);
				if (debug_decompress) console.log(`  - Arg(${i - 1}): Boolean(1)  ${bool}`);
				break;
			}
			case ArgumentType.Null: {
				result.push(null);
				if (debug_decompress) console.log(`  - Arg(${i - 1}): Null`);
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
				if (debug_decompress) console.log(`  - Arg(${i - (4 * 3)}): Vector(12)  ${x}, ${y}, ${z}`);
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

function compressRpcPackets(rpcPackets: RPCPacket[], includeTimestamps: boolean) {
	const result: number[] = [];
	const push = (reason: string, ...nums: number[]) => {
		result.push(...nums);
		if (debug_compress) console.log(`${reason}  ${nums.join(" ")}`);

		nums.forEach((num, idx) => {
			if (num < 0 || num > 255) {
				console.log(`Handling ${reason}`);
				console.log(`Values: ${nums.join(" ")}`);
				throw new Error(`Invalid number ${num} at index ${idx}`);
			}
		});
	};


	if (rpcPackets[0].timestamp && includeTimestamps) {
		if (!rpcPackets.every(p => p.timestamp)) {
			console.log(JSON.stringify(rpcPackets));
			throw new Error("All packets must have a timestamp if any do");
		} else {
			rpcPackets = rpcPackets.sort((a, b) => a.timestamp! - b.timestamp!);
		}
	}


	// Format
	// {version} {num strs} {str1len} [str1] {str2len} [str2] ...
	// {num rpc packets} {rpc1 len} [rpc1] {rpc2 len} [rpc2] ...

	push("version", VERSION);

	// Find all strings, store in beginning of packet
	const strs = new Set<string>();
	const strIdx = (str: string) => compressInt(strings.indexOf(str));
	rpcPackets.forEach(packet => {
		strs.add(packet.className.toString());
		strs.add(packet.method.toString());
		if (packet.id && !isNum(packet.id)) strs.add(packet.id);
	});

	const strings = [...strs];
	push("num-strs", ...compressInt(strings.length));

	strings.forEach(string => {
		const str = filterAsciiStr(string);
		push("header-string-len", str.length);
		push("header-string", ...str.split('').map(c => c.charCodeAt(0)));
	});

	if (strings.length > 2 ** 16) throw new Error(`Too many strings (${strings.length})`);

	// Timestamp offset for the packets
	const timestampOffset = rpcPackets[0].timestamp ?? 0;
	if (includeTimestamps) {
		rpcPackets.forEach((packet, idx) => {
			if (packet.timestamp != undefined && packet.timestamp < timestampOffset) {
				console.log(`Packet ${idx} has timestamp ${packet.timestamp} which is less than the offset ${timestampOffset}`);
			}
		});
	}
	push("timestamp-offset", ...exactNumToBytes(timestampOffset));

	// Add rpc packets
	// RPC Packet format: {classNameIdx} {methodNameIdx} {PacketFlags} {idIdx} {arglen} [arg str]
	push("packet-length", ...exactNumToBytes(rpcPackets.length));
	rpcPackets.forEach(packet => {
		const argCompress = allArgsCanCompress(packet.args);
		const idIsNum = isNum(packet.id);
		const packetFlags = (packet.id ? PacketFlags.HasId : PacketFlags.NoId) |
			(argCompress ? PacketFlags.BinBody : PacketFlags.JSONBody) |
			(idIsNum ? PacketFlags.IdIsNumber : PacketFlags.IdIsString) |
			((packet.timestamp && includeTimestamps) ? PacketFlags.HasTimestamp : 0);


		push("class-name", ...strIdx(packet.className.toString()));
		push("method", ...strIdx(packet.method.toString()));

		push("packet-flags", packetFlags);

		// Should this be done in multiple lines, yes, am I going to? No!
		if (packet.id) push("id", ...(idIsNum ? compressInt(parseInt(packet.id)) : strIdx(packet.id)));
		if (packet.timestamp && includeTimestamps) {
			push("packet-timestamp", ...compressInt(packet.timestamp - timestampOffset));
		}

		if (argCompress) {
			const args = compressArgs(packet.args);
			if (args.length > 2 ** 16) throw new Error(`Binary Arguments too long (${args.length})`);
			push("bin-args", ...compressInt(args.length), ...args);
		} else {
			const argStr = filterAsciiStr(JSON.stringify(packet.args));
			if (argStr.length > 2 ** 16) throw new Error(`JSON Argument string too long (${argStr.length})`);
			push("json-args", ...compressInt(argStr.length), ...argStr.split('').map(c => c.charCodeAt(0)));
		}
	});
	return result;
}

/* V2 implementation:
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
*/

type Decompressor = (bytes: number[]) => RPCPacket[];

const decompressVersions: Decompressor[] = [
	// @ts-ignore
	() => { },
	decompressRpcPacketsV1,
	decompressRpcPacketsV2,
	decompressRpcPacketsV3,
];

function decompressRpcPackets(bytes: number[]) {
	if (bytes.length == 0) return [];
	const version = bytes[0];
	if (version < 1 || version >= decompressVersions.length) {
		console.error(`Invalid version for decompress, expected 1-${decompressVersions.length}, got ${version}`);
		console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return [];
	}

	try {
		const decompressor = decompressVersions[version];
		return decompressor(bytes);
	} catch (e) {
		console.error(`Decompression error on packet with ${bytes.length} bytes version ${version}`);
		console.error(e);
		console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return [];
	}
}

export { compressRpcPackets, decompressRpcPackets };