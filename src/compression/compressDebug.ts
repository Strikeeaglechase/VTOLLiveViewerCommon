import fs from "fs";

import { compressRpcPackets, decompressRpcPackets } from "./vtcompression.js";

const packet = {
	className: "VTOLLobby",
	method: "UpdateLobbyInfo",
	args: ["Apolloh's lobby", "09: Lit Fuse", 2, 4, true, false, [], "76561198086816122", "Apolloh", false],
	id: "109775240931934880",
	gameId: "",
	type: "rpcPacket"
};

const compressed = compressRpcPackets([packet], false);
const decompressed = decompressRpcPackets(Buffer.from(compressed));
console.log(decompressed);

// const file = fs.readFileSync("../../../test-data.json", "utf8");
// const bytes = JSON.parse(file) as number[];
// fs.writeFileSync("../../../test-data.bin", Buffer.from(bytes), "binary");

// const decompress = decompressRpcPackets(Buffer.from(bytes));
