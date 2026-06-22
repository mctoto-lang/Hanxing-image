// 完整的 CSS 命名颜色映射表，避免 DOM 操作解析颜色
const CSS_COLOR_NAMES: Record<string, [number, number, number]> = {
	black: [0, 0, 0],
	white: [255, 255, 255],
	red: [255, 0, 0],
	green: [0, 128, 0],
	blue: [0, 0, 255],
	yellow: [255, 255, 0],
	cyan: [0, 255, 255],
	magenta: [255, 0, 255],
	gray: [128, 128, 128],
	grey: [128, 128, 128],
	orange: [255, 165, 0],
	purple: [128, 0, 128],
	pink: [255, 192, 203],
	brown: [165, 42, 42],
	navy: [0, 0, 128],
	teal: [0, 128, 128],
	olive: [128, 128, 0],
	maroon: [128, 0, 0],
	silver: [192, 192, 192],
	lime: [0, 255, 0],
	aqua: [0, 255, 255],
	fuchsia: [255, 0, 255],
	aliceblue: [240, 248, 255],
	antiquewhite: [250, 235, 215],
	aquamarine: [127, 255, 212],
	azure: [240, 255, 255],
	beige: [245, 245, 220],
	bisque: [255, 228, 196],
	blanchedalmond: [255, 235, 205],
	blueviolet: [138, 43, 226],
	burlywood: [222, 184, 135],
	cadetblue: [95, 158, 160],
	chartreuse: [127, 255, 0],
	chocolate: [210, 105, 30],
	coral: [255, 127, 80],
	cornflowerblue: [100, 149, 237],
	cornsilk: [255, 248, 220],
	crimson: [220, 20, 60],
	darkblue: [0, 0, 139],
	darkcyan: [0, 139, 139],
	darkgoldenrod: [184, 134, 11],
	darkgray: [169, 169, 169],
	darkgrey: [169, 169, 169],
	darkgreen: [0, 100, 0],
	darkkhaki: [189, 183, 107],
	darkmagenta: [139, 0, 139],
	darkolivegreen: [85, 107, 47],
	darkorange: [255, 140, 0],
	darkorchid: [153, 50, 204],
	darkred: [139, 0, 0],
	darksalmon: [233, 150, 122],
	darkseagreen: [143, 188, 143],
	darkslateblue: [72, 61, 139],
	darkslategray: [47, 79, 79],
	darkslategrey: [47, 79, 79],
	darkturquoise: [0, 206, 209],
	darkviolet: [148, 0, 211],
	deeppink: [255, 20, 147],
	deepskyblue: [0, 191, 255],
	dimgray: [105, 105, 105],
	dimgrey: [105, 105, 105],
	dodgerblue: [30, 144, 255],
	firebrick: [178, 34, 34],
	floralwhite: [255, 250, 240],
	forestgreen: [34, 139, 34],
	gainsboro: [220, 220, 220],
	ghostwhite: [248, 248, 255],
	gold: [255, 215, 0],
	goldenrod: [218, 165, 32],
	greenyellow: [173, 255, 47],
	honeydew: [240, 255, 240],
	hotpink: [255, 105, 180],
	indianred: [205, 92, 92],
	indigo: [75, 0, 130],
	ivory: [255, 255, 240],
	khaki: [240, 230, 140],
	lavender: [230, 230, 250],
	lavenderblush: [255, 240, 245],
	lawngreen: [124, 252, 0],
	lemonchiffon: [255, 250, 205],
	lightblue: [173, 216, 230],
	lightcoral: [240, 128, 128],
	lightcyan: [224, 255, 255],
	lightgoldenrodyellow: [250, 250, 210],
	lightgray: [211, 211, 211],
	lightgrey: [211, 211, 211],
	lightgreen: [144, 238, 144],
	lightpink: [255, 182, 193],
	lightsalmon: [255, 160, 122],
	lightseagreen: [32, 178, 170],
	lightskyblue: [135, 206, 250],
	lightslategray: [119, 136, 153],
	lightslategrey: [119, 136, 153],
	lightsteelblue: [176, 196, 222],
	lightyellow: [255, 255, 224],
	limegreen: [50, 205, 50],
	linen: [250, 240, 230],
	mediumaquamarine: [102, 205, 170],
	mediumblue: [0, 0, 205],
	mediumorchid: [186, 85, 211],
	mediumpurple: [147, 112, 219],
	mediumseagreen: [60, 179, 113],
	mediumslateblue: [123, 104, 238],
	mediumspringgreen: [0, 250, 154],
	mediumturquoise: [72, 209, 204],
	mediumvioletred: [199, 21, 133],
	midnightblue: [25, 25, 112],
	mintcream: [245, 255, 250],
	mistyrose: [255, 228, 225],
	moccasin: [255, 228, 181],
	navajowhite: [255, 222, 173],
	oldlace: [253, 245, 230],
	olivedrab: [107, 142, 35],
	orangered: [255, 69, 0],
	orchid: [218, 112, 214],
	palegoldenrod: [238, 232, 170],
	palegreen: [152, 251, 152],
	paleturquoise: [175, 238, 238],
	palevioletred: [219, 112, 147],
	papayawhip: [255, 239, 213],
	peachpuff: [255, 218, 185],
	peru: [205, 133, 63],
	plum: [221, 160, 221],
	powderblue: [176, 224, 230],
	rosybrown: [188, 143, 143],
	royalblue: [65, 105, 225],
	saddlebrown: [139, 69, 19],
	salmon: [250, 128, 114],
	sandybrown: [244, 164, 96],
	seagreen: [46, 139, 87],
	seashell: [255, 245, 238],
	sienna: [160, 82, 45],
	skyblue: [135, 206, 235],
	slateblue: [106, 90, 205],
	slategray: [112, 128, 144],
	slategrey: [112, 128, 144],
	snow: [255, 250, 250],
	springgreen: [0, 255, 127],
	steelblue: [70, 130, 180],
	tan: [210, 180, 140],
	thistle: [216, 191, 216],
	tomato: [255, 99, 71],
	turquoise: [64, 224, 208],
	violet: [238, 130, 238],
	wheat: [245, 222, 179],
	whitesmoke: [245, 245, 245],
	yellowgreen: [154, 205, 50],
};

export function hexToRgb(
	hex: string,
): { r: number; g: number; b: number } | null {
	const normalizedHex = hex.charAt(0) === "#" ? hex.substring(1) : hex;

	if (normalizedHex.length === 3) {
		const r = parseInt(normalizedHex.charAt(0) + normalizedHex.charAt(0), 16);
		const g = parseInt(normalizedHex.charAt(1) + normalizedHex.charAt(1), 16);
		const b = parseInt(normalizedHex.charAt(2) + normalizedHex.charAt(2), 16);
		return { r, g, b };
	}

	if (normalizedHex.length === 6) {
		const r = parseInt(normalizedHex.substring(0, 2), 16);
		const g = parseInt(normalizedHex.substring(2, 4), 16);
		const b = parseInt(normalizedHex.substring(4, 6), 16);
		return { r, g, b };
	}

	// 尝试从 CSS 命名颜色映射表中查找，避免 DOM 操作
	const namedColor = CSS_COLOR_NAMES[hex.toLowerCase().trim()];
	if (namedColor) {
		return { r: namedColor[0], g: namedColor[1], b: namedColor[2] };
	}

	return null;
}

export function getLuminance(rgb: { r: number; g: number; b: number }): number {
	const { r, g, b } = rgb;

	const sR = r / 255;
	const sG = g / 255;
	const sB = b / 255;

	const R = sR <= 0.03928 ? sR / 12.92 : ((sR + 0.055) / 1.055) ** 2.4;
	const G = sG <= 0.03928 ? sG / 12.92 : ((sG + 0.055) / 1.055) ** 2.4;
	const B = sB <= 0.03928 ? sB / 12.92 : ((sB + 0.055) / 1.055) ** 2.4;

	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastColor(luminance: number): string {
	return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function parseColor(
	color: string,
): { r: number; g: number; b: number } | null {
	const hexResult = hexToRgb(color);
	if (hexResult) return hexResult;

	// 从 CSS 命名颜色映射表中查找，避免 DOM 操作
	const namedColor = CSS_COLOR_NAMES[color.toLowerCase().trim()];
	if (namedColor) {
		return { r: namedColor[0], g: namedColor[1], b: namedColor[2] };
	}

	// 解析 rgb/rgba 格式
	const rgbDirectMatch = color.match(
		/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/,
	);
	if (rgbDirectMatch) {
		return {
			r: parseInt(rgbDirectMatch[1], 10),
			g: parseInt(rgbDirectMatch[2], 10),
			b: parseInt(rgbDirectMatch[3], 10),
		};
	}

	// 解析 hsl/hsla 格式
	const hslMatch = color.match(
		/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*[\d.]+)?\)/,
	);
	if (hslMatch) {
		const h = parseInt(hslMatch[1], 10) / 360;
		const s = parseInt(hslMatch[2], 10) / 100;
		const l = parseInt(hslMatch[3], 10) / 100;

		return hslToRgb(h, s, l);
	}

	return null;
}

export function hslToRgb(
	h: number,
	s: number,
	l: number,
): { r: number; g: number; b: number } {
	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l * 255;
	} else {
		const hue2rgb = (p: number, q: number, t: number): number => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		r = hue2rgb(p, q, h + 1 / 3) * 255;
		g = hue2rgb(p, q, h) * 255;
		b = hue2rgb(p, q, h - 1 / 3) * 255;
	}

	return {
		r: Math.round(r),
		g: Math.round(g),
		b: Math.round(b),
	};
}
