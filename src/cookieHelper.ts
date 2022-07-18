export function setCookie(name: string, value: string) {
	document.cookie = name + "=" + (value || "") + "; path=/";
}

export function getCookie(name: string) {
	const nameEQ = name + "=";
	const ca = document.cookie.split(';');

	for (let i = 0; i < ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) == ' ') c = c.substring(1, c.length);
		if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
	}

	return null;
}

export function eraseCookie(name: string) {
	document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}