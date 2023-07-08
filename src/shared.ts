/* eslint-disable no-cond-assign */
/* eslint-disable no-undef */

/* eslint-disable @typescript-eslint/no-unused-vars */
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
}

interface RecordedLobbyInfo {
	lobbyId: string;
	lobbyName: string;
	missionName: string;
	missionId: string;
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
class VTOLLobby {
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

	private onMissionInfo: ((mission: MissionInfo) => void) | null;
	private onConnectionResult: ((state: LobbyConnectionStatus, reason: string) => void) | null;
	public onLobbyEnd: (() => void) | null = null;
	public onLobbyRestart: (() => void) | null = null;
	public onLogMessage: ((message: string) => void) | null = null;
	constructor(public id: string) { }

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
		this.mission = { name, id, campaignId, workshopId, mapId, isBuiltin };
		if (this.onMissionInfo) {
			this.onMissionInfo(this.mission);
			this.onMissionInfo = null;
		}
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

		if (this.onConnectionResult) {
			this.onConnectionResult(this.state, reason);
			this.onConnectionResult = null;
		}
	}

	@RPC("in")
	public SyncLeaveLobby() {
		this.isConnected = false;
		if (this.onLobbyEnd) this.onLobbyEnd();
	}

	@RPC("in")
	public SyncLobbyRestart() {
		this.isConnected = false;
		this.state = LobbyConnectionStatus.None;
		if (this.onLobbyRestart) this.onLobbyRestart();
	}

	@RPC("in")
	public LogMessage(message: string) {
		if (this.onLogMessage) this.onLogMessage(message);
	}

	public waitForConnectionResult(): Promise<LobbyConnectionResult> {
		return new Promise<LobbyConnectionResult>((res) => {
			if (this.state == LobbyConnectionStatus.Connected) { res({ status: this.state, reason: "Connected" }); }
			else this.onConnectionResult = (state, reason) => res({ status: state, reason: reason });
		});
	}

	public waitForMissionInfo(): Promise<MissionInfo> {
		return new Promise<MissionInfo>((res) => {
			if (this.mission) { res(this.mission); console.log(`Instant res mission!`, this.mission); }
			else this.onMissionInfo = res;
		});
	}
}



enum UserScopes {
	ALPHA_ACCESS = "alpha_access",
	USER = "user",
	ADMIN = "admin",
}

enum AuthType {
	STEAM,
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
	VTGRDataChunk,
	VTGRHeader,

	UserScopes,
	AuthType,
	HCUser,
	DbUserEntry,
};