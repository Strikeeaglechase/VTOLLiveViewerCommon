import fs from "fs";

import { decompressRpcPackets } from "./vtcompression.js";

const file = fs.readFileSync("../../../test-data.json", "utf8");
const bytes = JSON.parse(file) as number[];
fs.writeFileSync("../../../test-data.bin", Buffer.from(bytes), "binary");

const decompress = decompressRpcPackets(Buffer.from(bytes));
