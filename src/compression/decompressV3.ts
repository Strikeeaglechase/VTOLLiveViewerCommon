import { RPCPacket } from "../rpc.js";
import { bitCheck, debug_decompress, decompressArgs, decompressInt, exactBytesToNum, Index, PacketFlags } from "./vtcompression.js";

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

export function* decompressRpcPacketsV3Gen(bytes: number[] | Buffer) {
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
