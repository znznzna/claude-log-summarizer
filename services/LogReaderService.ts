import { App, TFile, moment } from 'obsidian';
import { DATE_FORMATS, CONTENT_THRESHOLDS } from '../constants';

export interface LogReadResult {
	success: boolean;
	content?: string;
	error?: string;
}

/**
 * ログファイル読み取りサービス
 */
export class LogReaderService {
	constructor(private app: App, private logFilePath: string) {}

	/**
	 * 指定した日付のログファイルを読み取る
	 */
	async readLogFile(date: moment.Moment): Promise<LogReadResult> {
		try {
			const logFileName = `${date.format(DATE_FORMATS.LOG_FILE)}.md`;
			const logFilePath = `${this.logFilePath}/${logFileName}`;

			const file = this.app.vault.getAbstractFileByPath(logFilePath);

			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					error: `ログファイルが見つかりません: ${logFilePath}`
				};
			}

			const content = await this.app.vault.read(file);
			return { success: true, content };

		} catch (error) {
			console.error('ログファイル読み取りエラー:', error);
			return {
				success: false,
				error: `ログファイル読み取りに失敗: ${error.message}`
			};
		}
	}

	/**
	 * ログ内容が要約対象として有効かチェック
	 */
	isValidContent(content: string): boolean {
		const contentWithoutHeadings = content.replace(/^#.*$/gm, '').trim();
		return contentWithoutHeadings.length >= CONTENT_THRESHOLDS.MIN_CONTENT_LENGTH;
	}

	/**
	 * 要約不可の理由を取得
	 */
	getInvalidContentReason(content: string): string {
		const contentWithoutHeadings = content.replace(/^#.*$/gm, '').trim();
		return `要約する内容がありません（文字数: ${contentWithoutHeadings.length}）`;
	}
}
