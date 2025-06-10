import { Float16Array } from "@petamoriken/float16";

import { RPCPacket } from "../rpc.js";
import { bitCheck } from "./compress.js";
import { convertToNumber } from "./f16Converter.js";
import { doesF16Exist, loadPolyfills } from "./pollyfillLoader.js";
import { debug_decompress } from "./vtcompression.js";

loadPolyfills();

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

class Reader {
	private index = 0;
	private f16Buffer = Buffer.alloc(2);
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	private f16View: Float16Array; //= new Float16Array(this.f16Buffer.buffer);
	private f16ByteView: Uint8Array; // = new Uint8Array(this.f16Buffer.buffer);

	public get idx() {
		return this.index;
	}

	constructor(private buf: Buffer) {
		if (doesF16Exist()) {
			this.f16View = new Float16Array(this.f16Buffer.buffer);
			this.f16ByteView = new Uint8Array(this.f16Buffer.buffer);
		} else {
			// console.log(`No Float16Array available, using custom implementation`);
		}
	}

	public read(length: number) {
		const result = this.buf.subarray(this.index, this.index + length);
		this.index += length;
		return result;
	}

	public readF64() {
		const result = this.buf.readDoubleLE(this.index);
		this.index += 8;
		return result;
	}

	public readF32() {
		const result = this.buf.readFloatLE(this.index);
		this.index += 4;
		return result;
	}

	public readF16() {
		const lowerByte = this.buf.readUInt8(this.index);
		const upperByte = this.buf.readUInt8(this.index + 1);
		this.index += 2;

		if (this.f16ByteView) {
			this.f16ByteView[0] = lowerByte;
			this.f16ByteView[1] = upperByte;

			return this.f16View[0];
		} else {
			const bits = (upperByte << 8) | lowerByte;
			return convertToNumber(bits);
		}
	}

	public readI32() {
		const result = this.buf.readUInt32LE(this.index);
		this.index += 4;
		return result;
	}

	public readI16() {
		const result = this.buf.readUInt16LE(this.index);
		this.index += 2;
		return result;
	}

	public readByte() {
		const result = this.buf.readUInt8(this.index);
		this.index += 1;
		return result;
	}

	public decompressInt() {
		let result = 0;
		let index = 0;
		while (index < 50) {
			const next = this.readByte();
			const bits = next & 0b01111111;
			result = result + (bits << (7 * index));
			if ((next & 0b10000000) == 0) break;
			index++;
		}
		return result;
	}
}

/*
const argStats: Record<string, { count: number; size: number }> = {} as any;
const flaggedVectorStats = {
	total: 0,
	numComponents: 0,
	numFloat16: 0
};

export function printStats() {
	console.log("Argument type stats:");
	let totalBytes = 0;
	for (const stats of Object.values(argStats)) {
		totalBytes += stats.size;
	}

	const results = Object.entries(argStats)
		.map(([type, stats]) => ({ type, stats }))
		.sort((a, b) => b.stats.size - a.stats.size);

	results.forEach(({ type, stats }) => {
		const prec = (stats.size / totalBytes) * 100;
		console.log(` - ${type}: ${stats.count}, ${stats.size} bytes, ${prec.toFixed(2)}%`);
	});

	console.log(`Flagged vector stats:`);
	console.log(` - Total: ${flaggedVectorStats.total}`);
	console.log(` - Average components per vector: ${(flaggedVectorStats.numComponents / flaggedVectorStats.total).toFixed(2)}`);
	console.log(` - Float16 rate: ${((flaggedVectorStats.numFloat16 / flaggedVectorStats.numComponents) * 100).toFixed(2)}%`);
	// console.log(`Zero vector counts: ${propZeroCounts}`);
}
*/

function decompressFlaggedVector(reader: Reader, result: unknown[]) {
	const flagFloat16 = 0b01;
	const flagZero = 0b10;

	const flags = reader.readByte();

	const vector = { x: 0, y: 0, z: 0 };
	const compKeys = ["x", "y", "z"];
	// flaggedVectorStats.total++;
	compKeys.forEach((key, i) => {
		const compFlag = (flags >> (i * 2)) & 0b11;
		const isZero = bitCheck(compFlag, flagZero);
		const isFloat16 = bitCheck(compFlag, flagFloat16);

		if (isZero) return;
		// flaggedVectorStats.numComponents++;
		if (isFloat16) {
			vector[key] = reader.readF16();
			// flaggedVectorStats.numFloat16++;
		} else {
			vector[key] = reader.readF32();
		}
	});

	if (debug_decompress) {
		console.log(`Flagged vector: ${JSON.stringify(vector)} with flags: ${flags.toString(2).padStart(8, "0")}`);
	}

	result.push(vector);
}

function decompressArgument(reader: Reader, result: unknown[], dynamicArgMap: Record<number, unknown> = {}) {
	const start = reader.idx;
	const type = reader.readByte();
	switch (type) {
		case ArgumentType.ShortString: {
			const strLen = reader.readByte();
			const str = reader.read(strLen).toString("ascii");
			result.push(str);
			break;
		}
		case ArgumentType.String: {
			const strLen = reader.decompressInt();
			const str = reader.read(strLen).toString("ascii");
			result.push(str);
			break;
		}
		case ArgumentType.True:
			result.push(true);
			break;
		case ArgumentType.False:
			result.push(false);
			break;
		case ArgumentType.Byte:
			result.push(reader.readByte());
			break;
		case ArgumentType.NegativeByte:
			result.push(-reader.readByte());
			break;
		case ArgumentType.Short:
			result.push(reader.readI16());
			break;
		case ArgumentType.NegativeShort:
			result.push(-reader.readI16());
			break;
		case ArgumentType.Int:
			result.push(reader.readI32());
			break;
		case ArgumentType.NegativeInt:
			result.push(-reader.readI32());
			break;
		case ArgumentType.Float:
			result.push(reader.readF32());
			break;
		case ArgumentType.Double:
			result.push(reader.readF64());
			break;
		case ArgumentType.Null:
			result.push(null);
			break;
		case ArgumentType.Vector: {
			const x = reader.readF32();
			const y = reader.readF32();
			const z = reader.readF32();
			result.push({ x: x, y: y, z: z });
			break;
		}
		case ArgumentType.HalfVector: {
			const x = reader.readF16();
			const y = reader.readF16();
			const z = reader.readF16();
			result.push({ x: x, y: y, z: z });
			break;
		}
		case ArgumentType.ZeroVector:
			result.push({ x: 0, y: 0, z: 0 });
			break;
		// case ArgumentType.PartialVector:
		// 	decompressPartialVector(reader, result, false);
		// 	break;
		// case ArgumentType.PartialHalfVector:
		// 	decompressPartialVector(reader, result, true);
		// 	break;
		case ArgumentType.FlaggedVector: {
			decompressFlaggedVector(reader, result);
			break;
		}
		default:
			if (type in dynamicArgMap) {
				result.push(dynamicArgMap[type]);
				break;
			}

			throw new Error(`Unknown argument type ${type}`);
	}

	// const typeKey = ArgumentType[type] ? ArgumentType[type] : "DynArg";
	// if (!argStats[typeKey]) argStats[typeKey] = { count: 0, size: 0 };
	// argStats[typeKey].count++;
	// argStats[typeKey].size += reader.idx - start;
}

export function decompressRpcPacketsV5(bytes: Buffer) {
	const packets: RPCPacket[] = [];
	for (const packet of decompressRpcPacketsV5Gen(bytes)) {
		packets.push(packet);
	}

	return packets;
}

export function* decompressRpcPacketsV5Gen(bytes: Buffer): Generator<RPCPacket, void, unknown> {
	if (bytes.length == 0) return;

	const reader = new Reader(bytes);

	const version = reader.readByte();
	if (debug_decompress) console.log(`Version: ${version}`);

	const numStrs = reader.decompressInt();
	if (debug_decompress) console.log(`Str count: ${numStrs}`);
	const strings: string[] = [];
	const getStrFromIdx = () => strings[reader.decompressInt()];
	for (let i = 0; i < numStrs; i++) {
		const strLen = reader.readByte();
		let str = "";
		for (let j = 0; j < strLen; j++) {
			str += String.fromCharCode(reader.readByte());
		}

		strings.push(str);
		if (debug_decompress) console.log(` #${i} - ${str}`);
	}

	// Get timestamp offset
	const timestampOffset = reader.readF64();

	const dynamicArgCount = reader.readByte();
	if (debug_decompress) console.log(`Dynamic arg count: ${dynamicArgCount}`);
	const dynamicArgs: Record<number, unknown> = {};
	for (let i = 0; i < dynamicArgCount; i++) {
		const argResult: unknown[] = [];
		decompressArgument(reader, argResult);
		const argIdx = i + lastArgType + 1; // Start after the last static argument type
		dynamicArgs[argIdx] = argResult[0];
	}

	if (debug_decompress) console.log(`Timestamp offset: ${timestampOffset}`);

	// RPC Packet format: {classNameIdx} {methodNameIdx} {hasId} {idIdx} {arglen} [arg str]
	// Read rpc packets
	const numRpcPackets = reader.readI32();
	if (debug_decompress) console.log(`RPC Count: ${numRpcPackets}`);
	for (let i = 0; i < numRpcPackets; i++) {
		const packetFlags = reader.readByte();
		const idIsNum = bitCheck(packetFlags, PacketFlags.IdIsNumber);
		const hasId = bitCheck(packetFlags, PacketFlags.HasId);
		const hasTimestamp = bitCheck(packetFlags, PacketFlags.HasTimestamp);
		const shortIndexMode = bitCheck(packetFlags, PacketFlags.ShortStringIndexMode);
		const isJsonBody = bitCheck(packetFlags, PacketFlags.JSONBody);

		let className: string;
		let methodName: string;

		if (shortIndexMode) {
			const indexByte = reader.readByte();
			const classNameIdx = (indexByte & 0b11110000) >> 4;
			const methodNameIdx = indexByte & 0b00001111;

			className = strings[classNameIdx];
			methodName = strings[methodNameIdx];

			if (className == undefined) {
				throw new Error(`Class name index ${classNameIdx} out of bounds in strings array`);
			}
			if (methodName == undefined) {
				throw new Error(`Method name index ${methodNameIdx} out of bounds in strings array`);
			}
		} else {
			className = getStrFromIdx();
			methodName = getStrFromIdx();
		}

		if (debug_decompress) {
			console.log(`RPC #${i} at ${reader.idx}`);
			console.log(` - Class: ${className}`);
			console.log(` - Method: ${methodName}`);
			console.log(` - idIsNum: ${idIsNum}`);
			console.log(` - hasId: ${hasId}`);
			console.log(` - hasTimestamp: ${hasTimestamp}`);
			console.log(` - shortIndexMode: ${shortIndexMode}`);
			console.log(` - isJsonBody: ${isJsonBody}`);
		}

		let id: string | undefined = undefined;
		if (hasId) {
			if (idIsNum) {
				id = reader.decompressInt().toString();
			} else {
				id = getStrFromIdx();
			}
		}
		if (debug_decompress) console.log(` - ID: ${id}`);

		let timestamp: number | undefined = undefined;
		if (hasTimestamp) timestamp = reader.decompressInt() + timestampOffset;
		if (debug_decompress) console.log(` - Timestamp: ${timestamp}`);

		let args: unknown[] = [];
		if (!isJsonBody) {
			const argCount = reader.readByte();
			if (debug_decompress) console.log(` - Arg count: ${argCount}`);
			for (let i = 0; i < argCount; i++) {
				decompressArgument(reader, args, dynamicArgs);
			}
			// decompressArgs(reader);
		} else {
			const argLen = reader.decompressInt();
			if (debug_decompress) console.log(` - Arg len: ${argLen}`);

			let argStr = "";
			for (let j = 0; j < argLen; j++) {
				argStr += String.fromCharCode(reader.readByte());
			}
			// const argStr = Buffer.from(read(argLen)).toString("ascii");
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
