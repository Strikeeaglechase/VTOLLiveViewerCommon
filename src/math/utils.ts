export const deg = (rad: number): number => rad * (180 / Math.PI);
export const rad = (deg: number): number => deg * (Math.PI / 180);
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const fixed = (value: number, digits: number = 2): string => {
	const str = value.toString();
	const idx = str.indexOf(".");
	if (idx == -1) return str;
	if (digits == 0) return str.substring(0, idx);
	return str.substring(0, idx + digits + 1);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
