import { Modal, Setting } from "obsidian";
import type WritingStyleGuardPlugin from "../../../main";
import { Violation } from "../../types";

export class PreviewModal extends Modal {
	plugin: WritingStyleGuardPlugin;
	violations: Violation[];
	label: string;
	onConfirm: (chosen: Violation[]) => Promise<void>;
	private excluded = new Set<string>();

	constructor(
		plugin: WritingStyleGuardPlugin,
		violations: Violation[],
		label: string,
		onConfirm: (chosen: Violation[]) => Promise<void>
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.violations = violations.filter((v) => v.suggestion !== undefined);
		this.label = label;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("wsg-preview-modal");
		contentEl.createEl("h3", { text: `Preview changes: ${this.label}` });
		contentEl.createEl("p", {
			text: `${this.violations.length} change${this.violations.length === 1 ? "" : "s"} will be applied. Uncheck any you don't want.`,
			cls: "wsg-muted",
		});

		const list = contentEl.createDiv({ cls: "wsg-preview-list" });
		const shown = this.violations.slice(0, 300);
		for (const v of shown) {
			const row = list.createDiv({ cls: "wsg-preview-row" });
			const checkbox = row.createEl("input", { type: "checkbox" });
			checkbox.checked = true;
			checkbox.onchange = () => {
				if (checkbox.checked) this.excluded.delete(v.id);
				else this.excluded.add(v.id);
			};
			const text = row.createDiv({ cls: "wsg-preview-text" });
			text.createDiv({ text: `${v.filePath}:${v.line}`, cls: "wsg-file-link" });
			const diff = text.createDiv({ cls: "wsg-diff" });
			diff.createEl("span", { text: v.match, cls: "wsg-diff-before" });
			diff.createEl("span", { text: " → ", cls: "wsg-muted" });
			diff.createEl("span", { text: v.suggestion ?? "", cls: "wsg-diff-after" });
		}
		if (this.violations.length > shown.length) {
			list.createDiv({
				text: `…and ${this.violations.length - shown.length} more (all still included when applying).`,
				cls: "wsg-muted",
			});
		}

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Apply changes")
					.setCta()
					.onClick(async () => {
						const chosen = this.violations.filter((v) => !this.excluded.has(v.id));
						this.close();
						await this.onConfirm(chosen);
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
