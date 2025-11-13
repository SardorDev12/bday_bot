import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const CARD_OWNER = process.env.CARD_OWNER
const CARD_NUMBER = process.env.CARD_NUMBER
const USERS_FILE = "users.json";
const BIRTHDAYS_FILE = "birthdays.json";

const bot = new TelegramBot(TOKEN, { polling: true });

const readJSON = (file) => {
  try {
    if (!fs.existsSync(file)) return [];
    const data = fs.readFileSync(file, "utf8");
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
};
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

bot.onText(/\/start/, (msg) => {

  const users = readJSON(USERS_FILE);
  if (!users.some((u) => u.chatId === msg.chat.id)) {
    users.push({ chatId: msg.chat.id, name: msg.from.first_name || "Unknown" });
    saveJSON(USERS_FILE, users);
    bot.sendMessage(msg.chat.id, "👋 Siz ro‘yxatga qo‘shildingiz!");
    bot.sendMessage(ADMIN_ID, `${msg.chat.first_name} ro'yxatdan o'tdi.`);
  } else {
    bot.sendMessage(msg.chat.id, "Siz allaqachon ro‘yxatdasiz ✅");
  }
});

bot.onText(/\/check/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "Ro'yxatdan o'tish uchun /start buyrug'ini yuboring.");
    return;
  }

  const birthdays = readJSON(BIRTHDAYS_FILE);
  const users = readJSON(USERS_FILE);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const tomorrowStr = `${dd}.${mm}`;

  const birthdayPeople = birthdays.filter((p) => p.date === tomorrowStr);
  if (birthdayPeople.length === 0) {
    bot.sendMessage(ADMIN_ID, "🎈 Ertaga hech kimning tug'ilgan kuni emas.");
    return;
  }

  let recipients = new Set();

  for (const b_owner of birthdayPeople) {
    const message = `🎂 Ertaga (${dd}.${mm}) <a href="tg://user?id=${b_owner.chatId}">${b_owner.name}</a>ning tug'ilgan kuni! 🎉 
Shu munosabat bilan 101 ming so'mdan yig'yapmiz.
Karta raqam - ${CARD_NUMBER} (HABIBULLOH ALIMATOV). 
Iltimos, screenshotni <a href="tg://user?id=${CARD_OWNER}">menga</a> yuboring.`;
    for (const user of users) {
      const isBirthdayOwner = birthdayPeople.some((b) => b.chatId === user.chatId);
      if (!isBirthdayOwner) {
        try {
          await bot.sendMessage(user.chatId, message, { parse_mode: "HTML" });
          recipients.add(user.chatId);
          console.log(`✅ Sent to ${user.name}`);
        } catch (err) {
          console.error(`❌ Failed to send to ${user.name}: ${err.message}`);
        }
      }
    }
}

  await bot.sendMessage(ADMIN_ID, `✅ Tug'ilgan kun xabari ${recipients.size} ta foydalanuvchiga yuborildi.`);
});
