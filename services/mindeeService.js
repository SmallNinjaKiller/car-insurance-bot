import axios from 'axios';
import FormData from 'form-data';
import * as mindee from 'mindee';
import fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

/**
 * Завантажує фото з Telegram і надсилає його до Mindee для розпізнавання.
 * @param {string} fileUrl - Посилання на файл з Telegram.
 * @returns {Promise<Object>} - Результат розпізнавання від Mindee
 */
export async function getMindeeData(fileUrl) {
  try {
    if (!process.env.MINDEE_API_KEY) {
      throw new Error('❌ MINDEE_API_KEY не заданий у .env');
    }

    const fileResponse = await axios.get(fileUrl, { responseType: 'stream' });
    const formData = new FormData();
    formData.append('document', fileResponse.data, {
      filename: 'passport.jpg',
      contentType: 'image/jpeg',
    });

    const response = await axios.post(
      'https://api.mindee.net/v1/products/mindee/passport/v1/predict',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Token ${process.env.MINDEE_API_KEY}`,
        },
      }
    );

    return response.data;
  } catch (err) {
    console.error('Mindee API error:', err);
    throw new Error('Не вдалося обробити фото через Mindee API');
  }
}

/**
 * Отримує дані з техпаспорту через Mindee SDK
 * @param {string} fileUrl - Посилання на фото техпаспорту (однієї сторони)
 * @returns {Promise<Object>} - Результати розпізнавання
 */
export async function getTechPassportData(fileUrl) {
  try {
    if (!process.env.MINDEE_API_KEY) {
      throw new Error('❌ MINDEE_API_KEY не заданий у .env');
    }

    // Завантажуємо файл з Telegram у тимчасовий файл
    const fileName = `tech_passport_${uuidv4()}.jpg`;
    const filePath = join(tmpdir(), fileName);
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    await writeFile(filePath, response.data);

    // Ініціалізація Mindee SDK
    const mindeeClient = new mindee.Client({ apiKey: process.env.MINDEE_API_KEY });

    const inputSource = mindeeClient.docFromPath(filePath);

    // Створення кастомного endpoint
    const customEndpoint = mindeeClient.createEndpoint(
      'ukrainian_car_passport',
      'SmallNinjaKiller',
      '1'
    );

    // Асинхронна обробка
    const asyncApiResponse = await mindeeClient.enqueueAndParse(
      mindee.product.GeneratedV1,
      inputSource,
      { endpoint: customEndpoint }
    );

    if (!asyncApiResponse || !asyncApiResponse.document) {
      throw new Error('❌ Помилка при обробці через Mindee SDK');
    }

    // console.log(asyncApiResponse.document.toString());
    
    return asyncApiResponse.document.inference.prediction;
  } catch (err) {
    console.error('Помилка з techPassport SDK:', err.message);
    throw new Error('Не вдалося отримати дані з техпаспорту через SDK');
  }
}