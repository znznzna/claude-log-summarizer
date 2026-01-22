import { App, TFile, moment } from 'obsidian';
import { DATE_FORMATS } from '../constants';

/**
 * Daily Note操作サービス
 */
export class DailyNoteService {
	constructor(
		private app: App,
		private dailyNotePath: string,
		private targetHeading: string
	) {}

	/**
	 * 指定したログ日付のサマリーがすでにDaily Noteに存在するかチェック
	 */
	async isSummaryExists(logDate: moment.Moment): Promise<boolean> {
		try {
			const dailyNoteFile = await this.getDailyNoteFile(logDate.clone().add(1, 'days'));
			if (!dailyNoteFile) {
				return false;
			}

			const content = await this.app.vault.read(dailyNoteFile);
			const summaryHeadingPattern = `### ${logDate.format(DATE_FORMATS.DAILY_NOTE)} 作業サマリー`;
			return content.includes(summaryHeadingPattern);

		} catch (error) {
			console.error('サマリー存在チェックエラー:', error);
			return false;
		}
	}

	/**
	 * Daily Noteに要約を書き込む
	 */
	async writeSummary(logDate: moment.Moment, summary: string): Promise<void> {
		const dailyNoteDate = logDate.clone().add(1, 'days');
		const dailyNoteFileName = `${dailyNoteDate.format(DATE_FORMATS.DAILY_NOTE)}.md`;
		const dailyNotePath = `${this.dailyNotePath}/${dailyNoteFileName}`;

		let dailyNoteFile = await this.getDailyNoteFile(dailyNoteDate);
		let content = '';

		if (!dailyNoteFile) {
			dailyNoteFile = await this.createDailyNote(dailyNotePath);
		} else {
			content = await this.app.vault.read(dailyNoteFile);
		}

		const summarySection = this.buildSummarySection(logDate, summary);
		const newContent = this.insertSummary(content, summarySection);

		await this.app.vault.modify(dailyNoteFile, newContent);
	}

	/**
	 * Daily Noteファイルを取得
	 */
	private async getDailyNoteFile(date: moment.Moment): Promise<TFile | null> {
		const fileName = `${date.format(DATE_FORMATS.DAILY_NOTE)}.md`;
		const filePath = `${this.dailyNotePath}/${fileName}`;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			return file;
		}
		return null;
	}

	/**
	 * Daily Noteを新規作成
	 */
	private async createDailyNote(filePath: string): Promise<TFile> {
		const folder = this.app.vault.getAbstractFileByPath(this.dailyNotePath);
		if (!folder) {
			await this.app.vault.createFolder(this.dailyNotePath);
		}
		return await this.app.vault.create(filePath, '');
	}

	/**
	 * サマリーセクションを構築
	 */
	private buildSummarySection(logDate: moment.Moment, summary: string): string {
		return `\n### ${logDate.format(DATE_FORMATS.DAILY_NOTE)} 作業サマリー\n\n${summary}\n`;
	}

	/**
	 * サマリーをコンテンツに挿入
	 */
	private insertSummary(content: string, summarySection: string): string {
		const headingPattern = new RegExp(
			`^${this.targetHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
			'm'
		);

		if (headingPattern.test(content)) {
			return content.replace(headingPattern, (match) => `${match}${summarySection}`);
		}

		if (content.trim() === '') {
			return `${this.targetHeading}${summarySection}`;
		}
		return `${content}\n\n${this.targetHeading}${summarySection}`;
	}

	/**
	 * Daily Note作成を監視するためのパターンを取得
	 */
	getDailyNotePattern(): RegExp {
		return new RegExp(`^${this.dailyNotePath}/\\d{4}-\\d{2}-\\d{2}\\.md$`);
	}
}
