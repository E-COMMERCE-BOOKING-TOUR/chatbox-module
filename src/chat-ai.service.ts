import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface AiResponse {
    content: string;
    shouldEscalate: boolean;
}

@Injectable()
export class ChatAiService {
    private readonly aiServiceUrl: string;

    constructor(private readonly configService: ConfigService) {
        const host = this.configService.get<string>('AI_SERVICE_HOST') || 'python-ai-service';
        const port = this.configService.get<string>('AI_SERVICE_PORT') || '8000';
        this.aiServiceUrl = `http://${host}:${port}/v1/chat/completions`;
    }

    async getAiResponse(history: { role: string; content: string }[], content: string): Promise<AiResponse> {
        try {
            const response = await axios.post(this.aiServiceUrl, {
                messages: [...history, { role: 'user', content }],
            }, { timeout: 30000 });

            const aiContent = response.data.choices[0].message.content;
            const shouldEscalate = response.data.should_escalate === true;

            return { content: aiContent, shouldEscalate };
        } catch (error) {
            console.error('AI Service Error:', error.message);
            return {
                content: "Xin lỗi, tôi đang gặp chút sự cố kỹ thuật. Tôi sẽ quay lại hỗ trợ bạn ngay!",
                shouldEscalate: true, // Escalate on error
            };
        }
    }
}
