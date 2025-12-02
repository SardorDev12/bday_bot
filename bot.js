import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import http from 'http';
import dayjs from 'dayjs';
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
// MODELS
// --------------------
const userSchema = new mongoose.Schema({
  chatId: Number,
  name: { type: String, required: true },
  date: { type: String, required: true },
  type: String,
  position: String,
});

const eventSchema = new mongoose.Schema({
  title: String,
  guests: [String],
  date: String,
  time: String,
  location: String,
});

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);

// --------------------
// BOT
// --------------------
const bot = new TelegramBot(TOKEN, { polling: true });

// Event Management
const userState = {};

bot.onText(/\/add_event/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 1, data: {} };

  bot.sendMessage(chatId, 'Uchrashuv *mavzusini* kiriting:', {
    parse_mode: 'Markdown',
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId]) return;
  if (text.startsWith('/')) return;

  const state = userState[chatId];

  if (state.step === 1) {
    state.data.title = text;
    state.step = 2;
    return bot.sendMessage(
      chatId,
      '*Ishtirokchilarni* vergul bilan kiriting:',
      {
        parse_mode: 'Markdown',
      }
    );
  }

  if (state.step === 2) {
    state.data.guests = text.split(',').map((g) => g.trim());
    state.step = 3;
    return bot.sendMessage(
      chatId,
      'Uchrashuv *sanasini* kiriting (KK.OO.YYYY):',
      {
        parse_mode: 'Markdown',
      }
    );
  }

  if (state.step === 3) {
    state.data.date = text;
    state.step = 4;
    return bot.sendMessage(chatId, 'Uchrashuv *vaqtini* kiriting (SS:MM):', {
      parse_mode: 'Markdown',
    });
  }

  if (state.step === 4) {
    state.data.time = text;
    state.step = 5;
    return bot.sendMessage(
      chatId,
      'Uchrashuv *xonasi yoki formati(ONLINE, OFFLINE)* kiriting:',
      {
        parse_mode: 'Markdown',
      }
    );
  }

  if (state.step === 5) {
    state.data.location = text;

    try {
      await Event.create(state.data);
    } catch (err) {
      console.error('❌ Error saving event:', err);
      return bot.sendMessage(chatId, 'Xatolik: ucashuv saqlanmadi.');
    }

    delete userState[chatId];

    return bot.sendMessage(chatId, '✅ Uchrashuv saqlandi.');
  }
});

async function checkEvents(chat_id, halfDay = false) {
  const today = dayjs().format('DD.MM.YYYY');

  let now = new Date();
  // let formattedTime = now.toLocaleTimeString('en-US', {
  //   hour: '2-digit',
  //   minute: '2-digit',
  //   hour12: true,
  // });

  let currentHours = now.getHours(); // 0–23
  let currentMinutes = now.getMinutes();

  let currentTotalMinutes = currentHours * 60 + currentMinutes;

  let events;

  if (!halfDay) {
    events = await Event.find({ date: today });
  } else {
    const allEvents = await Event.find({ date: today });

    if (formattedTime.slice(-2) == "AM") {
      events = allEvents.filter((ev) => {
        const [h] = ev.time.split(':').map(Number);
        return h < 12;
      });
    } else {
      events = allEvents.filter((ev) => {
        const [h] = ev.time.split(':').map(Number);
        return h > 12;
      });
    }
  }

  if (!events.length) {
    await bot.sendMessage(ADMIN_ID, 'Bugun uchrashuv rejalashtirilmagan.');
    return false;
  }

  for (const ev of events) {
    const message = `📅 *Bugun uchrashuv bor!*
    *Mavzu:* ${ev.title}
    *Mehmonlar:* ${ev.guests.join(', ')}
    *Vaqt:* ${ev.time}
    *Joy:* ${ev.location}`;
    await bot.sendMessage(chat_id, message, { parse_mode: 'Markdown' });
  }

  await bot.sendMessage(ADMIN_ID, 'Uchrashuv xabarlari yuborildi.');
}

// --------------------
// SHARED BIRTHDAY CHECK FUNCTION
// --------------------
async function runBirthdayCheck(chat_id) {
  const users = await User.find({ date: { $ne: '' } });

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const todayStr = `${dd}.${mm}`;

  const birthdayPeople = users.filter((u) => u.date === todayStr);

  if (birthdayPeople.length === 0) {
    await bot.sendMessage(ADMIN_ID, "🎈 Bugun tug'ilgan kun yo‘q.");
    return false;
  }

  for (const p of birthdayPeople) {
    const m_dept = `🎂 Hurmatli <a href="tg://user?id=${p.chatId}">${p.name}</a>!
🎉 Sizni bugungi tavallud ayyomingiz bilan chin qalbimizdan tabriklaymiz! 🎉  

Sizga mustahkam sog‘liq, bitmas-tuganmas omad, ezgu orzu-intilishlaringizning ro‘yobga chiqishini tilaymiz.  
Hayotingizda doimo quvonch, shodlik va yangi yutuqlar hamroh bo‘lsin.

🤝 Hurmat bilan — qadrdon hamkasblaringiz.
`;
    const m_management = `Bugun Markaziy bank raisining ${p?.position}i ${p.name}ning tug'ilgan kuni!
🎉 Jamoa nomidan chin qalbimizdan tabriklaymiz! 🎉`;

    const m_dir = `Bugun ${p?.position} ${p?.name}ning tug'ilgan kuni!
🎉 Jamoa nomidan chin qalbimizdan tabriklaymiz! 🎉`;

    if (p?.type === 'management') {
      await bot.sendMessage(chat_id, m_management);
    } else if (p?.type === 'director') {
      await bot.sendMessage(chat_id, m_dir);
    } else {
      await bot.sendMessage(chat_id, m_dept, { parse_mode: 'HTML' });
    }
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
  await runBirthdayCheck(GROUP_CHAT_ID);
});

bot.onText(/\/test/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await runBirthdayCheck(TEST_GROUP_URL);
});

bot.onText(/\/test_events/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await checkEvents(TEST_GROUP_URL);
});

bot.onText(/\/test_events_half/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await checkEvents(TEST_GROUP_URL, true);
});

// --------------------
// HTTP SERVER
// BASE URL TRIGGERS CHECK
// --------------------
const PORT = process.env.PORT || 3000;
http
  .createServer(async (req, res) => {
    if (req.url === '/check') {
      await runBirthdayCheck(GROUP_CHAT_ID);
      res.end('Cron executed\n');
      return;
    }

    if (req.url === '/events') {
      await checkEvents(GROUP_CHAT_ID);
      res.end('Full-day events executed');
      return;
    }

    if (req.url === '/events/half') {
      await checkEvents(GROUP_CHAT_ID, true);
      res.end('Half-day events executed');
      return;
    }

    res.end('Bot is running\n');
  })
  .listen(PORT);

