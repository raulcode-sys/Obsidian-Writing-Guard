import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type WritingStyleGuardPlugin from "../main";
import { HyphenationGroup, RegexRule } from "./types";
import { DEFAULT_RULES } from "./defaults";
import { detectAcronyms } from "./dictionary";
import { hashString } from "./utils";

function newId(prefix: string): string {
	return `${prefix}-${hashString(`${Date.now()}-${Math.random()}`)}`;
}

export class WritingStyleGuardSettingTab extends PluginSettingTab {
	plugin: WritingStyleGuardPlugin;

	constructor(app: App, plugin: WritingStyleGuardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("wsg-settings");

		containerEl.createEl("h2", { text: "Writing Style Guard" });
		containerEl.createEl("p", {
			text: `Rules are stored in your vault at ${this.app.vault.configDir}/style-rules.json.`,
			cls: "wsg-muted",
		});

		this.renderActions(containerEl);
		this.renderScanOptions(containerEl);
		this.renderSpelling(containerEl);
		this.renderOxfordComma(containerEl);
		this.renderHeadingCase(containerEl);
		this.renderHyphenation(containerEl);
		this.renderRegexRules(containerEl);
		this.renderDictionary(containerEl);
	}

	private async save() {
		await this.plugin.saveRules();
	}

	private renderActions(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Scan")
			.setDesc("Run a scan now, or open the dashboard for compliance scores.")
			.addButton((btn) =>
				btn
					.setButtonText("Scan vault now")
					.setCta()
					.onClick(() => this.plugin.runScan())
			)
			.addButton((btn) => btn.setButtonText("Open dashboard").onClick(() => this.plugin.activateView("wsg-report-view")));

		new Setting(containerEl)
			.setName("Reset rules to defaults")
			.setDesc("Discards all custom rules, spelling pairs, hyphenation groups, and approved terms.")
			.addButton((btn) =>
				btn.setButtonText("Reset").setWarning().onClick(async () => {
					this.plugin.rules = { ...DEFAULT_RULES };
					await this.save();
					new Notice("Style rules reset to defaults.");
					this.display();
				})
			);
	}

	private renderScanOptions(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Scan options" });

		new Setting(containerEl)
			.setName("Ignore code blocks")
			.setDesc("Skip fenced code blocks when checking spelling, hyphenation, and regex rules.")
			.addToggle((tog) =>
				tog.setValue(this.plugin.rules.ignoreCodeBlocks).onChange(async (v) => {
					this.plugin.rules.ignoreCodeBlocks = v;
					await this.save();
				})
			);

		new Setting(containerEl)
			.setName("Ignore frontmatter")
			.setDesc("Skip YAML frontmatter blocks at the top of notes.")
			.addToggle((tog) =>
				tog.setValue(this.plugin.rules.ignoreFrontmatter).onChange(async (v) => {
					this.plugin.rules.ignoreFrontmatter = v;
					await this.save();
				})
			);

		new Setting(containerEl)
			.setName("Track compliance history")
			.setDesc("Record a data point after each scan to show a trend chart on the dashboard.")
			.addToggle((tog) =>
				tog.setValue(this.plugin.rules.trackHistory).onChange(async (v) => {
					this.plugin.rules.trackHistory = v;
					await this.save();
				})
			);
	}

	private renderSpelling(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "US vs UK spelling" });

		new Setting(containerEl)
			.setName("Mode")
			.setDesc(
				'"Auto-detect" flags whichever spelling you use less often per word across the vault. "US only"/"UK only" enforce one style everywhere.'
			)
			.addDropdown((dd) =>
				dd
					.addOption("auto", "Auto-detect majority usage")
					.addOption("us", "US only")
					.addOption("uk", "UK only")
					.addOption("off", "Off")
					.setValue(this.plugin.rules.spellingMode)
					.onChange(async (v) => {
						this.plugin.rules.spellingMode = v as typeof this.plugin.rules.spellingMode;
						await this.save();
					})
			);

		const list = containerEl.createDiv({ cls: "wsg-settings-list" });
		list.createEl("div", { text: "Custom spelling pairs (added to the built-in list)", cls: "wsg-settings-list-title" });
		this.plugin.rules.customSpellingPairs.forEach((pair, idx) => {
			new Setting(list)
				.addText((t) => t.setPlaceholder("US spelling").setValue(pair.us).onChange(async (v) => {
					pair.us = v;
					await this.save();
				}))
				.addText((t) => t.setPlaceholder("UK spelling").setValue(pair.uk).onChange(async (v) => {
					pair.uk = v;
					await this.save();
				}))
				.addExtraButton((btn) =>
					btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
						this.plugin.rules.customSpellingPairs.splice(idx, 1);
						await this.save();
						this.display();
					})
				);
		});
		new Setting(list).addButton((btn) =>
			btn.setButtonText("+ Add spelling pair").onClick(async () => {
				this.plugin.rules.customSpellingPairs.push({ us: "", uk: "" });
				await this.save();
				this.display();
			})
		);
	}

	private renderOxfordComma(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Oxford comma" });
		new Setting(containerEl)
			.setName("Mode")
			.setDesc('Applies to simple 3-item lists like "A, B and C". Detection is heuristic and works best in plain prose.')
			.addDropdown((dd) =>
				dd
					.addOption("off", "Off")
					.addOption("require", "Require")
					.addOption("forbid", "Forbid")
					.setValue(this.plugin.rules.oxfordComma)
					.onChange(async (v) => {
						this.plugin.rules.oxfordComma = v as typeof this.plugin.rules.oxfordComma;
						await this.save();
					})
			);
	}

	private renderHeadingCase(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Heading capitalization" });
		new Setting(containerEl)
			.setName("Mode")
			.setDesc("Checks every Markdown heading (# ... through ######) in your notes.")
			.addDropdown((dd) =>
				dd
					.addOption("off", "Off")
					.addOption("title", "Title Case")
					.addOption("sentence", "Sentence case")
					.setValue(this.plugin.rules.headingCase)
					.onChange(async (v) => {
						this.plugin.rules.headingCase = v as typeof this.plugin.rules.headingCase;
						await this.save();
					})
			);
	}

	private renderHyphenation(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Hyphenation & term variants" });
		containerEl.createEl("p", {
			text: 'Group alternate forms of the same term (e.g. "e-mail", "email"). Leave "preferred" blank to let majority usage in the vault decide.',
			cls: "wsg-muted",
		});

		const list = containerEl.createDiv({ cls: "wsg-settings-list" });
		this.plugin.rules.hyphenationGroups.forEach((group: HyphenationGroup, idx) => {
			const row = new Setting(list)
				.addText((t) =>
					t
						.setPlaceholder("variant-one, variant-two, variant-three")
						.setValue(group.variants.join(", "))
						.onChange(async (v) => {
							group.variants = v.split(",").map((s) => s.trim()).filter(Boolean);
							await this.save();
						})
				)
				.addText((t) =>
					t
						.setPlaceholder("preferred (optional)")
						.setValue(group.preferred ?? "")
						.onChange(async (v) => {
							group.preferred = v.trim() || undefined;
							await this.save();
						})
				)
				.addToggle((tog) =>
					tog.setValue(group.enabled).onChange(async (v) => {
						group.enabled = v;
						await this.save();
					})
				)
				.addExtraButton((btn) =>
					btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
						this.plugin.rules.hyphenationGroups.splice(idx, 1);
						await this.save();
						this.display();
					})
				);
			row.settingEl.addClass("wsg-hyphen-row");
		});

		new Setting(list).addButton((btn) =>
			btn.setButtonText("+ Add variant group").onClick(async () => {
				this.plugin.rules.hyphenationGroups.push({
					id: newId("group"),
					variants: [],
					enabled: true,
				});
				await this.save();
				this.display();
			})
		);
	}

	private renderRegexRules(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Custom regex rules" });
		containerEl.createEl("p", {
			text: "Flag any pattern with a custom message. Optionally provide a replacement using $1, $2 capture-group syntax to make it auto-fixable.",
			cls: "wsg-muted",
		});

		const list = containerEl.createDiv({ cls: "wsg-settings-list" });
		this.plugin.rules.regexRules.forEach((rule: RegexRule, idx) => {
			const card = list.createDiv({ cls: "wsg-regex-card" });

			new Setting(card)
				.setName(`Rule ${idx + 1}`)
				.addToggle((tog) =>
					tog.setValue(rule.enabled).onChange(async (v) => {
						rule.enabled = v;
						await this.save();
					})
				)
				.addExtraButton((btn) =>
					btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
						this.plugin.rules.regexRules.splice(idx, 1);
						await this.save();
						this.display();
					})
				);

			new Setting(card).setName("Name").addText((t) =>
				t.setValue(rule.name).onChange(async (v) => {
					rule.name = v;
					await this.save();
				})
			);
			new Setting(card).setName("Pattern").addText((t) =>
				t.setPlaceholder("e\\.g\\.").setValue(rule.pattern).onChange(async (v) => {
					rule.pattern = v;
					await this.save();
				})
			);
			new Setting(card).setName("Flags").addText((t) =>
				t.setPlaceholder("gi").setValue(rule.flags).onChange(async (v) => {
					rule.flags = v;
					await this.save();
				})
			);
			new Setting(card).setName("Message").addText((t) =>
				t.setValue(rule.message).onChange(async (v) => {
					rule.message = v;
					await this.save();
				})
			);
			new Setting(card).setName("Replacement (optional)").addText((t) =>
				t
					.setPlaceholder("leave blank to flag only")
					.setValue(rule.replacement ?? "")
					.onChange(async (v) => {
						rule.replacement = v || undefined;
						await this.save();
					})
			);
		});

		new Setting(list).addButton((btn) =>
			btn.setButtonText("+ Add regex rule").onClick(async () => {
				this.plugin.rules.regexRules.push({
					id: newId("regex"),
					name: "New rule",
					pattern: "",
					flags: "gi",
					message: "Matches custom rule",
					enabled: true,
				});
				await this.save();
				this.display();
			})
		);
	}

	private renderDictionary(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Custom dictionary (approved terms)" });
		containerEl.createEl("p", {
			text: "Approved terms are never flagged by spelling or hyphenation rules.",
			cls: "wsg-muted",
		});

		const chipRow = containerEl.createDiv({ cls: "wsg-chip-row" });
		this.plugin.rules.approvedTerms.forEach((term, idx) => {
			const chip = chipRow.createDiv({ cls: "wsg-chip" });
			chip.createSpan({ text: term });
			const remove = chip.createSpan({ text: " ✕", cls: "wsg-chip-remove" });
			remove.onclick = async () => {
				this.plugin.rules.approvedTerms.splice(idx, 1);
				await this.save();
				this.display();
			};
		});

		let newTermValue = "";
		new Setting(containerEl)
			.setName("Add term")
			.addText((t) =>
				t.setPlaceholder("e.g. Obsidian").onChange((v) => {
					newTermValue = v;
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Add").onClick(async () => {
					const term = newTermValue.trim();
					if (!term) return;
					if (!this.plugin.rules.approvedTerms.includes(term)) {
						this.plugin.rules.approvedTerms.push(term);
						await this.save();
					}
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Auto-detect acronyms")
			.setDesc("Scans the vault for ALL-CAPS words (2-6 letters) used at least twice and lets you approve them in bulk.")
			.addButton((btn) =>
				btn.setButtonText("Scan for acronyms").onClick(async () => {
					const found = await detectAcronyms(this.app, this.plugin.rules, 2);
					if (found.length === 0) {
						new Notice("No new acronyms found.");
						return;
					}
					this.renderAcronymResults(containerEl, found);
				})
			);
	}

	private renderAcronymResults(containerEl: HTMLElement, found: { word: string; count: number }[]) {
		const existing = containerEl.querySelector(".wsg-acronym-results");
		if (existing) existing.remove();

		const resultsEl = containerEl.createDiv({ cls: "wsg-acronym-results" });
		resultsEl.createEl("div", { text: `Found ${found.length} candidate acronym(s):`, cls: "wsg-settings-list-title" });
		for (const { word, count } of found) {
			new Setting(resultsEl)
				.setName(word)
				.setDesc(`${count} occurrence${count === 1 ? "" : "s"}`)
				.addButton((btn) =>
					btn.setButtonText("Add to dictionary").onClick(async () => {
						if (!this.plugin.rules.approvedTerms.includes(word)) {
							this.plugin.rules.approvedTerms.push(word);
							await this.save();
						}
						this.display();
					})
				);
		}
	}
}
