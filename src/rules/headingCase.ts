import { HeadingCaseMode } from "../types";
import { RuleCheckResult } from "./oxfordComma";
import { sentenceCase, titleCase } from "../utils";

export interface HeadingViolation {
	line: number;
	col: number;
	length: number;
	message: string;
	suggestion: string;
	matchedText: string;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;

export function checkHeadingCase(
	lines: string[],
	masked: boolean[],
	mode: HeadingCaseMode
): RuleCheckResult<HeadingViolation> {
	const violations: HeadingViolation[] = [];
	let totalChecked = 0;
	if (mode === "off") return { violations, totalChecked };

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		const m = line.match(HEADING_PATTERN);
		if (!m) continue;
		totalChecked++;
		const hashes = m[1];
		const text = m[2];
		const expected = mode === "title" ? titleCase(text) : sentenceCase(text);
		if (expected !== text) {
			violations.push({
				line: lineIdx + 1,
				col: hashes.length + 1,
				length: text.length,
				message:
					mode === "title"
						? `Heading should use Title Case: "${expected}"`
						: `Heading should use Sentence case: "${expected}"`,
				suggestion: expected,
				matchedText: text,
			});
		}
	}

	return { violations, totalChecked };
}
