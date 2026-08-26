import { OxfordCommaMode } from "../types";

export interface RuleCheckResult<T> {
	violations: T[];
	totalChecked: number;
}

export interface OxfordViolation {
	line: number;
	col: number;
	length: number;
	message: string;
	suggestion: string;
	matchedText: string;
}

// Matches simple 3-item lists: "A, B and C" / "A, B, and C" / "A, B or C" / "A, B, or C".
// Uses the `d` (indices) flag, supported by the modern Chromium/V8 runtime Obsidian ships,
// to get exact substring positions of the optional comma for precise fix/removal.
const LIST_PATTERN = /\b([A-Za-z][\w'-]*)\s*,\s*([A-Za-z][\w'-]*)(\s*,)?\s+(and|or)\s+([A-Za-z][\w'-]*)\b/gd;

export function checkOxfordComma(
	lines: string[],
	masked: boolean[],
	mode: OxfordCommaMode
): RuleCheckResult<OxfordViolation> {
	const violations: OxfordViolation[] = [];
	let totalChecked = 0;
	if (mode === "off") return { violations, totalChecked };

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		LIST_PATTERN.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = LIST_PATTERN.exec(line)) !== null) {
			totalChecked++;
			// @ts-ignore - `indices` from the `d` flag isn't in the default lib types.
			const indices: Array<[number, number]> | undefined = (m as any).indices;
			const commaGroup = m[3];
			const hasComma = !!commaGroup && commaGroup.includes(",");

			if (mode === "require" && !hasComma) {
				// Insert point: right after the second item (end of capture group 2).
				const g2End = indices ? indices[2][1] : m.index + m[1].length + 2 + m[2].length;
				violations.push({
					line: lineIdx + 1,
					col: g2End,
					length: 0,
					message: `Missing Oxford comma before "${m[4]}"`,
					suggestion: ",",
					matchedText: m[0],
				});
			} else if (mode === "forbid" && hasComma && indices) {
				const commaGroupStart = indices[3][0];
				const commaOffsetInGroup = commaGroup!.indexOf(",");
				const commaPos = commaGroupStart + commaOffsetInGroup;
				violations.push({
					line: lineIdx + 1,
					col: commaPos,
					length: 1,
					message: `Unexpected Oxford comma before "${m[4]}"`,
					suggestion: "",
					matchedText: ",",
				});
			}
		}
	}

	return { violations, totalChecked };
}
