/* eslint-disable no-cond-assign */
/* eslint-disable no-undef */

import { EventEmitter } from "./eventEmitter.js";
import { EnableRPCs, RPC, RPCPacket } from "./rpc.js";

export interface PacketBase {
	type: PacketType;
}

// TODO: Remove strings from RPC calls
export enum PacketType {
	rpcPacket = "rpcPacket",
	assignId = "assignId",
	multiRpc = "multiRpc"
}

export enum Team {
	A,
	B,
	Unknown
}

export interface Vector3 {
	x: number;
	y: number;
	z: number;
}

export interface RawPlayerInfo {
	steamId: string;
	pilotName: string;
	slot: number;
	team: Team;
	entityId: number;
	unitId: number;
}

export class Player implements RawPlayerInfo {
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

export interface AssignID {
	id: string;
	type: PacketType.assignId;
}

export interface MultiRPCPacket {
	packets: RPCPacket[];
	type: PacketType.multiRpc;
}

export type Packet = RPCPacket | AssignID | MultiRPCPacket;

export interface MissionInfoWithoutSpawns {
	name: string;
	id: string;
	campaignId: string;
	workshopId: string;
	mapId: string;
	isBuiltin: boolean;
}

export interface MissionInfo extends MissionInfoWithoutSpawns {
	spawns: { name: string; id: number }[];
	allUnitSpawns: { name: string; id: number }[];
	waypoints: { name: string; id: number; position: Vector3 }[];
	bullseye: Record<Team, number>;
}

export interface RecordedLobbyInfo {
	lobbyId: string;
	lobbyName: string;
	missionName: string;
	missionId: string;
	hostName: string;
	hostId: string;
	missionInfo: MissionInfo;
	campaignId: string;
	workshopId: string;
	map: string;
	recordingId: string;
	duration: number;
	startTime: number;
	metadata?: VTGRMetadata;
}

export enum LobbyConnectionStatus {
	None,
	Connecting,
	Invalid,
	Connected
}

export interface LobbyConnectionResult {
	status: LobbyConnectionStatus;
	reason: string;
}

export interface VTGRDataChunk {
	start: number;
	length: number;
}

export interface VTGRHeader {
	info: RecordedLobbyInfo;
	id: string;
	chunks: VTGRDataChunk[];
}

export const CURRENT_VTGR_METADATA_VERSION = "1";
export interface VTGRMetadata {
	id: string;
	players: { name: string; id: string }[];

	netInstantiates: number;
	totalPackets: number;

	version: string;
	errored: boolean;
}

export enum LobbyReadyState {
	Ready,
	NoMission
}

@EnableRPCs("instance", ["NuclearOptionLobby"])
export class VTOLLobby extends EventEmitter<"lobby_end" | "lobby_restart" | "log_message" | "mission_info" | "connection_result" | "lobby_ready_state"> {
	public name = "";
	public missionName = "";
	public playerCount = 0;
	public maxPlayers = 0;
	public isConnected = false;
	public state: LobbyConnectionStatus = LobbyConnectionStatus.None;
	public readyStatus: LobbyReadyState = LobbyReadyState.NoMission;
	public isPrivate = false;
	public players: Player[] = [];
	public isOpen = true;
	public activelyRecording = false;
	public mission: MissionInfoWithoutSpawns | null = null;
	public hostName: string;
	public hostId: string;

	constructor(public id: string) {
		super();
		console.log(`VTOLLobby ${id} created`);
	}

	@RPC("in")
	public UpdateLobbyInfo(
		name: string,
		missionName: string,
		playerCount: number,
		maxPlayers: number,
		isPrivate: boolean,
		isConnected: boolean,
		players: RawPlayerInfo[],
		hostId: string,
		hostName: string
	) {
		this.name = name;
		this.missionName = missionName;
		this.playerCount = playerCount;
		this.maxPlayers = maxPlayers;
		this.isConnected = isConnected;
		this.isPrivate = isPrivate;
		this.players = players.map(p => new Player(p));
		this.hostId = hostId;
		this.hostName = hostName;

		if (isConnected) console.log(`Update lobby info got ${this.players.length} players`);
		if (isConnected) this.state = LobbyConnectionStatus.Connected;
	}

	@RPC("in")
	public UpdateMissionInfo(name: string, id: string, campaignId: string, workshopId: string, mapId: string, isBuiltin: boolean) {
		this.mission = { name, id, campaignId, workshopId, mapId, isBuiltin };
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

	@RPC("in")
	public UpdateLobbyStatus(state: LobbyReadyState) {
		this.readyStatus = state;
		this.emit("lobby_ready_state", state);
	}

	@RPC("in")
	isRecording(isRecording: boolean) {
		this.activelyRecording = isRecording;
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

	public async waitForMissionInfo(): Promise<MissionInfoWithoutSpawns> {
		if (this.mission) return this.mission;
		else {
			const res = await this.waitFor("mission_info");
			return res[0];
		}
	}
}

export enum UserScopes {
	ALPHA_ACCESS = "alpha_access",
	USER = "user",
	ADMIN = "admin",
	DONOR = "donor"
}

export enum AuthType {
	STEAM = "steam",
	BYPASS = "bypass"
}

export interface HCUser {
	id: string;
	username: string;
	authType: AuthType;
	scopes: UserScopes[];
	pfpUrl: string;

	exp?: number;
	iat?: number;
}

export interface DbUserEntry {
	id: string;
	scopes: UserScopes[];
	lastLoginTime: number;
	createdAt: number;
	lastUserObject: HCUser;
}

export interface RecordedLobbyPacket {
	id: string;
	lobbyId: string;
	recordingId: string;
	timestamp: number;
	type: "packet" | "event" | "init";
	data: string;
}

export interface ServiceCallMetrics {
	className: string;
	methodName: string;
	count: number;
	totalPing: number;
	data: number;
}
