import { RPCPacket } from "../rpc.js";
import { convertToNumber, roundToFloat16Bits } from "./f16Converter.js";
import { doesF16Exist, loadPolyfills } from "./pollyfillLoader.js";

loadPolyfills();

const VERSION = 5;
const vectorAllowedPrecisionLoss = 0.01; // The maximum allowed precision loss for vectors to be compressed as half floats

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
	HasId = 0b00000001,
	JSONBody = 0b00000010,
	IdIsNumber = 0b00000100,
	HasTimestamp = 0b00001000,
	ShortStringIndexMode = 0b00010000
}

enum ArgumentType {
	ShortString, // Any ascii string, up to length 255
	String, // Any ascii string, unlimited length
	Byte, // 8 bit positive int
	NegativeByte, // 8 bit negative int
	Short, // 16 bit positive int
	NegativeShort, // 16 bit negative int
	Int, // 32 bit positive int
	NegativeInt, // 32 bit negative int
	Float, // 32 bit float
	Double, // 64 bit float
	True, // Literal true
	False, // Literal false
	Null, // Literal null
	Vector, // Vector3, 3 floats
	ZeroVector, // Vector3 with all components 0
	HalfVector, // Vector3, 3 half floats
	FlaggedVector // A vector with bit flags
}

const lastArgType = ArgumentType.FlaggedVector as number; // We'll use the rest of the range above this value for dynamic arg mapping
const allowedNumDynamicArgs = 2 ** 8 - lastArgType - 1;
// const lowerHalfDynamicArgEnd = 2 ** 8 - lastArgType - 1; // The last dynamic arg that can be represented with a single byte

const bitCheck = (value: number, bit: number) => (value & bit) === bit;
const isNum = (num?: string | number) => {
	if (typeof num == "number") return true;
	if (num == undefined || num === null) return false;

	const numAsNum = +num;
	return numAsNum.toString() == num;
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const f16 = doesF16Exist() ? new Float16Array(1) : null;
const i16Ui8Arr = f16 ? new Uint8Array(f16.buffer) : null;
function f16PrecisionLoss(num: number) {
	if (f16) {
		f16[0] = num;
		return Math.abs(f16[0] - num);
	} else {
		return Math.abs(convertToNumber(roundToFloat16Bits(num)) - num);
	}
}

function f16ToBytes(num: number) {
	if (f16) {
		f16[0] = num;

		if (Math.abs(f16[0] - num) > 0.1) {
			console.log(`f16ToBytes called with ${num}, which resulted in a large precision loss: ${f16[0]} (delta: ${f16[0] - num})`);
			throw new Error(`f16ToBytes called with ${num}, which resulted in a large precision loss: ${f16[0]} (delta: ${f16[0] - num})`);
		}

		return i16Ui8Arr;
	} else {
		const bits = roundToFloat16Bits(num);
		return [
			bits & 0x00ff, // Lower byte
			(bits >> 8) & 0x00ff // Upper byte
		];
	}
}

const f32 = new Float32Array(1);
const f32Ui8Arr = new Uint8Array(f32.buffer);
function f32ToBytes(num: number) {
	f32[0] = num;

	if (Math.abs(f32[0] - num) > 0.1) {
		console.log(`numToBytes called with ${num}, which resulted in a large precision loss: ${f32[0]} (delta: ${f32[0] - num})`);
		throw new Error(`numToBytes called with ${num}, which resulted in a large precision loss: ${f32[0]} (delta: ${f32[0] - num})`);
	}

	return f32Ui8Arr;
}

const f64 = new Float64Array(1);
const i64Ui8Arr = new Uint8Array(f64.buffer);
function f64ToBytes(num: number) {
	f64[0] = num;
	return i64Ui8Arr;
}

const i32 = new Int32Array(1);
const i32Ui8Arr = new Uint8Array(i32.buffer);
function i32ToBytes(num: number) {
	i32[0] = num;

	if (i32[0] != num) {
		console.log(`i32ToBytes called with ${num}, which resulted in a large precision loss: ${i32[0]} (delta: ${i32[0] - num})`);
		throw new Error(`i32ToBytes called with ${num}, which resulted in a large precision loss: ${i32[0]} (delta: ${i32[0] - num})`);
	}

	return i32Ui8Arr;
}

function compressString(str: string, result: number[]) {
	str = filterAsciiStr(str);

	const compressInt = getIntCompressor(result);
	if (str.length > 255) {
		result.push(ArgumentType.String);
		compressInt(str.length);
		result.append(str.split("").map(c => c.charCodeAt(0)));
	} else {
		result.push(ArgumentType.ShortString, str.length);
		result.append(str.split("").map(c => c.charCodeAt(0)));
	}
}

function compressNumber(num: number, result: number[]) {
	if (Math.floor(num) != num) {
		result.push(ArgumentType.Float);
		result.append(f32ToBytes(num));
		return;
	}

	const negative = num < 0;
	num = Math.abs(num);

	if (num < 2 ** 8) {
		result.push(negative ? ArgumentType.NegativeByte : ArgumentType.Byte, num);
		return;
	}

	if (num < 2 ** 16) {
		result.push(negative ? ArgumentType.NegativeShort : ArgumentType.Short, num & 0xffff, (num >> 8) & 0xff);
		return;
	}

	if (num < 2 ** 32) {
		result.push(negative ? ArgumentType.NegativeInt : ArgumentType.Int);
		result.append(i32ToBytes(num));
		return;
	}

	result.push(ArgumentType.Double);
	result.append(f64ToBytes(num));
}

function compressFlaggedVector(arg: { x: number; y: number; z: number }, result: number[]) {
	if (arg.x === 0 && arg.y === 0 && arg.z === 0) {
		result.push(ArgumentType.ZeroVector);
		return;
	}

	const xPl = f16PrecisionLoss(arg.x);
	const yPl = f16PrecisionLoss(arg.y);
	const zPl = f16PrecisionLoss(arg.z);
	const canAllBeFloat16 = xPl < vectorAllowedPrecisionLoss && yPl < vectorAllowedPrecisionLoss && zPl < vectorAllowedPrecisionLoss;
	const canAnyBeFloat16 = xPl < vectorAllowedPrecisionLoss || yPl < vectorAllowedPrecisionLoss || zPl < vectorAllowedPrecisionLoss;

	const flagFloat16 = 0b01;
	const flagZero = 0b10;

	const pls = [xPl, yPl, zPl];
	const components = [arg.x, arg.y, arg.z];

	if (!components.some(c => c === 0)) {
		if (canAllBeFloat16) {
			result.push(ArgumentType.HalfVector);
			result.append(f16ToBytes(arg.x)).append(f16ToBytes(arg.y)).append(f16ToBytes(arg.z));

			return;
		} else if (!canAnyBeFloat16) {
			result.push(ArgumentType.Vector);
			result.append(f32ToBytes(arg.x)).append(f32ToBytes(arg.y)).append(f32ToBytes(arg.z));

			return;
		}
	}

	let flags = 0;

	const flaggedComponents = components.map((comp, idx) => {
		let compFlag = 0;
		const pl = pls[idx];

		if (pl < vectorAllowedPrecisionLoss) compFlag |= flagFloat16;
		if (comp === 0) compFlag |= flagZero;

		flags |= compFlag << (idx * 2);

		return {
			value: comp,
			isFloat16: pl < vectorAllowedPrecisionLoss,
			isZero: comp === 0
		};
	});

	result.push(ArgumentType.FlaggedVector, flags);

	flaggedComponents.forEach(comp => {
		if (comp.isZero) return;
		if (comp.isFloat16) {
			result.append(f16ToBytes(comp.value));
		} else {
			result.append(f32ToBytes(comp.value));
		}
	});
}

function compressArgument(arg: unknown, result: number[]) {
	if (typeof arg == "string") {
		compressString(arg, result);
	} else if (typeof arg == "number") {
		compressNumber(arg, result);
	} else if (typeof arg == "boolean") {
		result.push(arg ? ArgumentType.True : ArgumentType.False);
	} else if (arg === null) {
		result.push(ArgumentType.Null);
	} else if (typeof arg == "object" && "x" in arg && "y" in arg && "z" in arg) {
		// compressVector(arg as { x: number; y: number; z: number }, result);
		compressFlaggedVector(arg as { x: number; y: number; z: number }, result);
	}
}

function compressArgs(packet: PacketWithStrArgs, dynamicArgsMap: Record<string, number>) {
	const result: number[] = [];
	// This will be a set of bit fields that for the dynamic arguments will indicate if it's in the upper or lower half of the dynamic argument range
	packet.args.forEach((arg, idx) => {
		const key = packet.strArgs[idx];
		if (key in dynamicArgsMap) {
			const dynIndex = dynamicArgsMap[key];
			result.push(dynIndex + lastArgType + 1);

			// metrics.dynamicArgHits++;
		} else {
			compressArgument(arg, result);
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

function getIntCompressor(result: number[]) {
	return function compressIntAndPush(num: number) {
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
	};
}

function bhash(value: unknown) {
	if (value === null) return "null";
	if (value === undefined) return "undefined";

	if (typeof value == "object") {
		if ("x" in value && "y" in value && "z" in value) {
			const v = value as { x: number; y: number; z: number };
			return v.x + "-" + v.y + "-" + v.z;
		} else {
			return JSON.stringify(value);
		}
	}

	return typeof value + value?.toString();
}

interface DynamicArg {
	key: string;
	count: number;
	bin: number[];
	value: unknown;
}

function createDynamicArgs(rpcs: PacketWithStrArgs[]) {
	const dynamicArgMap: Record<string, { count: number; bin: number[]; value: unknown }> = {};

	rpcs.forEach(packet => {
		if (!allArgsCanCompress(packet.args)) return;
		packet.strArgs = packet.args.map(bhash);

		packet.args.forEach((arg, idx) => {
			// const key = JSON.stringify(arg);
			const key = packet.strArgs[idx];
			if (dynamicArgMap[key]) {
				dynamicArgMap[key].count++;
			} else {
				// const binRepr: number[] = [];
				// compressArgument(arg, binRepr);
				dynamicArgMap[key] = { count: 1, value: arg, bin: [] };
			}
		});
	});

	const dynamicArgMapArray: DynamicArg[] = Object.entries(dynamicArgMap)
		.map(([key, value]) => ({
			key,
			count: value.count,
			bin: value.bin,
			value: value.value
		}))
		.filter(v => v.count > 1);

	dynamicArgMapArray.sort((a, b) => b.count * b.bin.length - a.count * b.bin.length);

	const argsToInclude: DynamicArg[] = [];
	let i = 0;
	for (; i < dynamicArgMapArray.length && argsToInclude.length < allowedNumDynamicArgs; i++) {
		compressArgument(dynamicArgMapArray[i].value, dynamicArgMapArray[i].bin);

		if (dynamicArgMapArray[i].bin.length > 1) argsToInclude.push(dynamicArgMapArray[i]);
	}

	return argsToInclude;
}

interface PacketWithStrArgs extends RPCPacket {
	strArgs: string[];
}

function compressRpcPackets(rpcPacketsWithoutArgInfo: RPCPacket[], includeTimestamps: boolean) {
	// const rpcPackets = addStrArgsInfo(rpcPacketsWithoutArgInfo);
	const rpcPackets = rpcPacketsWithoutArgInfo as PacketWithStrArgs[];
	if (rpcPackets.length == 0) {
		console.log(`compressRpcPackets called with 0 packets`);
		return [];
	}

	const result: number[] = [];

	const compressIntAndPush = getIntCompressor(result);

	if (includeTimestamps && rpcPackets[0].timestamp == undefined) {
		console.warn(`compressRpcPackets called with includeTimestamps = true, but first packet has no timestamp`);
	}

	if (rpcPackets[0].timestamp != undefined && includeTimestamps) {
		if (!rpcPackets.every(p => p.timestamp != undefined)) {
			console.log(JSON.stringify(rpcPackets));
			throw new Error("All packets must have a timestamp if any do");
		} else {
			rpcPackets.sort((a, b) => a.timestamp! - b.timestamp!);
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
		if (str.length > 2 ** 8) {
			console.error(`String too long (${str.length}): \n - ${str}`);
			throw new Error(`String too long (${str.length})`);
		}

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

	result.append(f64ToBytes(timestampOffset));

	const dynamicArgs = createDynamicArgs(rpcPackets);
	const dynamicArgsMap: Record<string, number> = {};
	dynamicArgs.forEach((arg, idx) => {
		dynamicArgsMap[arg.key] = idx;
	});

	const dynamicArgData = dynamicArgs.map(arg => arg.bin).flat();
	result.push(dynamicArgs.length);
	result.append(dynamicArgData);

	// Add rpc packets
	// RPC Packet format: {classNameIdx} {methodNameIdx} {PacketFlags} {idIdx} {arglen} [arg str]
	result.append(i32ToBytes(rpcPackets.length));
	// let argSize = 0;
	// let argTotal = 0;
	rpcPackets.forEach(packet => {
		try {
			const argCompress = allArgsCanCompress(packet.args);
			const idIsNum = isNum(packet.id);
			const classNameIdx = stringsMap[packet.className.toString()];
			const methodIdx = stringsMap[packet.method.toString()];
			const shortIndexMode = classNameIdx < 16 && methodIdx < 16;

			let packetFlags = 0;

			if (!argCompress) packetFlags |= PacketFlags.JSONBody;
			if (packet.id && idIsNum) packetFlags |= PacketFlags.IdIsNumber;
			if (packet.id) packetFlags |= PacketFlags.HasId;
			if (packet.timestamp != undefined && includeTimestamps) packetFlags |= PacketFlags.HasTimestamp;
			if (shortIndexMode) packetFlags |= PacketFlags.ShortStringIndexMode;

			result.push(packetFlags);

			if (shortIndexMode) {
				const shortStrIdx = (classNameIdx << 4) | methodIdx;
				result.push(shortStrIdx);
			} else {
				pushStrIdx(packet.className.toString());
				pushStrIdx(packet.method.toString());
			}

			if (packet.id) {
				if (idIsNum) {
					compressIntAndPush(parseInt(packet.id.toString()));
				} else {
					pushStrIdx(packet.id.toString());
				}
			}

			if (packet.timestamp != undefined && includeTimestamps) {
				compressIntAndPush(packet.timestamp - timestampOffset);
			}

			if (argCompress) {
				const args = compressArgs(packet, dynamicArgsMap);
				if (args.length > 2 ** 8) throw new Error(`Binary Arguments too long (${args.length})`);
				// compressIntAndPush(args.length);
				result.push(packet.args.length);
				result.append(args);
				// argSize += args.length;
				// argTotal += packet.args.length;
			} else {
				const argStr = filterAsciiStr(JSON.stringify(packet.args));
				if (argStr.length > 2 ** 16) throw new Error(`JSON Argument string too long (${argStr.length})`);
				compressIntAndPush(argStr.length);
				result.append(argStr.split("").map(c => c.charCodeAt(0)));
			}
		} catch (e) {
			console.error(`Error compressing packet ${packet.className}.${packet.method} with id ${packet.id}`, e);
			console.error(`Packet:`, packet);
			console.error(JSON.stringify(packet));
			throw e;
		}
	});

	// metrics.argSize += argSize;
	// metrics.argTotal += argTotal;
	// metrics.rpcsTotal += rpcPackets.length;

	return result;
}

// const metrics = {
// 	argSize: 0,
// 	argTotal: 0,
// 	dynamicArgHits: 0,
// 	rpcsTotal: 0,
// 	oneVec: 0
// };

// export function printMetrics() {
// 	console.log(`Metrics:`);
// 	console.log(` - Total RPCs: ${metrics.rpcsTotal}`);
// 	console.log(` - Total args: ${metrics.argTotal}`);
// 	console.log(` - Total arg size: ${metrics.argSize} bytes`);
// 	console.log(` - Average arg size: ${(metrics.argSize / metrics.argTotal).toFixed(2)} bytes`);
// 	console.log(` - Dynamic arg hits: ${metrics.dynamicArgHits}`);
// 	console.log(` - Dynamic arg hit rate: ${(metrics.dynamicArgHits / metrics.argTotal).toFixed(2)}`);
// 	console.log(` - Average bytes per RPC: ${(metrics.argSize / metrics.rpcsTotal).toFixed(0)} bytes`);
// 	console.log(` - Single component vectors: ${metrics.oneVec}`);
// }

export { compressRpcPackets, Index, bitCheck, VERSION };
