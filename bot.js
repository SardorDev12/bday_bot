import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const USERS_FILE = 'users.json';

const bot = new TelegramBot(TOKEN, { polling: true });


// Start HTTP server so Render doesn't kill your deploy
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running\n");
}).listen(PORT, () => {
  console.log("HTTP server running on port", PORT);
});

const readJSON = (file) => {
  try {
    if (!fs.existsSync(file)) return [];
    const data = fs.readFileSync(file, 'utf8');
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
};
const saveJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2));

bot.onText(/\/start/, (msg) => {
  const users = readJSON(USERS_FILE);
  if (!users.some((u) => u.chatId === msg.chat.id)) {
    users.push({
      chatId: msg.chat.id,
      name: msg.from.first_name,
      date: '00.00' || 'Unknown',
    });
    saveJSON(USERS_FILE, users);
    bot.sendMessage(msg.chat.id, '👋 Siz ro‘yxatga qo‘shildingiz!');
    bot.sendMessage(ADMIN_ID, `${msg.chat.first_name} ro'yxatdan o'tdi.`);
  } else {
    bot.sendMessage(msg.chat.id, 'Siz allaqachon ro‘yxatdasiz ✅');
  }
});

bot.onText(/\/check/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) {
    bot.sendMessage(
      msg.chat.id,
      "Ro'yxatdan o'tish uchun /start buyrug'ini yuboring."
    );
    return;
  }

  const users = readJSON(USERS_FILE);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tomorrowStr = `${dd}.${mm}`;

  const birthdayPeople = users.filter((p) => p?.date === tomorrowStr);
  if (birthdayPeople.length === 0) {
    bot.sendMessage(ADMIN_ID, "🎈 Ertaga hech kimning tug'ilgan kuni emas.");
    return;
  }

  let recipients = new Set();

  for (const b_owner of birthdayPeople) {
    const message = `🎂 Ertaga (${dd}.${mm}) <a href="tg://user?id=${b_owner.chatId}">${b_owner.name}</a>ning tug'ilgan kuni!`;
    try {
      await bot.sendMessage(GROUP_CHAT_ID, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Send error:', err.message);
    }
  }

  await bot.sendMessage(ADMIN_ID, `✅ Tug'ilgan kun xabarlari yuborildi.`);
});

