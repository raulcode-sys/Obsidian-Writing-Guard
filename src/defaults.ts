import { StyleRules } from "./types";

export const DEFAULT_RULES: StyleRules = {
	rulesVersion: 1,
	spellingMode: "auto",
	customSpellingPairs: [],
	oxfordComma: "off",
	headingCase: "off",
	hyphenationGroups: [
		{
			id: "email",
			variants: ["e-mail", "email"],
			enabled: true,
		},
		{
			id: "wifi",
			variants: ["wi-fi", "wifi", "WiFi", "Wi-Fi"],
			enabled: true,
		},
		{
			id: "online",
			variants: ["on-line", "online"],
			enabled: true,
		},
	],
	regexRules: [],
	approvedTerms: ["Obsidian"],
	ignoreCodeBlocks: true,
	ignoreFrontmatter: true,
	trackHistory: true,
};

export const RULES_FILE_NAME = "style-rules.json";
