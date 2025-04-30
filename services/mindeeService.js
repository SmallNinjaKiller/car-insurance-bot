import axios from 'axios';
import FormData from 'form-data';

/**
 * Завантажує фото з Telegram і надсилає його до Mindee для розпізнавання.
 * @param {string} fileUrl - Посилання на файл з Telegram.
 * @returns {Promise<Object>} - Результат розпізнавання від Mindee
 */
export async function getMindeeData(fileUrl) {
  try {
    // Перевірка наявності ключа
    if (!process.env.MINDEE_API_KEY) {
      throw new Error('❌ MINDEE_API_KEY не заданий у .env');
    }

    // Завантажуємо фото як потік
    let fileResponse;
    try {
      fileResponse = await axios.get(fileUrl, { responseType: 'stream' });
    } catch (err) {
      console.error('Помилка при завантаженні файлу з Telegram:', err.message);
      throw new Error('Не вдалося завантажити файл з Telegram');
    }

    const formData = new FormData();
    formData.append('document', fileResponse.data, {
      filename: 'passport.jpg',
      contentType: 'image/jpeg',
    });

    // Надсилаємо документ до Mindee
    let response;
    try {
      response = await axios.post(
        'https://api.mindee.net/v1/products/mindee/passport/v1/predict',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Token ${process.env.MINDEE_API_KEY}`,
          },
        }
      );
    } catch (err) {
      console.error('Помилка при надсиланні запиту до Mindee API:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      throw new Error('Помилка при розпізнаванні зображення через Mindee API');
    }

    return response.data;
  } catch (err) {
    console.error('Mindee API error:', err);
    throw new Error('Не вдалося обробити фото через Mindee API');
  }
}