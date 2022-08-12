import _ from "lodash";

import { compressRpcPackets, decompressRpcPackets } from "./compression.js";
import { RPCPacket } from "./rpc";

const inputPackets: RPCPacket[] = [
	{ className: "TClass1", method: "method1", args: ["hello", 5, "world", true, null], id: undefined, timestamp: undefined },
	{ className: "TClass1", method: "method1", args: ["hello", 5, "world", true, null], id: "5", timestamp: 9999999999999 },
	{ className: "ComplexClass", method: "JsonBody", args: [[[{ hello: "world", this: [{ is: "complex" }] }]]], id: undefined, timestamp: Date.now() },
	{ className: "ComplexClass", method: "JsonBody", args: [[[{ hello: "world", this: [{ is: "complex" }] }]]], id: "helloWorld", timestamp: undefined },
];
// Fill the input with a shit load of packets with different strings
for (let i = 0; i < 300; i++) {
	const id = (i % 2000).toString();
	inputPackets.push({ className: `TClass${id}`, method: "method1", args: ["hello", 5, "world", true, null], id: id, timestamp: undefined });
}


const bytes = compressRpcPackets(inputPackets);
const jsonSize = JSON.stringify(inputPackets).length;
console.log(`Byte Size: ${bytes.length} JSON Size: ${jsonSize}`);
const decompressed = decompressRpcPackets(bytes);
console.log(`Test result: ${_.isEqual(decompressed, inputPackets)}`);