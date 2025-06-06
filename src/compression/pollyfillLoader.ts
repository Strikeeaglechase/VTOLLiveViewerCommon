/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Float16Array as f16ArrPolly } from "@petamoriken/float16";

/* eslint-disable no-empty */
function loadBuffer() {
	try {
		const x = Buffer.from("");
	} catch (e) {
		console.warn("Buffer not defined, using global Buffer");
		try {
			const globalScope = getGlobalScope();

			// @ts-ignore
			globalScope.Buffer = buffer.Buffer;
		} catch (e) {
			console.error(`Exception when trying to check self: ${e}`);
		}
	}
}

function getGlobalScope() {
	try {
		if (self && self != undefined) return self;
	} catch (e) {
		console.log(`Could not access self: ${e}`);
	}

	try {
		if (window && window != undefined) return window;
	} catch (e) {
		console.log(`Could not access window: ${e}`);
	}

	try {
		if (global && global != undefined) return global;
	} catch (e) {
		console.log(`Could not access global: ${e}`);
	}

	console.error("No global scope found. Cannot load polyfills.");
	return undefined;
}

function loadFloat16() {
	try {
		// @ts-ignore
		const f16Arr = new Float16Array(1);
	} catch (e) {
		console.warn("Float16Array not defined, using polyfill");
		const globalScope = getGlobalScope();
		if (globalScope) {
			globalScope.Float16Array = f16ArrPolly;
		} else {
			console.error("No global scope found. Cannot load Float16Array polyfill.");
		}
	}
}

export function loadPolyfills() {
	loadBuffer();
	loadFloat16();
}
