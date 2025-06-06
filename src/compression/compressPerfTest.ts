import fs from "fs";
import { RPCPacket } from "../rpc.js";
import { compressRpcPackets } from "./compress.js";
import { decompressRpcPackets } from "./vtcompression.js";
import _ from "lodash";
// import { printStats } from "./decompressV5.js";

const fileContent = fs.readFileSync("../../test_rpcs.json", "utf-8");
const chunkedRpcs: RPCPacket[][] = JSON.parse(fileContent);
let totalRpcs = 0;
chunkedRpcs.forEach(chunk => (totalRpcs += chunk.length));
console.log(`Total RPCs: ${totalRpcs}`);

const compressStart = performance.now();
const compressedChunks = chunkedRpcs.map(rpcs => compressRpcPackets(rpcs, true));
const compressDur = performance.now() - compressStart;
const compressPacketsPerSecond = Math.round(totalRpcs / (compressDur / 1000));
const compressedBytes = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
console.log(`Compression took ${compressDur.toFixed(0)}ms (${compressPacketsPerSecond.toFixed(0)} pps)`);
console.log(`Compressed size: ${(compressedBytes / 1024).toFixed(0)}kb, JSON size: ${(fileContent.length / 1024).toFixed(0)}kb`);
console.log(`Compression ratio: ${(compressedBytes / fileContent.length).toFixed(3)}`);

const decompressStart = performance.now();
const decompressedChunks = compressedChunks.map(compressed => {
	const result = decompressRpcPackets(Buffer.from(compressed));

	return result;
});
const decompressDur = performance.now() - decompressStart;
const decompressPacketsPerSecond = Math.round(totalRpcs / (decompressDur / 1000));
console.log(`Decompression took ${decompressDur.toFixed(0)}ms (${decompressPacketsPerSecond.toFixed(0)} pps)`);
// printStats();

function assert(condition: boolean, message: string) {
	if (!condition) {
		console.error(message);
		// process.exit(1);
	}

	return condition;
}

function compareRpcs(a: RPCPacket, b: RPCPacket) {
	const cmp = (a: any, b: any) => {
		if (typeof a != "number" || typeof b != "number") return undefined;
		return Math.abs(a - b) < 0.01;
	};

	let result = true;
	result &&= assert(a.className === b.className, `Class name mismatch: ${a.className} != ${b.className}`);
	result &&= assert(a.method === b.method, `Method mismatch: ${a.method} != ${b.method}`);
	result &&= assert(a.id === b.id, `ID mismatch: ${a.id} != ${b.id}`);
	result &&= assert(a.timestamp === b.timestamp, `Timestamp mismatch: ${a.timestamp} != ${b.timestamp}`);
	result &&= assert(_.isEqualWith(a.args, b.args, cmp), `Args mismatch: ${JSON.stringify(a.args)} != ${JSON.stringify(b.args)}`);

	return result;
}

chunkedRpcs.forEach((chunk, i) => {
	chunk.forEach((expectedRpc, j) => {
		const decompressedRpc = decompressedChunks[i][j];
		if (!compareRpcs(expectedRpc, decompressedRpc)) {
			console.log(`Mismatch at index ${i}:`);
			console.log(`Expected: ${JSON.stringify(expectedRpc)}`);
			console.log(`Got: ${JSON.stringify(decompressedRpc)}`);
			process.exit(1);
		}
	});
});
