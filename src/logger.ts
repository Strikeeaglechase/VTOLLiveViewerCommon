import chalk from "chalk";
import fs from "fs";

const LOG_PATH_BASE = "../logs/";
enum LoggerLevel {
	INFO = 0,
	WARNING = 1,
	ERROR = 2
}

type LogFormatter = (timestamp: string, message: string, level: LoggerLevel, forFile: boolean) => string;

function extractSections(logMessage: string): string[] {
	const sections = logMessage.match(/\[.*?\]/g) || [];
	const message = logMessage.replace(/\[.*?\]/g, "").trim();
	return [...sections, message];
}

class Logger {
	public static instance = new Logger();
	private lastCheckedPath = "";
	private writeStreams: Record<string, fs.WriteStream> = {};
	private defaultLogFile = "server";

	private formatters: Record<LoggerLevel, LogFormatter>;

	private constructor() {
		if (!fs.existsSync(LOG_PATH_BASE)) {
			fs.mkdirSync(LOG_PATH_BASE);
		}

		const formatter = (color: (...text: unknown[]) => string) => (timestamp: string, message: string, level: LoggerLevel, forFile: boolean) => {
			let pad = " ";
			if (message?.startsWith("[")) pad = "";
			if (forFile) return `[${timestamp}][${LoggerLevel[level]}]${pad}${message}`;
			return `[${timestamp}]` + color(`[${LoggerLevel[level]}]${pad}${message}`);
		};

		this.formatters = {
			[LoggerLevel.INFO]: formatter(chalk.blue),
			[LoggerLevel.WARNING]: formatter(chalk.yellow),
			[LoggerLevel.ERROR]: formatter(chalk.red)
		};
	}

	public static configureFormatter(level: LoggerLevel | LoggerLevel[], formatter: LogFormatter) {
		if (Array.isArray(level)) {
			level.forEach(l => (Logger.instance.formatters[l] = formatter));
		} else {
			Logger.instance.formatters[level] = formatter;
		}
	}

	public static setDefaultLogFile(file: string) {
		Logger.instance.defaultLogFile = file;
	}

	public getLogPath(): string {
		const date = new Date();
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		return `${LOG_PATH_BASE}${year}-${month}-${day}/`;
	}

	private ensureFolderExists() {
		const path = this.getLogPath();
		if (path == this.lastCheckedPath) return;

		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}

		this.lastCheckedPath = path;
	}

	private log(message: string, level: LoggerLevel, target: string) {
		this.ensureFolderExists();
		const path = this.getLogPath() + `${target}.log`;
		if (!this.writeStreams[path]) {
			this.writeStreams[path] = fs.createWriteStream(path, { flags: "a" });
		}

		const stream = this.writeStreams[path];
		const consoleLog = this.formatters[level](new Date().toISOString(), message, level, false);
		const fileLog = this.formatters[level](new Date().toISOString(), message, level, true);
		stream.write(fileLog + "\n");
		console.log(consoleLog);
	}

	public static info(message: string, target = Logger.instance.defaultLogFile) {
		Logger.instance.log(message, LoggerLevel.INFO, target);
	}

	public static warn(message: string, target = Logger.instance.defaultLogFile) {
		Logger.instance.log(message, LoggerLevel.WARNING, target);
	}

	public static error(message: string, target = Logger.instance.defaultLogFile) {
		Logger.instance.log(message, LoggerLevel.ERROR, target);
	}

	public static processHCLog(rawMessage: string) {
		// Log message: [2023-02-05T19:46:44.6713395Z][109775242904288633][INFO] Message
		// Parse out the timestamp, process ID, and log level, and then log the message without using hardcoded lengths
		const [timestamp, lobbyId, level, message] = extractSections(rawMessage);

		let logMethod: (message: string) => void;
		switch (level) {
			case "[INFO]":
				logMethod = Logger.info;
				break;
			case "[WARN]":
				logMethod = Logger.warn;
				break;
			case "[ERROR]":
				logMethod = Logger.error;
				break;
			default:
				logMethod = Logger.info;
				break;
		}

		logMethod(`[HC]${lobbyId} ${message}`);
	}
}

export { Logger };
