import { requestUrl } from 'obsidian';
import { GLMApiRequest, GLMApiResponse, SummaryResult } from '../types';
import { API_CONFIG, PROMPTS, buildUserPrompt } from '../constants';

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
			const apiRequest: GLMApiRequest = {
				model: API_CONFIG.MODEL,
				messages: [
					{
						role: 'system',
						content: PROMPTS.SYSTEM
					},
					{
						role: 'user',
						content: buildUserPrompt(logContent)
					}
				],
				temperature: API_CONFIG.TEMPERATURE,
				max_tokens: API_CONFIG.MAX_TOKENS
			};

			const response = await requestUrl({
				url: API_CONFIG.ENDPOINT,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify(apiRequest)
			});

			const apiResponse: GLMApiResponse = response.json;

			if (apiResponse.choices && apiResponse.choices.length > 0) {
				return {
					success: true,
					summary: apiResponse.choices[0].message.content.trim()
				};
			}

			return {
				success: false,
				error: 'APIからの応答が不正です'
			};

		} catch (error) {
			console.error('GLM API呼び出しエラー:', error);
			return {
				success: false,
				error: this.formatApiError(error)
			};
		}
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
}
