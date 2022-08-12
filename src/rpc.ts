// You know a program is about to be fire when it starts with 10 lines of ESLINT ignores
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable prefer-spread */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-undef */
/* eslint-disable no-redeclare */
import { Buffer } from "buffer";

import { compressRpcPackets, decompressRpcPackets } from "./compression.js";

/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
type RPCMode = "static" | "singleInstance" | "instance";
interface RPCHandler {
	type: RPCMode;
	target: string;
	name: string;
}

interface RPCPacket {
	className: string;
	method: string;
	args: any;
	id?: string;
	timestamp?: number;
}

type PermissionProvider = (packet: RPCPacket, rpc: RPCHandler, client: unknown) => boolean;

function hashCode(str: string): string {
	return str;
	// let hash = 0;
	// if (str.length === 0) return hash;
	// for (let i = 0; i < str.length; i++) {
	// 	const chr = str.charCodeAt(i);
	// 	hash = ((hash << 5) - hash) + chr;
	// 	hash |= 0; // Convert to 32bit integer
	// }
	// return hash;
}

// This is still WIP, don't use true. Replaced by RPC Compression (could possibly used along side)
const useStringHash = false;

class RPCController {
	static instance: RPCController = new RPCController();
	private constructor() { }

	private newInRpcs: RPCHandler[] = [];
	private rpcs: RPCHandler[] = [];

	private sendHandler: ((packet: RPCPacket) => void) | ((packet: Uint8Array) => void);
	private permissionProvider: PermissionProvider;

	private singleInstances: Record<string | number, any> = {};
	private instances: Record<string | number, any[]> = {};
	private multiNameLut: Record<string, string> = {};
	private useRpcPooling = false;
	private rpcSendPool: RPCPacket[] = [];

	public static suppressRPCFindError = false;

	public static init(sendHandler: (packet: RPCPacket) => void) {
		// @ts-ignore
		this.instance.sendHandler = sendHandler;
		this.instance.useRpcPooling = false;
	}

	public static initForPooling(sendHandler: (packet: Uint8Array) => void) {
		// @ts-ignore
		this.instance.sendHandler = sendHandler;
		this.instance.useRpcPooling = true;
	}

	public static assignPermissionProvided(provider: PermissionProvider) {
		this.instance.permissionProvider = provider;
	}

	public registerRPCHandler<T extends { new(...args: any[]): {}; }>(constructor: T, mode: RPCMode, altNames: string[] = []) {
		const defaultName = constructor.name;
		const name = useStringHash ? hashCode(defaultName) : defaultName;
		altNames.forEach(altName => this.multiNameLut[altName] = name);
		if (mode != "static") {
			const self = this;
			constructor = class extends constructor {
				constructor(...args: any[]) {
					super(...args);
					// @ts-ignore
					this.__name = name;

					if (mode == "singleInstance") {
						self.singleInstances[name] = this;
					} else {
						if (!self.instances[name]) self.instances[name] = [];
						self.instances[name].push(this);
					}
				}
			};
		}

		this.newInRpcs.forEach(rpc => {
			rpc.type = mode;
		});
		console.log(`Registered ${mode} RPCs on ${defaultName}${this.newInRpcs.map(r => `\n\t- ${r.name}`)}`);
		this.rpcs.push(...this.newInRpcs);
		this.newInRpcs = [];

		return constructor;
	}

	static deregister(instance: any) {
		// Check to find it as a single instance
		const singleInstance = Object.entries(this.instance.singleInstances).find(i => i[1] == instance);
		if (singleInstance) {
			const preFilter = this.instance.rpcs.length;
			this.instance.rpcs = this.instance.rpcs.filter(rpc => rpc.target != singleInstance[0]);
			console.log(`Deregistered ${singleInstance[0]} and got rid of ${preFilter - this.instance.rpcs.length} RPCs`);
			return;
		}

		const multiInstance = Object.entries(this.instance.instances).find(i => i[1].includes(instance));
		if (multiInstance) {
			console.log(`Deregistered ${multiInstance[0]}#${instance.id}`);
			this.instance.instances[multiInstance[0]] = multiInstance[1].filter(i => i != instance);
			return;
		}
	}

	public registerRpc(target: any, propertyKey: string, descriptor: PropertyDescriptor, direction: "in" | "out"): PropertyDescriptor {
		const rpcName = useStringHash ? hashCode(propertyKey) : propertyKey;
		const targetName = useStringHash ? hashCode(target.constructor.name) : target.constructor.name;
		if (direction == "in") {
			this.newInRpcs.push({
				name: rpcName,
				target: targetName,
				type: "static"
			});
		} else {
			const self = this;
			descriptor.value = function (...args: any[]) {
				// @ts-ignore
				self.fireRPC(target, rpcName, args, this.id);
			};
		}
		return descriptor;
	}

	private fireRPC(target: any, propertyKey: string, args: any[], id?: string) {
		const targetName = useStringHash ? hashCode(target.constructor.name) : target.constructor.name;
		const packet: RPCPacket = {
			className: targetName,
			method: propertyKey,
			args: args,
			id: id,
		};

		if (this.useRpcPooling) {
			this.rpcSendPool.push(packet);
		}
		else {
			// @ts-ignore
			this.sendHandler(packet);
		}

	}

	static flush() {
		const compressed = compressRpcPackets(this.instance.rpcSendPool);
		this.instance.rpcSendPool = [];
		// @ts-ignore
		this.instance.sendHandler(new Uint8Array(compressed));
	}

	static handlePacket(message: string | RPCPacket | Buffer | ArrayBuffer | Buffer[], client?: unknown) {
		if (message instanceof Buffer || message instanceof Uint8Array) {
			const arr = message instanceof Buffer ? new Uint8Array(message) : message;
			try {
				const packets = decompressRpcPackets([...arr]);
				packets.forEach(packet => {
					this.handlePacket(packet, client);
				});
			} catch (e) {
				// console.error(e);
				// console.log([...arr]);
			}

			return;
		}


		let packet = message as RPCPacket;
		try {
			if (typeof message == "string") packet = JSON.parse(message);
		} catch (e) {
			console.log(`Error parsing RPC packet: ${e}`);
			console.log(message);
		}

		// Check alt name
		const altName = this.instance.multiNameLut[packet.className];
		if (altName) {
			packet.className = altName;
		}

		const rpc = this.instance.rpcs.find(rpc => {
			return rpc.target == packet.className && rpc.name == packet.method;
		});

		if (!rpc) {
			if (!this.suppressRPCFindError) console.log(`Cannot find RPC ${packet.className}.${packet.method} with ID ${packet.id}`);
			return;
		}

		if (this.instance.permissionProvider) {
			if (!this.instance.permissionProvider(packet, rpc, client)) {
				console.log(`RPC ${packet.className}.${packet.method} with ID ${packet.id} denied from the permission provider`);
				return;
			}
		}

		switch (rpc.type) {
			case "instance": {
				const instance = this.instance.instances[packet.className]?.find(i => i.id == packet.id);
				if (!instance) return console.warn(`No existing instance for ${packet.className} (id: ${packet.id})`);
				if (!instance[packet.method]) return console.warn(`No RPC method ${packet.className}.${packet.method}`);
				instance[packet.method].apply(instance, packet.args);
				break;
			}

			case "singleInstance": {
				const instance = this.instance.singleInstances[packet.className];
				if (!instance) return console.warn(`No existing instance for ${packet.className}`);
				if (!instance[packet.method]) return console.warn(`No RPC method ${packet.className}.${packet.method}`);
				instance[packet.method].apply(instance, packet.args);
				break;
			}

			case "static": {
				// @ts-ignore
				const method: () => void = rpc.target[rpc.name];
				method.apply(null, packet.args);
				break;
			}
		}
	}
}

function EnableRPCs(mode: RPCMode = "singleInstance", altNames?: string[]) {
	return function (constructor: any) {
		return RPCController.instance.registerRPCHandler(constructor, mode, altNames);
	};
}
type DecoratorReturn = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;

function RPC(direction: "in" | "out"): DecoratorReturn {
	return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		return RPCController.instance.registerRpc(target, propertyKey, descriptor, direction);
	};
}

export {
	RPCMode,
	RPCHandler,
	RPCPacket,
	RPCController,
	EnableRPCs,
	RPC
};