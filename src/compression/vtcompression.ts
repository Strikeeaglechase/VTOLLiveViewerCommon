// IMPORTANT: Numbers should be stored as at least 2 byte values, using single bytes has caused a shit load of issues

export const debug_decompress = false;
export const debug_compress = false;
export const debug_packet_structure = false;
export const rethrow_on_error = true;

import { RPCPacket } from "../rpc.js";
import { compressRpcPackets } from "./compress.js";
import { decompressRpcPacketsV4, decompressRpcPacketsV4Gen } from "./decompresseV4.js";
import { decompressRpcPacketsV3, decompressRpcPacketsV3Gen } from "./decompressV3.js";

type Decompressor = (bytes: Buffer) => RPCPacket[];
type GenDecompressor = (bytes: Buffer) => Generator<RPCPacket, void, unknown>;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-empty-function
const decompressVersions: Decompressor[] = [() => {}, () => {}, () => {}, decompressRpcPacketsV3, decompressRpcPacketsV4];

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-empty-function
const decompressGenVersions: GenDecompressor[] = [() => {}, () => {}, () => {}, decompressRpcPacketsV3Gen, decompressRpcPacketsV4Gen];

function decompressRpcPackets(bytes: Buffer) {
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

function decompressRpcPacketsGen(bytes: Buffer) {
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
