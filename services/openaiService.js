import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Перевірка наявності API ключа
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY не вказано в .env файлі');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
});

/**
 * Надсилає повідомлення до OpenAI і повертає відповідь.
 * @param {string} message - Текст користувача.
 * @returns {Promise<string>} - Відповідь OpenAI.
 */
export const getOpenAIResponse = async (message) => {
  try {
    // Перевірка доступності моделі перед запитом
    const models = await openai.models.list();
    const modelExists = models.data.some(model => model.id === 'gpt-3.5-turbo');
    if (!modelExists) {
      throw new Error('Модель gpt-3.5-turbo недоступна.');
    }

    // Запит до OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
    });

    // Повертаємо відповідь
    return response.choices?.[0]?.message?.content?.trim() || 'Відповідь була порожньою.';
  } catch (error) {
    // Логування помилки з детальною інформацією
    console.error('OpenAI API error:', {
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Повертаємо корисне повідомлення для користувача
    if (error.response?.status === 429) {
      return 'Досягнуто ліміту запитів до API. Спробуйте пізніше.';
    }

    return 'Помилка при зверненні до OpenAI. Спробуйте пізніше.';
  }
};