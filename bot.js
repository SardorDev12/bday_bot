import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const MONGO_URL = process.env.MONGO_URL;
const TEST_GROUP_URL = process.env.TEST_GROUP_URL;

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
  chatId: Number,
  name: {type: String, required: true},
  date: {type: String, required: true},
});

const User = mongoose.model('User', userSchema);

// --------------------
// BOT
// --------------------
const bot = new TelegramBot(TOKEN, { polling: true });

// --------------------
// SHARED BIRTHDAY CHECK FUNCTION
// --------------------
async function runBirthdayCheck() {
  const users = await User.find({ date: { $ne: '' } });

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const todayStr = `${dd}.${mm}`;

  const birthdayPeople = users.filter(u => u.date === todayStr);

  if (birthdayPeople.length === 0) {
    await bot.sendMessage(ADMIN_ID, "🎈 Bugun tug'ilgan kun yo‘q.");
    return false;
  }

  for (const p of birthdayPeople) {
    const m = `🎂 Hurmatli <a href="tg://user?id=${p.chatId}">${p.name}</a>!
🎉 Sizni bugungi tavallud ayyomingiz bilan chin qalbimizdan tabriklaymiz! 🎉  

Sizga mustahkam sog‘liq, bitmas-tuganmas omad, ezgu orzu-intilishlaringizning ro‘yobga chiqishini tilaymiz.  
Hayotingizda doimo quvonch, shodlik va yangi yutuqlar hamroh bo‘lsin.

🤝 Hurmat bilan — qadrdon hamkasblaringiz.
`;
    await bot.sendMessage(GROUP_CHAT_ID, m, { parse_mode: "HTML" });
  }

  await bot.sendMessage(ADMIN_ID, "✅ Tug'ilgan kun xabarlari yuborildi.");
  return true;
}

// --------------------
// BOT COMMANDS
// --------------------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Unknown';

  let user = await User.findOne({ chatId });

  if (!user) {
    await User.create({ chatId, name, date: '' });
    bot.sendMessage(chatId, '👋 Siz ro‘yxatga qo‘shildingiz!');
    const m = `<a href="tg://user?id=${chatId}">${name}</a> ro‘yxatga qo‘shildi.`;
    bot.sendMessage(ADMIN_ID, m, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, 'Siz allaqachon ro‘yxatdasiz.');
  }
});

bot.onText(/\/check/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await runBirthdayCheck();
});

bot.onText(/\/test/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  bot.sendMessage(GROUP_CHAT_ID, 'Hurmatli hamkasblar! Tug\'ilgan kunlar haqida eslatib turuvchi botimiz ishga tushdi. Kim ro\'yxatdan o\'tmagan bo\'lsa, @ppd_notifier_bot ga o\'tib, start buyrug\'ini bosishingizni so\'raymiz.');
  bot.sendMessage(ADMIN_ID, 'Guruhga test xabar yuborildi.');
})

// --------------------
// HTTP SERVER
// BASE URL TRIGGERS CHECK
// --------------------
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  if (req.url === "/check") {
    await runBirthdayCheck();
    res.end("Cron executed\n");
    return;
  }

  res.end("Bot is running\n");
}).listen(PORT);







