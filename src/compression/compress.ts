import { RPCPacket } from "../rpc.js";
import { debug_compress, debug_packet_structure } from "./vtcompression.js";

export const VERSION = 4;
class Index {
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

	toString() {
		return this.value.toString();
	}
}

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

const bitCheck = (value: number, bit: number) => (value & bit) === bit;
const isNum = (num?: string | number) => {
	if (typeof num == "number") return true;
	if (num == undefined || num === null) return false;

	const numAsNum = +num;
	return numAsNum < 2 ** maxBitsPerInt && numAsNum.toString() == num;
};

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

const f32 = new Float32Array(1);
const f32Ui8Arr = new Uint8Array(f32.buffer);
function numToBytes(num: number) {
	f32[0] = num;

	if (Math.abs(f32[0] - num) > 0.1) {
		console.log(`numToBytes called with ${num}, which resulted in a large precision loss: ${f32[0]} (delta: ${f32[0] - num})`);
		throw new Error(`numToBytes called with ${num}, which resulted in a large precision loss: ${f32[0]} (delta: ${f32[0] - num})`);
	}

	return f32Ui8Arr;
}

const i32 = new Float64Array(1);
const i32Ui8Arr = new Uint8Array(i32.buffer);
function exactNumToBytes(num: number) {
	i32[0] = num;
	return i32Ui8Arr;
}

const maxBitsPerInt = 7 + 7 + 7; // 3 bytes with a flag bit each

// eslint-disable-next-line @typescript-eslint/no-empty-function
function compressArgs(args: unknown[]) {
	const result: number[] = [];
	args.forEach(arg => {
		if (typeof arg == "string") {
			const strArg = filterAsciiStr(arg);
			result.push(ArgumentType.String, strArg.length);
			result.append(strArg.split("").map(c => c.charCodeAt(0)));
		} else if (typeof arg == "number") {
			result.push(ArgumentType.Number);
			result.append(numToBytes(arg));
		} else if (typeof arg == "boolean") {
			result.push(ArgumentType.Boolean, arg ? 1 : 0);
		} else if (arg === null) {
			result.push(ArgumentType.Null);
		} else if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) {
			const a = arg as { x: number; y: number; z: number };
			result.push(ArgumentType.Vector);
			result.append(numToBytes(a.x)).append(numToBytes(a.y)).append(numToBytes(a.z));
		}
	});

	return result;
}

declare global {
	interface Array<T> {
		append(items: ArrayLike<T>): this;
	}
}

Array.prototype.append = function <T>(this: T[], items: ArrayLike<T>): T[] {
	for (let i = 0; i < items.length; i++) this.push(items[i]);

	return this;
};

function compressRpcPackets(rpcPackets: RPCPacket[], includeTimestamps: boolean) {
	if (rpcPackets.length == 0) {
		console.log(`compressRpcPackets called with 0 packets`);
		return [];
	}

	const result: number[] = [];

	function compressIntAndPush(num: number) {
		let first = true;
		if (num == 0) {
			result.push(0);
			return;
		}

		while (num > 0) {
			if (!first) result[result.length - 1] |= 0b10000000;
			first = false;
			result.push(num & 0b01111111);
			num >>= 7;
		}
	}

	if (includeTimestamps && rpcPackets[0].timestamp == undefined) {
		console.warn(`compressRpcPackets called with includeTimestamps = true, but first packet has no timestamp`);
	}

	if (rpcPackets[0].timestamp != undefined && includeTimestamps) {
		if (!rpcPackets.every(p => p.timestamp != undefined)) {
			console.log(JSON.stringify(rpcPackets));
			throw new Error("All packets must have a timestamp if any do");
		} else {
			rpcPackets = rpcPackets.sort((a, b) => a.timestamp! - b.timestamp!);
		}
	}

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
	const stringsMap: Record<string, number> = {};
	const pushStrIdx = (str: string) => {
		const idx = stringsMap[str];
		if (idx < 2 ** 7) result.push(idx);
		else compressIntAndPush(stringsMap[str]);
	};

	strings.forEach((str, idx) => {
		stringsMap[str] = idx;
	});

	compressIntAndPush(strings.length);

	strings.forEach(string => {
		const str = filterAsciiStr(string);
		result.push(str.length);
		result.append(str.split("").map(c => c.charCodeAt(0)));
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

	result.append(exactNumToBytes(timestampOffset));

	// Add rpc packets
	// RPC Packet format: {classNameIdx} {methodNameIdx} {PacketFlags} {idIdx} {arglen} [arg str]
	result.append(exactNumToBytes(rpcPackets.length));
	rpcPackets.forEach(packet => {
		const argCompress = allArgsCanCompress(packet.args);
		const idIsNum = isNum(packet.id);
		const packetFlags =
			(packet.id ? PacketFlags.HasId : PacketFlags.NoId) |
			(argCompress ? PacketFlags.BinBody : PacketFlags.JSONBody) |
			(idIsNum ? PacketFlags.IdIsNumber : PacketFlags.IdIsString) |
			(packet.timestamp != undefined && includeTimestamps ? PacketFlags.HasTimestamp : 0);

		pushStrIdx(packet.className.toString());
		pushStrIdx(packet.method.toString());

		result.push(packetFlags);

		if (packet.id) {
			if (idIsNum) compressIntAndPush(parseInt(packet.id.toString()));
			else pushStrIdx(packet.id.toString());
		}

		if (packet.timestamp != undefined && includeTimestamps) {
			compressIntAndPush(packet.timestamp - timestampOffset);
		}

		if (argCompress) {
			const args = compressArgs(packet.args);
			if (args.length > 2 ** 16) throw new Error(`Binary Arguments too long (${args.length})`);
			compressIntAndPush(args.length);
			result.append(args);
		} else {
			const argStr = filterAsciiStr(JSON.stringify(packet.args));
			if (argStr.length > 2 ** 16) throw new Error(`JSON Argument string too long (${argStr.length})`);
			compressIntAndPush(argStr.length);
			result.append(argStr.split("").map(c => c.charCodeAt(0)));
		}
	});

	return result;
}

export { compressRpcPackets, Index, PacketFlags, ArgumentType, bitCheck };
