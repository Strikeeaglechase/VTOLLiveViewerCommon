// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

const VERSION = 3;
export const debug_decompress = false;
export const debug_compress = false;
export const debug_packet_structure = false;
import { RPCPacket } from "../rpc.js";
import { decompressRpcPacketsV1 } from "./decompressV1.js";
import { decompressRpcPacketsV2 } from "./decompressV2.js";
import { decompressRpcPacketsV3, decompressRpcPacketsV3Gen } from "./decompressV3.js";

export class Index {
	private value = 0;

	public get idx() {
		return this.value;
	}

	public get plusplus() {
		return this.value++;
	}

	increment(amt = 1) {
		this.value += amt;
	}
}

export enum PacketFlags {
	NoId = 0b00000001,
	HasId = 0b00000010,
	JSONBody = 0b00000100,
	BinBody = 0b00001000,
	IdIsNumber = 0b00010000,
	IdIsString = 0b00100000,
	HasTimestamp = 0b01000000
}

export enum ArgumentType {
	String = 0b00000001,
	Number = 0b00000010,
	Boolean = 0b00000100,
	Null = 0b00001000,
	Vector = 0b00010000
}

export const bitCheck = (value: number, bit: number) => (value & bit) === bit;
const isNum = (num?: string) => num != undefined && parseInt(num) < 2 ** 16 && num.split("").every(c => !isNaN(parseInt(c)));
const filterAsciiStr = (str: string) =>
	str
		.split("")
		.filter(c => c.charCodeAt(0) < 256)
		.join("");

function allArgsCanCompress(args: unknown[]) {
	return args.every(arg => {
		if (typeof arg === "string") return true;
		if (typeof arg === "number") return true;
		if (typeof arg === "boolean") return true;
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

// const f32 = new Float32Array(1);
function bytesToNum(buf: number[] | Buffer, index: Index) {
	// f32.buffer[0] = buf[index.idx + 0];
	// f32.buffer[1] = buf[index.idx + 2];
	// f32.buffer[2] = buf[index.idx + 3];
	// f32.buffer[3] = buf[index.idx + 4];
	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 4));
	const f32 = new Float32Array(ui8.buffer);
	index.increment(4);

	return f32[0];
}

function exactNumToBytes(num: number) {
	const i32 = new Float64Array(1);
	i32[0] = num;
	return new Uint8Array(i32.buffer);
}

// const f64 = new Float64Array(1);
export function exactBytesToNum(buf: number[] | Buffer, index: Index) {
	// f64.buffer[0] = buf[index.idx + 0];
	// f64.buffer[1] = buf[index.idx + 1];
	// f64.buffer[2] = buf[index.idx + 2];
	// f64.buffer[3] = buf[index.idx + 3];
	// f64.buffer[4] = buf[index.idx + 4];
	// f64.buffer[5] = buf[index.idx + 5];
	// f64.buffer[6] = buf[index.idx + 6];
	// f64.buffer[7] = buf[index.idx + 7];
	const ui8 = new Uint8Array(buf.slice(index.idx, index.idx + 8));
	const f64 = new Float64Array(ui8.buffer);
	index.increment(8);
	// console.log(f64);
	return f64[0];
}

// If the number is <128 then store as one byte, otherwise two bytes, highest bit is used for indicating if the number is >127
function compressInt(num: number) {
	if (num > 2 ** 16) {
		console.log(`compressInt called with ${num} which is too large (max: ${2 ** 16})`);
	}
	if (num < 128) {
		return [num];
	} else {
		return [0x80 | (num & 0x7f), num >> 7];
	}
}

export function decompressInt(readOne: () => number) {
	const first = readOne();
	if (first < 128) {
		return first;
	} else {
		const second = readOne();
		return (first & 0x7f) | (second << 7);
	}
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
function compressArgs(args: unknown[], stat: (name: string, len: number) => void = () => {}) {
	const result: number[] = [];
	args.forEach(arg => {
		if (typeof arg == "string") {
			const strArg = filterAsciiStr(arg);
			result.push(ArgumentType.String, strArg.length);
			result.push(...strArg.split("").map(c => c.charCodeAt(0)));
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
			const a = arg as { x: number; y: number; z: number };
			result.push(ArgumentType.Vector, ...numToBytes(a.x), ...numToBytes(a.y), ...numToBytes(a.z));
			stat("arg header", 1);
			stat("arg vector", 4 * 3);
			// console.log(`Vector: ${result.slice(-13)}`);
		}
	});

	return result;
}

export function decompressArgs(values: number[] | Buffer, index: Index, length: number) {
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

function compressRpcPackets(rpcPackets: RPCPacket[], includeTimestamps: boolean) {
	if (rpcPackets.length == 0) {
		console.log(`compressRpcPackets called with 0 packets`);
		return [];
	}

	const result: number[] = [];
	let packetStructureDebug = "";
	const packetStructureDebugAliases: Record<string, string> = {
		"version": "V",
		"num-strs": "S",
		"header-string-len": "L",
		"timestamp-offset": "TS-Off",
		"class-name": "C",
		"method": "M",
		"packet-flags": "F",
		"packet-timestamp": "T",
		"packet-length": "PLen",
		"header-string": "string",
		"id": "I"
	};
	const push = (reason: string, ...nums: number[]) => {
		result.push(...nums);

		// Debug
		if (debug_compress) console.log(`${reason}  ${nums.join(" ")}`);
		if (debug_packet_structure) {
			let reasonName = reason;
			if (reasonName in packetStructureDebugAliases) reasonName = packetStructureDebugAliases[reasonName];

			if (nums.length == 1) packetStructureDebug += reasonName[0];
			else if (nums.length < 3) packetStructureDebug += reasonName.substring(0, nums.length).padEnd(nums.length, "-");
			else {
				// Goal: create a string with length nums.length, surrounded by brackets, with "reason" centered within it
				const allowedName = reasonName.substring(0, nums.length - 2);
				const padLeft = Math.floor((nums.length - 2 - allowedName.length) / 2);
				const padRight = nums.length - 2 - allowedName.length - padLeft;
				packetStructureDebug += "[" + "-".repeat(padLeft) + allowedName + "-".repeat(padRight) + "]";
			}
		}

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
		push("header-string", ...str.split("").map(c => c.charCodeAt(0)));
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
		const packetFlags =
			(packet.id ? PacketFlags.HasId : PacketFlags.NoId) |
			(argCompress ? PacketFlags.BinBody : PacketFlags.JSONBody) |
			(idIsNum ? PacketFlags.IdIsNumber : PacketFlags.IdIsString) |
			(packet.timestamp && includeTimestamps ? PacketFlags.HasTimestamp : 0);

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
			push("json-args", ...compressInt(argStr.length), ...argStr.split("").map(c => c.charCodeAt(0)));
		}
	});

	if (debug_packet_structure) {
		packetStructureDebug += "\n\n";
		for (const key in packetStructureDebugAliases) {
			packetStructureDebug += ` ${packetStructureDebugAliases[key]} -> ${key}\n`;
		}

		console.log(packetStructureDebug);
	}

	return result;
}

type Decompressor = (bytes: number[] | Buffer) => RPCPacket[];
type GenDecompressor = (bytes: number[] | Buffer) => Generator<RPCPacket, void, unknown>;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-empty-function
const decompressVersions: Decompressor[] = [() => {}, decompressRpcPacketsV1, decompressRpcPacketsV2, decompressRpcPacketsV3];

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-empty-function
const decompressGenVersions: GenDecompressor[] = [() => {}, () => {}, () => {}, decompressRpcPacketsV3Gen];

function decompressRpcPackets(bytes: number[] | Buffer) {
	if (bytes.length == 0) return [];
	const version = bytes[0];
	if (version < 1 || version >= decompressVersions.length) {
		console.error(`Invalid version for decompress, expected 1-${decompressVersions.length}, got ${version}`);
		// console.error(`Data:`);
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

function* genEmpty(): Generator<RPCPacket, void, unknown> {
	yield;
}

function decompressRpcPacketsGen(bytes: number[] | Buffer) {
	if (bytes.length == 0) return genEmpty();
	const version = bytes[0];
	if (version < 1 || version >= decompressVersions.length) {
		console.error(`Invalid version for decompress, expected 1-${decompressVersions.length}, got ${version}`);
		// console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return genEmpty();
	}

	try {
		const decompressor = decompressGenVersions[version];
		return decompressor(bytes);
	} catch (e) {
		console.error(`Decompression error on packet with ${bytes.length} bytes version ${version}`);
		console.error(e);
		console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return genEmpty();
	}
}

export { compressRpcPackets, decompressRpcPackets, decompressRpcPacketsGen };
