import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const MONGO_URL = process.env.MONGO_URL;

// --------------------
// CONNECT MONGOOSE
// --------------------
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB via Mongoose');
  } catch (err) {
    console.error('❌ Mongoose connection error:', err);
    process.exit(1);
  }
}
connectDB();

// --------------------
// USER MODEL
// --------------------
const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  date: String,
});

const User = mongoose.model('User', userSchema);

// --------------------
// BOT
// --------------------
const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Unknown';

  let user = await User.findOne({ chatId });

  if (!user) {
    await User.create({ chatId, name, date: '' });
    bot.sendMessage(chatId, '👋 Siz ro‘yxatga qo‘shildingiz!');
    bot.sendMessage(ADMIN_ID, `${name} ro'yxatdan o'tdi.`);
  } else {
    bot.sendMessage(chatId, 'Siz allaqachon ro‘yxatdasiz.');
  }
});

bot.onText(/\/check/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;

  const users = await User.find({ date: { $ne: '' } });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tomorrowStr = `${dd}.${mm}`;

  const birthdayPeople = users.filter((u) => u.date === tomorrowStr);

  if (birthdayPeople.length === 0) {
    bot.sendMessage(ADMIN_ID, "🎈 Ertaga tug'ilgan kun yo‘q.");
    return;
  }

  for (const p of birthdayPeople) {
    const m = `🎂 Ertaga (${dd}.${mm}) <a href="tg://user?id=${p.chatId}">${p.name}</a>ning tug'ilgan kuni!`;
    await bot.sendMessage(GROUP_CHAT_ID, m, { parse_mode: 'HTML' });
  }

  bot.sendMessage(ADMIN_ID, "✅ Tug'ilgan kun xabarlari yuborildi.");
});

// --------------------
// KEEP-ALIVE SERVER
// --------------------
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('Bot is running\n')).listen(PORT);
