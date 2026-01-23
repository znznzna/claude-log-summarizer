import { requestUrl } from 'obsidian';
import { GLMApiRequest, GLMApiResponse, SummaryResult } from '../types';
import { API_CONFIG, CONTENT_THRESHOLDS, PROMPTS, buildUserPrompt } from '../constants';

/**
 * GLM API通信サービス
 */
export class GlmApiService {
	constructor(private apiKey: string) {}

	/**
	 * ログ内容から要約を生成
	 */
	async generateSummary(logContent: string): Promise<SummaryResult> {
		try {
			// ログが大きい場合は分割要約
			if (logContent.length > CONTENT_THRESHOLDS.MAX_CONTENT_LENGTH) {
				return await this.generateChunkedSummary(logContent);
			}

			return await this.callApi(logContent);
		} catch (error: any) {
			console.error('GLM API呼び出しエラー:', error);
			if (error.status) {
				console.error('HTTPステータス:', error.status);
			}
			if (error.response) {
				console.error('レスポンスボディ:', JSON.stringify(error.response, null, 2));
			}
			return {
				success: false,
				error: this.formatApiError(error)
			};
		}
	}

	/**
	 * 大規模ログを分割して要約（順次処理 + レートリミット対策）
	 */
	private async generateChunkedSummary(logContent: string): Promise<SummaryResult> {
		const chunkSize = CONTENT_THRESHOLDS.MAX_CONTENT_LENGTH;
		const chunks: string[] = [];

		// ログをチャンクに分割
		for (let i = 0; i < logContent.length; i += chunkSize) {
			chunks.push(logContent.slice(i, i + chunkSize));
		}

		console.log(`ログを${chunks.length}チャンクに分割（元: ${logContent.length}文字）`);

		// 順次処理（Pro用：各リクエスト間に1秒待機）
		const partialSummaries: string[] = [];
		const REQUEST_DELAY = 1000; // 1秒

		for (let i = 0; i < chunks.length; i++) {
			console.log(`チャンク ${i + 1}/${chunks.length} を要約中...`);
			const result = await this.callApiWithRetry(chunks[i], i + 1);
			if (result.success && result.summary) {
				partialSummaries.push(result.summary);
			} else {
				console.error(`チャンク ${i + 1} の要約に失敗:`, result.error);
			}

			// 次のリクエストまで待機（最後のチャンク以外）
			if (i < chunks.length - 1) {
				await this.delay(REQUEST_DELAY);
			}
		}

		if (partialSummaries.length === 0) {
			return { success: false, error: '全てのチャンクの要約に失敗しました' };
		}

		// 部分要約が1つだけならそのまま返す
		if (partialSummaries.length === 1) {
			return { success: true, summary: partialSummaries[0] };
		}

		// 複数の部分要約を統合
		console.log(`${partialSummaries.length}個の部分要約を統合中...`);
		return await this.mergeSummaries(partialSummaries);
	}

	/**
	 * 遅延用ヘルパー
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * リトライ付きAPI呼び出し（429対策）
	 */
	private async callApiWithRetry(content: string, chunkNum: number, maxRetries = 3): Promise<SummaryResult> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = await this.callApi(content, chunkNum);

			// 成功または429以外のエラーなら即座に返す
			if (result.success || !result.error?.includes('429')) {
				return result;
			}

			// 429エラーの場合、指数バックオフで待機
			const waitTime = Math.pow(2, attempt) * 5000; // 10秒, 20秒, 40秒
			console.log(`429エラー: ${waitTime / 1000}秒待機後にリトライ (${attempt}/${maxRetries})`);
			await this.delay(waitTime);
		}

		return { success: false, error: 'レートリミット超過（リトライ上限到達）' };
	}

	/**
	 * 複数の部分要約を統合
	 */
	private async mergeSummaries(summaries: string[]): Promise<SummaryResult> {
		const mergePrompt = `以下は同じ日の作業ログを複数パートに分けて要約したものです。
これらを統合して、1つの作業日報にまとめてください。

【ルール】
- 重複を排除して簡潔にまとめる
- プロジェクトごとにセクション分け
- 同じ作業は1つにまとめる
- 日本語のみ、Markdown形式

${summaries.map((s, i) => `=== パート${i + 1} ===\n${s}`).join('\n\n')}

統合した作業日報:`;

		const apiRequest: GLMApiRequest = {
			model: API_CONFIG.MODEL,
			messages: [
				{ role: 'system', content: PROMPTS.SYSTEM },
				{ role: 'user', content: mergePrompt }
			],
			temperature: API_CONFIG.TEMPERATURE,
			max_tokens: API_CONFIG.MAX_TOKENS
		};

		const requestBody = JSON.stringify(apiRequest);
		console.log('統合リクエスト送信:', { bodyLength: requestBody.length });

		const response = await this.sendRequest(requestBody);
		const apiResponse: GLMApiResponse = response.json;

		if (apiResponse.choices && apiResponse.choices.length > 0) {
			const message = apiResponse.choices[0].message;
			const rawContent = (message.content || message.reasoning_content || '').trim();
			if (!rawContent) {
				return { success: false, error: '統合APIからの応答が空です' };
			}
			return { success: true, summary: this.cleanXmlTags(rawContent) };
		}

		return { success: false, error: '統合APIからの応答が不正です' };
	}

	/**
	 * 単一チャンクをAPIで要約
	 */
	private async callApi(content: string, chunkNum?: number): Promise<SummaryResult> {
		try {
			const apiRequest: GLMApiRequest = {
				model: API_CONFIG.MODEL,
				messages: [
					{
						role: 'system',
						content: PROMPTS.SYSTEM
					},
					{
						role: 'user',
						content: buildUserPrompt(content)
					}
				],
				temperature: API_CONFIG.TEMPERATURE,
				max_tokens: API_CONFIG.MAX_TOKENS
			};

			const requestBody = JSON.stringify(apiRequest);
			console.log(`GLM API リクエスト送信${chunkNum ? ` (チャンク${chunkNum})` : ''}:`, {
				model: apiRequest.model,
				bodyLength: requestBody.length
			});

			const response = await this.sendRequest(requestBody);
			const apiResponse: GLMApiResponse = response.json;

			if (apiResponse.choices && apiResponse.choices.length > 0) {
				const message = apiResponse.choices[0].message;
				// contentが空の場合はreasoning_contentを使用
				const rawContent = (message.content || message.reasoning_content || '').trim();
				if (!rawContent) {
					return {
						success: false,
						error: 'APIからの応答が空です'
					};
				}
				return {
					success: true,
					summary: this.cleanXmlTags(rawContent)
				};
			}

			return {
				success: false,
				error: 'APIからの応答が不正です'
			};
		} catch (error: any) {
			console.error(`callApi エラー${chunkNum ? ` (チャンク${chunkNum})` : ''}:`, error);
			if (error.status) {
				console.error('HTTPステータス:', error.status);
			}
			return {
				success: false,
				error: this.formatApiError(error)
			};
		}
	}

	/**
	 * APIリクエストを送信
	 */
	private async sendRequest(body: string): Promise<any> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(`タイムアウト（${API_CONFIG.TIMEOUT / 1000}秒）`)), API_CONFIG.TIMEOUT);
		});

		const requestPromise = requestUrl({
			url: API_CONFIG.ENDPOINT,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`
			},
			body: body
		});

		return await Promise.race([requestPromise, timeoutPromise]);
	}

	/**
	 * APIエラーをフォーマット
	 */
	private formatApiError(error: any): string {
		let errorMessage = error.message || 'API呼び出しに失敗しました';
		if (error.response) {
			console.error('レスポンス詳細:', error.response);
			errorMessage += ` (詳細: ${JSON.stringify(error.response)})`;
		}
		return errorMessage;
	}

	/**
	 * XMLタグを除去してMarkdown形式に変換
	 */
	private cleanXmlTags(content: string): string {
		// ```xml ... ``` コードブロックを除去
		content = content.replace(/```xml\s*/gi, '').replace(/```\s*/g, '');

		// <summary>...</summary>で囲まれている場合、中身を抽出
		const summaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/);
		if (summaryMatch) {
			content = summaryMatch[1];
		}

		// 各XMLタグの内容をMarkdownに変換
		const tagMappings: { tag: string; heading: string }[] = [
			{ tag: 'type', heading: '' },
			{ tag: 'request', heading: '#### リクエスト' },
			{ tag: 'title', heading: '#### タイトル' },
			{ tag: 'change', heading: '#### 変更種別' },
			{ tag: 'description', heading: '' },
			{ tag: 'summary', heading: '' },
			{ tag: 'investigated', heading: '**🔍 調査内容**' },
			{ tag: 'learned', heading: '**📚 学んだこと**' },
			{ tag: 'completed', heading: '**🔧 完了した作業**' },
			{ tag: 'next_steps', heading: '**⏳ 残タスク**' },
			{ tag: 'notes', heading: '**📝 備考**' },
			{ tag: 'analysis', heading: '**📊 分析**' },
			{ tag: 'metrics', heading: '**📈 メトリクス**' },
			{ tag: 'files_modified', heading: '**📁 変更ファイル**' },
			{ tag: 'files_updated', heading: '**📁 更新ファイル**' },
			{ tag: 'files', heading: '**📁 関連ファイル**' },
			{ tag: 'tags', heading: '**🏷️ タグ**' },
			{ tag: 'added', heading: '**🆕 追加した機能**' },
			{ tag: 'fixed', heading: '**🔧 修正・改善**' },
			{ tag: 'removed', heading: '**🗑️ 削除**' },
			{ tag: 'changed', heading: '**✏️ 変更**' },
			{ tag: 'details', heading: '**📋 詳細**' },
			{ tag: 'impact', heading: '**💥 影響**' },
		];

		let result = content;
		for (const { tag, heading } of tagMappings) {
			const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
			result = result.replace(regex, (_, inner) => {
				const trimmedInner = inner.trim();
				if (!heading) {
					return trimmedInner;
				}
				const lines = trimmedInner.split('\n').map((line: string) => {
					const trimmed = line.trim();
					if (trimmed && !trimmed.startsWith('-')) {
						return `- ${trimmed}`;
					}
					return trimmed;
				}).filter((line: string) => line).join('\n');
				return `${heading}\n${lines}`;
			});
		}

		// 残りのXMLタグを除去
		result = result.replace(/<[^>]+>/g, '');

		// 連続する空行を1つにまとめる
		result = result.replace(/\n{3,}/g, '\n\n');

		return result.trim();
	}
}
