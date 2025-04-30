import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Отримуємо шлях до поточного файлу
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generatePolicyPdf(data, userId) {
  return new Promise((resolve, reject) => {
    // Створюємо шлях до файлу
    const filePath = path.join(__dirname, 'policies', `${userId}_policy.pdf`);

    // Перевіряємо, чи існує директорія, і якщо не існує — створюємо її
    const directoryPath = path.dirname(filePath);
    try {
      if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true }); // Створюємо директорію
      }
    } catch (err) {
      console.error('Помилка при створенні директорії:', err);
      return reject('Не вдалося створити директорію для збереження файлу.');
    }

    const doc = new PDFDocument();

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Використовуємо стандартний шрифт
    doc.font('Helvetica'); // Це шрифт, який є за замовчуванням у PDFKit

    doc.fontSize(20).text('Car Insurance Policy', { align: 'center' });
    doc.moveDown();

    // Додаємо дані до полісу
    try {
      doc.fontSize(12).text(`Owner: ${data.owner}`);
      doc.text(`Car Number: ${data.car_number}`);
      doc.text(`Vehicle Type: ${data.vehicle_type}`);
      doc.text(`Manufacture Year: ${data.manufacture_year}`);
      doc.text(`Brand/Model: ${data.brand_model}`);
      doc.text(`VIN: ${data.vin}`);
      doc.text(`Registration Place: ${data.registration_place}`);
      doc.text(`Registration Date: ${data.registration_date}`);
      doc.text(`Expiry Date: ${data.expiry_date}`);
      doc.moveDown();
      doc.fontSize(14).text(`Price: 100 USD`, { align: 'right' });
    } catch (err) {
      console.error('Помилка при додаванні даних у PDF:', err);
      return reject('Не вдалося додати дані до PDF.');
    }

    doc.end();

    stream.on('finish', () => {
      resolve(filePath);  // Повертаємо шлях до створеного файлу
    });

    stream.on('error', (err) => {
      console.error('Помилка при записі в файл:', err);
      reject('Помилка при збереженні файлу.');
    });
  });
}