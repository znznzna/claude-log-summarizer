import { App, Modal, Setting, moment } from 'obsidian';
import { DATE_FORMATS } from '../constants';

/**
 * 日付入力モーダル
 */
export class DateInputModal extends Modal {
	private result: string;
	private onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		const yesterday = moment().subtract(1, 'days').format(DATE_FORMATS.DAILY_NOTE);

		contentEl.createEl('h2', { text: '日付を指定してください' });

		new Setting(contentEl)
			.setName('対象日付')
			.setDesc('ログを要約する日付（YYYY-MM-DD形式）')
			.addText((text) =>
				text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(yesterday)
					.onChange((value) => {
						this.result = value;
					})
			);
		this.result = yesterday;

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('実行')
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.result);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText('キャンセル')
					.onClick(() => {
						this.close();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
