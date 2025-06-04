/* eslint-disable @typescript-eslint/no-empty-function */
// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

export const debug_decompress = false;
export const debug_compress = false;
export const debug_packet_structure = false;
export const rethrow_on_error = true;

import { RPCPacket } from "../rpc.js";
import { compressRpcPackets, VERSION } from "./compress.js";
import { decompressRpcPacketsV5, decompressRpcPacketsV5Gen } from "./decompressV5.js";
import { decompressRpcPacketsV4, decompressRpcPacketsV4Gen } from "./decompresseV4.js";
import { decompressRpcPacketsV3, decompressRpcPacketsV3Gen } from "./decompressV3.js";

type NumbersUpTo<N extends number, T extends number[] = []> = N extends T["length"] ? T[number] : NumbersUpTo<N, [T["length"], ...T]>;
type Decompressor = (bytes: Buffer) => RPCPacket[];
type GenDecompressor = (bytes: Buffer) => Generator<RPCPacket, void, unknown>;
type Version = NumbersUpTo<typeof VERSION> | typeof VERSION;

const invalidVersion = (v: number) => {
	return () => {
		throw `Decompression version "${v}" is no longer supported`;
	};
};
function numIsVersion(n: number): n is Version {
	return n >= 0 && n <= VERSION;
}

const decompressVersions: Record<Version, Decompressor> = {
	0: invalidVersion(0),
	1: invalidVersion(1),
	2: invalidVersion(2),
	3: decompressRpcPacketsV3,
	4: decompressRpcPacketsV4,
	5: decompressRpcPacketsV5
};

const decompressGenVersions: Record<Version, GenDecompressor> = {
	0: invalidVersion(0),
	1: invalidVersion(1),
	2: invalidVersion(2),
	3: decompressRpcPacketsV3Gen,
	4: decompressRpcPacketsV4Gen,
	5: decompressRpcPacketsV5Gen
};

function decompressRpcPackets(bytes: Buffer): RPCPacket[] {
	if (bytes.length == 0) return [];
	const version = bytes[0];
	if (!numIsVersion(version)) {
		console.error(`Invalid version for decompress, expected 1-${VERSION}, got ${version}`);
		// console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return [];
	}

	try {
		const decompressor = decompressVersions[version];
		if (debug_decompress) console.log(`Decompressing version ${version}`);
		return decompressor(bytes);
	} catch (e) {
		console.error(`Decompression error on packet with ${bytes.length} bytes version ${version}`);
		console.error(e);
		console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		if (rethrow_on_error) throw e;
		return [];
	}
}

function* genEmpty(): Generator<RPCPacket, void, unknown> {
	yield;
}

function decompressRpcPacketsGen(bytes: Buffer): Generator<RPCPacket, void, unknown> {
	if (bytes.length == 0) return genEmpty();
	const version = bytes[0];
	if (!numIsVersion(version)) {
		console.error(`Invalid version for decompress, expected 1-${VERSION}, got ${version}`);
		// console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		return genEmpty();
	}

	try {
		const decompressor = decompressGenVersions[version];
		if (debug_decompress) console.log(`Decompressing version ${version}`);
		return decompressor(bytes);
	} catch (e) {
		console.error(`Decompression error on packet with ${bytes.length} bytes version ${version}`);
		console.error(e);
		console.error(`Data:`);
		// console.error("[" + bytes.join(",") + "]");
		if (rethrow_on_error) throw e;
		return genEmpty();
	}
}

export { compressRpcPackets, decompressRpcPackets, decompressRpcPacketsGen };
