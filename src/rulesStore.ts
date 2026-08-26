import { App } from "obsidian";
import { StyleRules } from "./types";
import { DEFAULT_RULES, RULES_FILE_NAME } from "./defaults";

function rulesPath(app: App): string {
	return `${app.vault.configDir}/${RULES_FILE_NAME}`;
}

export async function loadRules(app: App): Promise<StyleRules> {
	const path = rulesPath(app);
	const exists = await app.vault.adapter.exists(path);
	if (!exists) {
		await saveRules(app, DEFAULT_RULES);
		return { ...DEFAULT_RULES };
	}
	try {
		const raw = await app.vault.adapter.read(path);
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_RULES, ...parsed };
	} catch (e) {
		console.error("Writing Style Guard: failed to parse style-rules.json, falling back to defaults.", e);
		return { ...DEFAULT_RULES };
	}
}

export async function saveRules(app: App, rules: StyleRules): Promise<void> {
	const path = rulesPath(app);
	await app.vault.adapter.write(path, JSON.stringify(rules, null, "\t"));
}
