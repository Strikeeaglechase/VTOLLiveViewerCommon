/* eslint-disable no-cond-assign */
/* eslint-disable no-undef */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "./eventEmitter.js";
import { EnableRPCs, RPC, RPCPacket } from "./rpc.js";

interface PacketBase { type: PacketType; }

// TODO: Remove strings from RPC calls
enum PacketType {
	rpcPacket = "rpcPacket",
	assignId = "assignId",
	multiRpc = "multiRpc",
}

enum Team {
	A,
	B,
	Unknown
}

interface Vector3 {
	x: number;
	y: number;
	z: number;
}

interface RawPlayerInfo {
	steamId: string;
	pilotName: string;
	slot: number;
	team: Team;
	entityId: number;
	unitId: number;
}

class Player implements RawPlayerInfo {
	public steamId: string;
	public pilotName: string;
	public slot: number;
	public team: Team;
	public entityId: number;
	public unitId: number;
	constructor(info: RawPlayerInfo) {
		this.steamId = info.steamId;
		this.pilotName = info.pilotName;
		this.slot = info.slot;
		this.team = info.team;
		this.entityId = info.entityId;
		this.unitId = info.unitId;
	}

	static empty = new Player({
		steamId: "none",
		pilotName: "Unknown",
		slot: -1,
		team: Team.A,
		entityId: -1,
		unitId: -1
	});
}


// interface RPCPacket {
// 	[x: string]: any;
// 	className: string;
// 	method: string;
// 	args: any[];
// 	id?: string;
// 	gameId?: string;
// 	pid?: number;
// 	// type: PacketType.rpcPacket;
// }

interface AssignID {
	id: string;
	type: PacketType.assignId;
}

interface MultiRPCPacket {
	packets: RPCPacket[];
	type: PacketType.multiRpc;
}

type Packet = RPCPacket |
	AssignID |
	MultiRPCPacket;

interface MissionInfo {
	name: string;
	id: string;
	campaignId: string;
	workshopId: string;
	mapId: string;
	isBuiltin: boolean;
	spawns: { name: string, id: number; }[];
	allUnitSpawns: { name: string, id: number; }[];
}

interface RecordedLobbyInfo {
	lobbyId: string;
	lobbyName: string;
	missionName: string;
	missionId: string;
	missionInfo: MissionInfo;
	campaignId: string;
	type: string;
	map: string;
	recordingId: string;
	duration: number;
	startTime: number;
}

enum LobbyConnectionStatus {
	None,
	Connecting,
	Invalid,
	Connected,
}

interface LobbyConnectionResult {
	status: LobbyConnectionStatus;
	reason: string;
}

interface VTGRDataChunk {
	start: number;
	length: number;
}

interface VTGRHeader {
	info: RecordedLobbyInfo;
	id: string;
	chunks: VTGRDataChunk[];
}


@EnableRPCs("instance")
class VTOLLobby extends EventEmitter<"lobby_end" | "lobby_restart" | "log_message" | "mission_info" | "connection_result">{
	public name = "";
	public missionName = "";
	public playerCount = 0;
	public maxPlayers = 0;
	public isConnected = false;
	public state: LobbyConnectionStatus = LobbyConnectionStatus.None;
	public isPrivate = false;
	public players: Player[] = [];
	public isOpen = true;
	public mission: MissionInfo | null = null;

	// private onMissionInfo: ((mission: MissionInfo) => void) | null;
	// private onConnectionResult: ((state: LobbyConnectionStatus, reason: string) => void) | null;
	// public onLobbyEnd: (() => void) | null = null;
	// public onLobbyRestart: (() => void) | null = null;
	// public onLogMessage: ((message: string) => void) | null = null;
	constructor(public id: string) {
		super();
		console.log(`VTOLLobby ${id} created`);
	}

	@RPC("in")
	public UpdateLobbyInfo(name: string, missionName: string, playerCount: number, maxPlayers: number, isPrivate: boolean, isConnected: boolean, players: RawPlayerInfo[]) {
		this.name = name;
		this.missionName = missionName;
		this.playerCount = playerCount;
		this.maxPlayers = maxPlayers;
		this.isConnected = isConnected;
		this.isPrivate = isPrivate;
		this.players = players.map(p => new Player(p));
		if (isConnected) console.log(`Update lobby info got ${this.players.length} players`);
		if (isConnected) this.state = LobbyConnectionStatus.Connected;
	}

	@RPC("in")
	public UpdateMissionInfo(name: string, id: string, campaignId: string, workshopId: string, mapId: string, isBuiltin: boolean) {
		this.mission = { name, id, campaignId, workshopId, mapId, isBuiltin, spawns: [], allUnitSpawns: [] };
		this.emit("mission_info", this.mission);
	}

	@RPC("in")
	public CloseLobby() {
		this.isOpen = false;
	}

	@RPC("in")
	public ConnectionResult(success: boolean, reason: string) {
		console.log(`Connection result: ${success}, ${reason}`);
		if (success) this.state = LobbyConnectionStatus.Connected;
		else this.state = LobbyConnectionStatus.Invalid;

		this.emit("connection_result", this.state, reason);
	}

	@RPC("in")
	public SyncLeaveLobby() {
		this.isConnected = false;
		this.emit("lobby_end");
	}

	@RPC("in")
	public SyncLobbyRestart() {
		this.isConnected = false;
		this.state = LobbyConnectionStatus.None;
		this.emit("lobby_restart");
	}

	@RPC("in")
	public LogMessage(message: string) {
		this.emit("log_message", message);
	}

	public async waitForConnectionResult(): Promise<LobbyConnectionResult> {
		console.log(`Waiting for connection result`);
		if (this.state == LobbyConnectionStatus.Connected) return { status: this.state, reason: "Connected" };
		else {
			const res = await this.waitFor("connection_result");
			console.log(res);
			const [status, reason] = res;
			return { status, reason };
		}
	}

	public async waitForMissionInfo(): Promise<MissionInfo> {
		if (this.mission) return this.mission;
		else {
			const res = await this.waitFor("mission_info");
			return res[0];
		}
	}
}



enum UserScopes {
	ALPHA_ACCESS = "alpha_access",
	USER = "user",
	ADMIN = "admin",
}

enum AuthType {
	STEAM = "steam",
	BYPASS = "bypass"
}

interface HCUser {
	id: string;
	username: string;
	authType: AuthType;
	scopes: UserScopes[];
	pfpUrl: string;

	exp?: number;
	iat?: number;
}

interface DbUserEntry {
	id: string;
	scopes: UserScopes[];
	lastLoginTime: number;
	createdAt: number;
	lastUserObject: HCUser;
}

interface RecordedLobbyPacket {
	id: string;
	lobbyId: string;
	timestamp: number;
	type: "packet" | "event" | "init";
	data: string;
}

export {
	Vector3,

	Packet,
	PacketBase,
	PacketType,
	MultiRPCPacket,
	AssignID,

	VTOLLobby,
	LobbyConnectionStatus,
	LobbyConnectionResult,
	MissionInfo,

	Player,
	RawPlayerInfo,
	Team,

	RecordedLobbyInfo,
	RecordedLobbyPacket,
	VTGRDataChunk,
	VTGRHeader,

	UserScopes,
	AuthType,
	HCUser,
	DbUserEntry,
};