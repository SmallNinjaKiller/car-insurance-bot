import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import fs from 'fs';
import { getMindeeData, getTechPassportData } from './services/mindeeService.js';
import { generatePolicyPdf } from './utils/generatePolicyPdf.js';

dotenv.config();
const bot = new Telegraf(process.env.BOT_TOKEN);
const userStates = new Map();

// Інструкції для кожного кроку
function getInstructionByStep(step) {
  const instructions = {
    awaiting_passport: '📸 Надішліть фото вашого паспорта (1 сторінка).',
    awaiting_tech_photo_1: '📸 Тепер надішліть ПЕРШЕ фото техпаспорту.',
    awaiting_tech_photo_2: '📸 Тепер надішліть ДРУГЕ фото техпаспорту.',
    awaiting_confirmation: '✅ Перевірте інформацію і натисніть "Так" або "Ні".',
    awaiting_price_confirmation: '💳 Чи приймаєте ціну 100 USD?',
    done: '✅ Страховку оформлено. Натисніть /start, щоб почати знову.',
  };
  return instructions[step] || '🔄 Будь ласка, дотримуйтесь інструкцій.';
}

// Загальні питання
const generalQuestions = {
  'що далі': true,
  'для чого': 'Ці дані потрібні для створення страхового полісу.',
  'навіщо': 'Це потрібно для заповнення страхового полісу автоматично.',
  'що буде після': 'Після підтвердження даних ви отримаєте PDF файл з вашим страховим полісом.',
};

bot.start((ctx) => {
  userStates.set(ctx.from.id, {
    step: 'awaiting_passport',
    techPhotos: [],
  });
  ctx.reply('Привіт! Надішліть фото звичайного паспорту.');
});

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId) || {};
  const photo = ctx.message.photo.at(-1);

  if (!photo) {
    return ctx.reply('❌ Не вдалося отримати фото. Спробуйте ще раз.');
  }

  const fileLink = await ctx.telegram.getFileLink(photo.file_id);

  if (userState.step === 'awaiting_passport') {
    try {
      const result = await getMindeeData(fileLink.href);
      const prediction = result?.document?.inference?.prediction;

      const givenName = prediction?.given_names?.[0]?.value || 'Не визначено';
      const surname = prediction?.surname?.value || 'Не визначено';
      const passportNumber = prediction?.id_number?.value || 'Не визначено';
      const birthDate = prediction?.birth_date?.value || 'Не визначено';

      await ctx.reply(`✅ Дані паспорту:\n- Ім'я: ${givenName}\n- Прізвище: ${surname}\n- Номер: ${passportNumber}\n- Дата нар.: ${birthDate}`);
      await ctx.reply(getInstructionByStep('awaiting_tech_photo_1'));

      userStates.set(userId, {
        step: 'awaiting_tech_photo_1',
        passport: { givenName, surname, passportNumber, birthDate },
        techPhotos: [],
      });
    } catch (err) {
      console.error(err);
      await ctx.reply('❌ Помилка при розпізнаванні паспорту. Спробуйте ще раз.');
    }
  } else if (userState.step === 'awaiting_tech_photo_1') {
    userState.techPhotos.push(fileLink.href);
    userState.step = 'awaiting_tech_photo_2';
    userStates.set(userId, userState);
    await ctx.reply(getInstructionByStep('awaiting_tech_photo_2'));
  } else if (userState.step === 'awaiting_tech_photo_2') {
    userState.techPhotos.push(fileLink.href);
    await ctx.reply('⏳ Обробляємо перше фото...');

    try {
      const frontData = await getTechPassportData(userState.techPhotos[0]);
      await ctx.reply('⏳ Обробляємо друге фото...');
      const backData = await getTechPassportData(userState.techPhotos[1]);

      const frontFields = frontData?.fields || {};
      const backFields = backData?.fields || {};

      if (!frontFields || !backFields) {
        await ctx.reply('❌ Помилка при обробці даних з техпаспорту. Перевірте фотографії.');
        return;
      }

      const techInfo = {
        car_number: frontFields.get('registration_number')?.value,
        vehicle_type: backFields.get('make')?.value,
        manufacture_year: frontFields.get('manufacture_year')?.value,
        brand_model: backFields.get('type')?.value,
        vin: backFields.get('vehicle_identification_number')?.value,
      };

      const summary = `
      ✅ Дані з техпаспорту:
      - Номер авто: ${techInfo.car_number}
      - Марка ТЗ: ${techInfo.vehicle_type}
      - Рік: ${techInfo.manufacture_year}
      - Модель: ${techInfo.brand_model}
      - VIN: ${techInfo.vin}
      `;
      await ctx.reply(summary);

      userStates.set(userId, {
        ...userState,
        step: 'awaiting_confirmation',
        techPassport: techInfo,
      });

      await ctx.reply('Чи все правильно?', {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Так', callback_data: 'yes' },
            { text: 'Ні', callback_data: 'no' }
          ]],
        },
      });
    } catch (err) {
      console.error('Помилка з техпаспортом:', err);
      await ctx.reply('❌ Помилка при обробці техпаспорту. Спробуйте ще раз.');
      userStates.set(userId, { step: 'awaiting_passport', techPhotos: [] });
    }
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  const answer = ctx.callbackQuery.data;

  if (!userState) return ctx.answerCbQuery('⚠️ Немає активної сесії.');

  if (userState.step === 'awaiting_confirmation') {
    if (answer === 'yes') {
      await ctx.answerCbQuery('✅ Дані підтверджено.');
      await ctx.reply('Ціна страховки: 100 USD. Приймаєте?', {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Так, приймаю', callback_data: 'accept_price' },
            { text: 'Ні', callback_data: 'reject_price' }
          ]]
        }
      });
      userState.step = 'awaiting_price_confirmation';
    } else {
      await ctx.answerCbQuery('❌ Почнімо спочатку.');
      userStates.set(userId, { step: 'awaiting_passport', techPhotos: [] });
      await ctx.reply(getInstructionByStep('awaiting_passport'));
    }
  } else if (userState.step === 'awaiting_price_confirmation') {
    if (answer === 'accept_price') {
      await ctx.answerCbQuery('📄 Генеруємо страховий поліс...');
      const pdfPath = await generatePolicyPdf(
        { ...userState.passport, ...userState.techPassport }, userId
      );
      await ctx.replyWithDocument({ source: fs.createReadStream(pdfPath), filename: 'policy.pdf' });
      fs.unlink(pdfPath, () => {});
      userStates.delete(userId);
    } else {
      await ctx.answerCbQuery('🚫 Скасовано.');
      await ctx.reply('Якщо захочете спробувати знову — натисніть /start.');
      userStates.delete(userId);
    }
  } else {
    await ctx.answerCbQuery('⏳ Завершіть попередній етап.');
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  const text = ctx.message.text.toLowerCase();

  for (const key in generalQuestions) {
    if (text.includes(key)) {
      const response = generalQuestions[key] === true
        ? getInstructionByStep(userState?.step)
        : generalQuestions[key];
      return ctx.reply(response);
    }
  }

  return ctx.reply(`⚠️ Я вас не зрозумів. ${getInstructionByStep(userState?.step)}`);
});

bot.launch();