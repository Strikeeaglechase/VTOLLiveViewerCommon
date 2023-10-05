/* eslint-disable @typescript-eslint/ban-types */
class EventHandler {
	disableWhenHandler: () => boolean;
	public shouldExist = true;
	private context: any;
	constructor(private handler: Function, private once: boolean) {}

	public execute(args: any[]) {
		if (!this.shouldExist || (this.disableWhenHandler && this.disableWhenHandler())) {
			this.shouldExist = false;
			return;
		}

		if (this.context) {
			this.handler.apply(this.context, args);
		} else {
			this.handler.apply(null, args);
		}
		if (this.once) this.shouldExist = false;
	}

	public disableWhen(handler: () => boolean) {
		this.disableWhenHandler = handler;
		return this;
	}

	public disable() {
		this.shouldExist = false;
		return this;
	}

	public setContext(context: any) {
		this.context = context;
		return this;
	}
}

class EventEmitter<T extends string = string> {
	public listeners: Record<string, EventHandler[]> = {};

	public on(event: T, listener: Function): EventHandler {
		if (!this.listeners[event]) this.listeners[event] = [];

		const handler = new EventHandler(listener, false);
		this.listeners[event].push(handler);
		return handler;
	}

	public once(event: T, listener: Function) {
		if (!this.listeners[event]) this.listeners[event] = [];

		const handler = new EventHandler(listener, true);
		this.listeners[event].push(handler);
		return handler;
	}

	public emit(event: T, ...args: any[]) {
		if (this.listeners[event]) {
			this.listeners[event].forEach(listener => {
				listener.execute(args);
			});

			this.listeners[event] = this.listeners[event].filter(listener => listener.shouldExist);
		}
	}

	public waitFor(event: T): Promise<any[]> {
		return new Promise(resolve => {
			this.once(event, (...data: any[]) => {
				resolve(data);
			});
		});
	}
}

export { EventEmitter, EventHandler };
