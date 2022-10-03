/* eslint-disable no-cond-assign */
/* eslint-disable no-undef */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
import { eraseCookie, setCookie } from "./cookieHelper.js";
import { EnableRPCs, RPC } from "./rpc.js";

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


interface RPCPacket {
	className: string;
	method: string;
	args: any[];
	id?: string;
	gameId?: string;
	pid?: number;
	// type: PacketType.rpcPacket;
}

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
	private onConnectionResult: ((state: LobbyConnectionStatus) => void) | null;
	public onLobbyEnd: (() => void) | null = null;
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
	public ConnectionResult(success: boolean) {
		console.log(`Connection result: ${success}`);
		if (success) this.state = LobbyConnectionStatus.Connected;
		else this.state = LobbyConnectionStatus.Invalid;

		if (this.onConnectionResult) {
			this.onConnectionResult(this.state);
			this.onConnectionResult = null;
		}
	}

	@RPC("in")
	public SyncLeaveLobby() {
		this.isConnected = false;
		if (this.onLobbyEnd) this.onLobbyEnd();
	}

	public waitForConnectionResult(): Promise<LobbyConnectionStatus> {
		return new Promise<LobbyConnectionStatus>((res) => {
			if (this.state == LobbyConnectionStatus.Connected) { res(this.state); }
			else this.onConnectionResult = res;
		});
	}

	public waitForMissionInfo(): Promise<MissionInfo> {
		return new Promise<MissionInfo>((res) => {
			if (this.mission) { res(this.mission); console.log(`Instant res mission!`, this.mission); }
			else this.onMissionInfo = res;
		});
	}
}

@EnableRPCs("instance")
class Client {
	public expectedReplayChunks = -1;
	constructor(public id: string) { }

	@RPC("out")
	subscribe(gameId: string) { }

	@RPC("out")
	setAlphaKey(key: string) { }

	@RPC("in")
	createAlphaKey(key: string) {
		console.log(`Got alpha key: ${key}`);
		setCookie("alpha_key", key);
	}

	@RPC("in")
	alphaAuthResult(success: boolean) {
		console.log(`Alpha auth result: ${success}`);
		if (!success) {
			alert("Alpha key auth failed");
			eraseCookie("alpha_key");
		}
	}

	@RPC("out")
	replayGame(id: string) { }

	@RPC("in")
	expectChunks(count: number) {
		this.expectedReplayChunks = count;
		console.log(`Expecting ${count} chunks for replay`);
	}

	@RPC("in")
	ping(n: number) {
		this.pong(n);
	}

	@RPC("out")
	pong(n: number) { }
}

export {
	Packet,
	PacketBase,
	PacketType,
	RPCPacket,
	MultiRPCPacket,
	Vector3,
	Player,
	RawPlayerInfo,
	AssignID,
	Team,
	VTOLLobby,
	Client,
	MissionInfo,
	LobbyConnectionStatus,
	RecordedLobbyInfo
};