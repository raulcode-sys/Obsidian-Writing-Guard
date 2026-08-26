export type RuleType =
	| "spelling"
	| "oxfordComma"
	| "headingCase"
	| "hyphenation"
	| "casing"
	| "regex";

export type SpellingMode = "us" | "uk" | "auto" | "off";
export type OxfordCommaMode = "require" | "forbid" | "off";
export type HeadingCaseMode = "title" | "sentence" | "off";

export interface HyphenationGroup {
	id: string;
	/** Alternative spellings/forms of the same term, e.g. ["e-mail", "email", "e mail"] */
	variants: string[];
	/** Optional forced preferred form. If empty, majority usage in the vault wins. */
	preferred?: string;
	enabled: boolean;
}

export interface RegexRule {
	id: string;
	name: string;
	pattern: string;
	flags: string;
	message: string;
	/** Optional replacement string, supports $1, $2 capture group syntax. */
	replacement?: string;
	enabled: boolean;
}

export interface StyleRules {
	rulesVersion: number;
	spellingMode: SpellingMode;
	customSpellingPairs: { us: string; uk: string }[];
	oxfordComma: OxfordCommaMode;
	headingCase: HeadingCaseMode;
	hyphenationGroups: HyphenationGroup[];
	regexRules: RegexRule[];
	approvedTerms: string[];
	ignoreCodeBlocks: boolean;
	ignoreFrontmatter: boolean;
	trackHistory: boolean;
}

export interface Violation {
	id: string;
	ruleType: RuleType;
	ruleId?: string;
	filePath: string;
	line: number;
	col: number;
	length: number;
	match: string;
	message: string;
	suggestion?: string;
	groupKey: string;
}

export interface ScanResult {
	scannedAt: number;
	filesScanned: number;
	violations: Violation[];
}

export interface InconsistencyGroup {
	key: string;
	ruleType: RuleType;
	ruleId?: string;
	description: string;
	variantCounts: Record<string, number>;
	totalOccurrences: number;
	violations: Violation[];
	suggestedWinner: string;
}

export interface HistoryPoint {
	timestamp: number;
	overallScore: number;
	perRule: Record<string, number>;
}

export interface WizardSuggestion {
	id: string;
	title: string;
	rationale: string;
	kind: "casing" | "hyphenation" | "abbreviation" | "dictionary";
	variantCounts: Record<string, number>;
	apply: () => Partial<StyleRules>;
}

export interface PluginData {
	history: HistoryPoint[];
	dismissedSuggestions: string[];
}

export interface FixOperation {
	filePath: string;
	before: string;
	after: string;
}

export interface FixBatch {
	id: string;
	timestamp: number;
	label: string;
	operations: FixOperation[];
}
