import { Modal, Notice } from "obsidian";
import type WritingStyleGuardPlugin from "../../../main";
import { WizardSuggestion } from "../../types";

export class WizardModal extends Modal {
	plugin: WritingStyleGuardPlugin;
	suggestions: WizardSuggestion[];
	private handled = new Set<string>();

	constructor(plugin: WritingStyleGuardPlugin, suggestions: WizardSuggestion[]) {
		super(plugin.app);
		this.plugin = plugin;
		this.suggestions = suggestions;
	}

	onOpen() {
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("wsg-wizard-modal");
		contentEl.createEl("h3", { text: "Rule wizard" });
		contentEl.createEl("p", {
			text: "Suggestions based on patterns found across your vault (local frequency analysis - no external AI calls, no data leaves your machine).",
			cls: "wsg-muted",
		});

		const pending = this.suggestions.filter((s) => !this.handled.has(s.id));
		if (pending.length === 0) {
			contentEl.createEl("p", { text: "No more suggestions right now. Run a fresh scan later to find new patterns." });
			return;
		}

		for (const suggestion of pending) {
			const card = contentEl.createDiv({ cls: "wsg-wizard-card" });
			card.createEl("strong", { text: suggestion.title });
			card.createDiv({ text: suggestion.rationale, cls: "wsg-muted" });
			const actions = card.createDiv({ cls: "wsg-group-actions" });

			const dismissBtn = actions.createEl("button", { text: "Dismiss" });
			dismissBtn.onclick = async () => {
				this.handled.add(suggestion.id);
				this.plugin.pluginData.dismissedSuggestions.push(suggestion.id);
				await this.plugin.savePluginData();
				this.render();
			};

			const createBtn = actions.createEl("button", { text: "Create rule", cls: "mod-cta" });
			createBtn.onclick = async () => {
				const patch = suggestion.apply();
				Object.assign(this.plugin.rules, patch);
				await this.plugin.saveRules();
				new Notice(`Rule created: ${suggestion.title}`);
				this.handled.add(suggestion.id);
				this.render();
			};
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
