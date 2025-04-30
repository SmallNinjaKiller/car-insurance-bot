import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { getMindeeData } from './services/mindeeService.js';
import { generatePolicyPdf } from './utils/generatePolicyPdf.js';
import fs from 'fs';

dotenv.config();
const bot = new Telegraf(process.env.BOT_TOKEN);
const userStates = new Map();

bot.start((ctx) => {
  userStates.set(ctx.from.id, { step: 'awaiting_passport' });
  ctx.reply('Привіт! Я бот для допомоги з покупкою страховки для авто. Надішліть фото паспорту (звичайного паспорту, не техпаспорту).');
});

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId) || {};
  const photo = ctx.message.photo.at(-1);

  if (!photo) {
    await ctx.reply('❌ Не вдалося отримати фото. Спробуйте надіслати фото знову.');
    return;
  }

  try {
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    if (userState.step === 'awaiting_passport') {
      try {
        const result = await getMindeeData(fileLink.href);
        const prediction = result?.document?.inference?.prediction;

        if (prediction) {
          const givenName = prediction.given_names?.[0]?.value || 'Не визначено';
          const surname = prediction.surname?.value || 'Не визначено';
          const passportNumber = prediction.id_number?.value || 'Не визначено';
          const birthDate = prediction.birth_date?.value || 'Не визначено';

          const message = `
✅ Розпізнані дані з паспорту:
- Ім'я: ${givenName}
- Прізвище: ${surname}
- Номер паспорта: ${passportNumber}
- Дата народження: ${birthDate}
          `;

          await ctx.reply(message);
          await ctx.reply('Тепер, будь ласка, надішліть фото технічного паспорту.');
          userStates.set(userId, {
            step: 'awaiting_tech_passport',
            passport: { givenName, surname, passportNumber, birthDate }
          });
        } else {
          await ctx.reply('❌ Не вдалося розпізнати паспорт. Спробуйте надіслати його ще раз.');
        }
      } catch (err) {
        console.error('Помилка при обробці паспорту:', err);
        await ctx.reply('⚠️ Помилка при розпізнаванні паспорту. Спробуйте ще раз пізніше.');
      }
    } else if (userState.step === 'awaiting_tech_passport') {
      const mock = {
        owner: 'BOHDAN HOROSHKO',
        car_number: 'AA2425TO',
        registration_date: '2022-07-25',
        expiry_date: '2026-07-25',
        vehicle_type: 'B2',
        manufacture_year: '2018',
        brand_model: 'HYUNDAI ELANTRA',
        vin: 'KMHD841FBJU634304',
        registration_place: 'Kyiv',
      };

      const message = `
✅ Розпізнані дані з технічного паспорту:
- Власник: ${mock.owner}
- Номер авто: ${mock.car_number}
- Тип ТЗ: ${mock.vehicle_type}
- Рік випуску: ${mock.manufacture_year}
- Марка, модель: ${mock.brand_model}
- VIN: ${mock.vin}
- Місце реєстрації: ${mock.registration_place}
- Дата реєстрації: ${mock.registration_date}
- Термін дії: ${mock.expiry_date}
      `;

      await ctx.reply(message);
      await ctx.reply('Чи все правильно введено?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Так', callback_data: 'yes' }, { text: 'Ні', callback_data: 'no' }],
          ],
        },
      });

      userStates.set(userId, {
        ...userState,
        step: 'awaiting_confirmation',
        techPassport: mock
      });
    } else {
      await ctx.reply('🔄 Будь ласка, почніть з команди /start.');
    }
  } catch (err) {
    console.error('Помилка при обробці фото:', err);
    await ctx.reply('❌ Виникла помилка. Спробуйте ще раз пізніше.');
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId) || {};
  const answer = ctx.callbackQuery.data;

  try {
    if (userState.step === 'awaiting_confirmation') {
      if (answer === 'yes') {
        await ctx.answerCbQuery('✅ Дані підтверджено');
        await ctx.reply('Ціна страховки: 100 USD. Приймаєте?');
        await ctx.reply('Оберіть опцію:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Так, приймаю', callback_data: 'accept_price' }, { text: 'Ні', callback_data: 'reject_price' }],
            ],
          },
        });
        userStates.set(userId, { ...userState, step: 'awaiting_price_confirmation' });
      } else {
        await ctx.answerCbQuery('❌ Будь ласка, почнімо спочатку.');
        await ctx.reply('Надішліть фото паспорту ще раз.');
        userStates.set(userId, { step: 'awaiting_passport' });
      }
    } else if (userState.step === 'awaiting_price_confirmation') {
      if (answer === 'accept_price') {
        await ctx.answerCbQuery('✅ Дякуємо за згоду!');
        const pdfPath = await generatePolicyPdf({
          ...userState.passport,
          ...userState.techPassport
        }, userId);

        await ctx.reply('Ваш страховий поліс сформовано. Надсилаю файл...');
        await ctx.replyWithDocument({ source: fs.createReadStream(pdfPath), filename: 'policy.pdf' });
        userStates.delete(userId);
        fs.unlink(pdfPath, () => {});
      } else {
        await ctx.answerCbQuery('💬 На жаль, ціна фіксована. Якщо передумаєте — напишіть знову.');
        await ctx.reply('💡 Якщо хочете спробувати ще раз — надішліть /start.');
        userStates.delete(userId);
      }
    } else {
      await ctx.answerCbQuery('⏳ Завершіть попередній етап.');
    }
  } catch (err) {
    console.error('Помилка при обробці callback query:', err);
    await ctx.answerCbQuery('❌ Виникла помилка при обробці вашого запиту.');
  }
});

bot.launch();