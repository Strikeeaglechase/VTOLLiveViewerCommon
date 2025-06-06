import { Readable } from "stream";
import unzipper, { File } from "unzipper";
import { VTGRHeader } from "./shared.js";
import { decompressRpcPackets } from "./compression/vtcompression.js";
import { RPCPacket } from "./rpc.js";

type RPCCallback = (rpc: RPCPacket) => void;

class VTGRBodyReader {
	private buffers: Buffer[] = [];
	private currentSize = 0;
	public totalSize = 0;

	private currentChunkIndex = 0;
	constructor(private header: VTGRHeader, stream: Readable, private cb: RPCCallback) {
		stream.on("data", data => {
			this.totalSize += data.length;
			this.currentSize += data.length;

			this.buffers.push(data);

			if (this.currentSize >= this.header.chunks[this.currentChunkIndex].length) {
				this.readNextChunk();
			}
		});

		stream.on("end", () => {
			this.readNextChunk();
		});
	}

	private async readNextChunk() {
		const currentChunkSize = this.header.chunks[this.currentChunkIndex] ? this.header.chunks[this.currentChunkIndex].length : this.currentSize;
		const buffer = Buffer.concat(this.buffers);
		const chunk = buffer.subarray(0, currentChunkSize);
		const chunkPackets = decompressRpcPackets(chunk);
		chunkPackets.forEach(p => this.cb(p));

		const rest = buffer.subarray(currentChunkSize);
		this.currentSize = rest.length;
		this.buffers = [rest];
		this.currentChunkIndex++;
	}
}

class VTGRReader {
	private files: Record<string, File> = {};
	private header: VTGRHeader | null = null;
	private maps: Buffer[];

	constructor(private path: string) {}

	public async open() {
		const dir = await unzipper.Open.file(this.path);

		dir.files.forEach(file => {
			this.files[file.path] = file;
		});
	}

	public async getHeader(): Promise<VTGRHeader> {
		if (this.header) {
			return this.header; // Return cached header if already fetched
		}

		const headerEntry = this.files["header.json"];
		if (!headerEntry) {
			throw new Error("Header file not found in VTGR archive.");
		}

		const headerBuffer = await headerEntry.buffer();

		this.header = JSON.parse(headerBuffer.toString()) as VTGRHeader;

		return this.header;
	}

	public async getMaps(): Promise<Buffer[]> {
		if (this.maps) {
			return this.maps; // Return cached maps if already fetched
		}

		this.maps = [];
		let i = 0;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const mapEntry = this.files[`map_${i}.png`];
			if (!mapEntry) {
				break; // No more map files
			}

			const mapBuffer = await mapEntry.buffer();
			this.maps.push(mapBuffer);
			i++;
		}

		return this.maps;
	}

	public async getBody(): Promise<Readable> {
		const bodyEntry = this.files["data.bin"];
		if (!bodyEntry) {
			throw new Error("Body file not found in VTGR archive.");
		}

		return bodyEntry.stream();
	}

	public async parse(cb: RPCCallback) {
		const header = await this.getHeader();
		const bodyStream = await this.getBody();

		const bodyReader = new VTGRBodyReader(header, bodyStream, cb);

		return new Promise<void>((resolve, reject) => {
			bodyStream.on("end", () => {
				resolve();
			});
			bodyStream.on("error", err => {
				reject(err);
			});
		});
	}

	public async parseAll() {
		const header = await this.getHeader();
		const bodyStream = await this.getBody();

		return new Promise<RPCPacket[]>((resolve, reject) => {
			const packets: RPCPacket[] = [];
			const bodyReader = new VTGRBodyReader(header, bodyStream, rpc => {
				packets.push(rpc);
			});

			bodyStream.on("end", () => {
				resolve(packets);
			});

			bodyStream.on("error", err => {
				reject(err);
			});
		});
	}
}

export { VTGRReader, VTGRBodyReader };
