import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const MONGO_URL = process.env.MONGO_URL;

mongoose
  .connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to DB'))
  .catch((err) => console.error('DB error', err));

const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  date: String,
});

const User = new mongoose.model('User', userSchema);

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Unknown';

  let user = await User.findOne({ chatId });

  if (!user) {
    user = new User({ chatId, name, date: '' });
    await user.save();
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

  const users = await User.find({ date: { $ne: '' } });

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

const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running\n');
  })
  .listen(PORT, () => console.log('🌐 Server on', PORT));
