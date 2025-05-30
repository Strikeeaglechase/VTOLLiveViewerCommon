import fs from "fs";
import { RPCPacket } from "../rpc.js";
import { compressRpcPackets } from "./compress.js";
import { decompressRpcPackets } from "./vtcompression.js";
import _ from "lodash";

const chunkedRpcs: RPCPacket[][] = JSON.parse(fs.readFileSync("../../test_rpcs.json", "utf-8"));
let totalRpcs = 0;
chunkedRpcs.forEach(chunk => (totalRpcs += chunk.length));
console.log(`Total RPCs: ${totalRpcs}`);

const compressStart = performance.now();
const compressedChunks = chunkedRpcs.map(rpcs => compressRpcPackets(rpcs, true));
const compressDur = performance.now() - compressStart;
const compressPacketsPerSecond = Math.round(totalRpcs / (compressDur / 1000));
console.log(`Compression took ${compressDur}ms (${compressPacketsPerSecond.toFixed(0)} pps)`);

const decompressStart = performance.now();
const decompressedChunks = compressedChunks.map(compressed => decompressRpcPackets(Buffer.from(compressed)));
const decompressDur = performance.now() - decompressStart;
const decompressPacketsPerSecond = Math.round(totalRpcs / (decompressDur / 1000));
console.log(`Decompression took ${decompressDur}ms (${decompressPacketsPerSecond.toFixed(2)} pps)`);

function assert(condition: boolean, message: string) {
	if (!condition) {
		console.error(message);
		// process.exit(1);
	}
}

function compareRpcs(a: RPCPacket, b: RPCPacket) {
	const cmp = (a: any, b: any) => {
		if (typeof a != "number" || typeof b != "number") return undefined;
		return Math.abs(a - b) < 0.01;
	};

	assert(a.className === b.className, `Class name mismatch: ${a.className} != ${b.className}`);
	assert(a.method === b.method, `Method mismatch: ${a.method} != ${b.method}`);
	assert(a.id === b.id, `ID mismatch: ${a.id} != ${b.id}`);
	assert(a.timestamp === b.timestamp, `Timestamp mismatch: ${a.timestamp} != ${b.timestamp}`);
	assert(_.isEqualWith(a.args, b.args, cmp), `Args mismatch: ${JSON.stringify(a.args)} != ${JSON.stringify(b.args)}`);

	return true;
}

chunkedRpcs.forEach((chunk, i) => {
	chunk.forEach((expectedRpc, j) => {
		const decompressedRpc = decompressedChunks[i][j];
		if (!compareRpcs(expectedRpc, decompressedRpc)) {
			console.log(`Mismatch at index ${i}:`);
			console.log(`Expected: ${JSON.stringify(expectedRpc)}`);
			console.log(`Got: ${JSON.stringify(decompressedRpc)}`);
			// process.exit(1);
		}
	});
});
