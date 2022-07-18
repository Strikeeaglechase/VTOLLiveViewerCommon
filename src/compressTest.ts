import _ from "lodash";

import { compressRpcPackets, decompressRpcPackets } from "./compression.js";
import { RPCPacket } from "./rpc";

const inputPackets: RPCPacket[] = [
	{ className: "TClass1", method: "method1", args: ["hello", 5, "world", true, null], id: undefined },
	{ className: "TClass1", method: "method1", args: ["hello", 5, "world", true, null], id: "5" },
	{ className: "ComplexClass", method: "JsonBody", args: [[[{ hello: "world", this: [{ is: "complex" }] }]]], id: undefined },
	{ className: "ComplexClass", method: "JsonBody", args: [[[{ hello: "world", this: [{ is: "complex" }] }]]], id: "helloWorld" },
];
// Fill the input with a shit load of packets with different strings
for (let i = 0; i < 300; i++) {
	inputPackets.push({ className: `TClass${i}`, method: "method1", args: ["hello", 5, "world", true, null], id: i.toString() });
}


const bytes = compressRpcPackets(inputPackets);
const jsonSize = JSON.stringify(inputPackets).length;
console.log(`Byte Size: ${bytes.length} JSON Size: ${jsonSize}`);
const decompressed = decompressRpcPackets(bytes);
console.log(`Test result: ${_.isEqual(decompressed, inputPackets)}`);