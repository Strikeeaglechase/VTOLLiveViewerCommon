import { RPCPacket } from "../rpc.js";
import {
	bitCheck, debug_decompress, decompressArgs, decompressInt, exactBytesToNum, PacketFlags
} from "./vtcompression.js";

export function decompressRpcPacketsV1(bytes: number[]) {
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

	let version = readOne();
	if (debug_decompress) console.log(`Version: ${version}`);

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
			console.log(`RPC #${i} at ${idx}`);
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