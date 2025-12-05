import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import http from 'http';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID);
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const MONGO_URL = process.env.MONGO_URL;
const TEST_GROUP_URL = process.env.TEST_GROUP_URL;
const EVENT_MANAGER_ID = String(process.env.EVENT_MANAGER_ID);

// --------------------
// CONNECT MONGOOSE
// --------------------
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  }
}
connectDB();

// --------------------
// MODELS
// --------------------
const userSchema = new mongoose.Schema({
  chatId: Number,
  name: String,
  date: String,
  type: String,
  position: String,
});

const eventSchema = new mongoose.Schema({
  title: String,
  guests: [String],
  date: String,
  time: String,
  type: String,
  recurring: Boolean,
  endDate: String,
  location: String,
});

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);

// --------------------
// BOT
// --------------------
const bot = new TelegramBot(TOKEN, { polling: true });

// STATE
const userState = {};
let allowedIds = [];

// --------------------
// LOAD ALLOWED USERS
// --------------------
async function loadAllowedUsers() {
  const users = await User.find({
    date: { $ne: "", $ne: "00.00" }
  });

  allowedIds = users.map(u => String(u.chatId));
  console.log("Allowed IDs:", allowedIds);
}

// Load at startup
loadAllowedUsers();

// --------------------
// ADD EVENT COMMAND
// --------------------
bot.onText(/^\/add_event$/, async (msg) => {
  const chatId = String(msg.chat.id);

  await loadAllowedUsers();

  if (!allowedIds.includes(chatId)) {
    return bot.sendMessage(chatId, "❌ Sizga uchrashuv qo‘shishga ruxsat berilmagan.");
  }

  if (chatId !== ADMIN_ID && chatId !== EVENT_MANAGER_ID) return;

  userState[chatId] = { step: 1, data: {} };

  bot.sendMessage(chatId, 'Uchrashuv *mavzusini* kiriting:', {
    parse_mode: 'Markdown',
  });
});

// --------------------
// MESSAGE HANDLER
// --------------------
bot.on('message', async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text;

  if (!userState[chatId]) return;

  if (text.startsWith('/') && userState[chatId].step !== 9) return;

  const state = userState[chatId];

  // Step 1
  if (state.step === 1) {
    state.data.title = text;
    state.step = 2;
    return bot.sendMessage(chatId, '*Ishtirokchilarni* vergul bilan kiriting:', { parse_mode: 'Markdown' });
  }

  // Step 2
  if (state.step === 2) {
    state.data.guests = text.split(',').map(g => g.trim());
    state.step = 3;
    return bot.sendMessage(chatId, 'Uchrashuv *sanasini* kiriting (DD.MM.YYYY):', { parse_mode: 'Markdown' });
  }

  // Step 3
  if (state.step === 3) {
    const isValid = /^\d{2}\.\d{2}\.\d{4}$/.test(text);
    if (!isValid) return bot.sendMessage(chatId, "❌ Sana noto‘g‘ri! Masalan: 03.12.2025");

    state.data.date = text;
    state.step = 4;
    return bot.sendMessage(chatId, 'Uchrashuv *vaqtini* kiriting (HH:MM):', { parse_mode: 'Markdown' });
  }

  // Step 4
  if (state.step === 4) {
    state.data.time = text;
    state.step = 5;
    return bot.sendMessage(chatId, 'Uchrashuv *takroriymi?* (1 = Ha, 0 = Yo‘q):', { parse_mode: 'Markdown' });
  }

  // Step 5
  if (state.step === 5) {
    state.data.recurring = text.trim() === "1";
    state.step = state.data.recurring ? 6 : 7;

    return bot.sendMessage(chatId,
      state.data.recurring
        ? 'Uchrashuv *yakuniy sanasini* kiriting (DD.MM.YYYY):'
        : 'Uchrashuv *turini* kiriting (PM, DATA, TRANSFORMATION):',
      { parse_mode: 'Markdown' }
    );
  }

  // Step 6
  if (state.step === 6) {
    state.data.endDate = text;
    state.step = 7;
    return bot.sendMessage(chatId, 'Uchrashuv *turini* kiriting:', { parse_mode: 'Markdown' });
  }

  // Step 7
  if (state.step === 7) {
    state.data.type = text;
    state.step = 8;
    return bot.sendMessage(chatId, 'Uchrashuv *manzilini* kiriting:', { parse_mode: 'Markdown' });
  }

  // Step 8
  if (state.step === 8) {
    state.data.location = text;
    state.step = 9;

    const d = state.data;

    const preview = `
📌 *Ma'lumotlarni tasdiqlaysizmi?*

*Mavzu:* ${d.title}
*Ishtirokchilar:* ${d.guests.join(', ')}
*Sanasi:* ${d.date}
*Vaqti:* ${d.time}
*Joy:* ${d.location}
${d.recurring ? "*Takrorlanadi:* Ha" : "*Takrorlanadi:* Yo‘q"}
${d.endDate ? `*Tugash sanasi:* ${d.endDate}` : ""}

❌ Bekor qilish: /cancel  
✅ Tasdiqlash: /confirm
`;

    return bot.sendMessage(chatId, preview, { parse_mode: 'Markdown' });
  }

  // CONFIRM / CANCEL
  if (state.step === 9) {
    if (text === "/cancel") {
      delete userState[chatId];
      return bot.sendMessage(chatId, "❌ Bekor qilindi.");
    }

    if (text === "/confirm") {
      await Event.create(state.data);
      delete userState[chatId];
      return bot.sendMessage(chatId, "✅ Uchrashuv saqlandi!");
    }

    return bot.sendMessage(chatId, "❗ Iltimos, /confirm yoki /cancel yuboring.");
  }
});

// --------------------
// CHECK EVENTS
// --------------------
async function checkEvents(chat_id, current_chat, halfDay = false) {
  const today = dayjs().format('DD.MM.YYYY');
  const now = new Date();
  const hour = now.getHours();

  const baseQuery = {
    $or: [
      { date: today },
      {
        recurring: true,
        date: { $lte: today },
        endDate: { $gte: today }
      }
    ]
  };

  let events = await Event.find(baseQuery);

  if (halfDay) {
    events = events.filter(ev => {
      if (!ev.time) return false;
      const h = Number(ev.time.split(":")[0]);
      return hour < 14 ? h < 14 : h >= 14;
    });
  }

  if (!events.length) {
    await bot.sendMessage(current_chat, "📭 Bugun uchrashuv yo‘q.");
    return;
  }

  for (const ev of events) {
    const msg = `
📅 *Bugun uchrashuv bor!*
*Mavzu:* ${ev.title}
*Ishtirokchilar:* ${ev.guests.join(', ')}
*Sana:* ${ev.date}
*Vaqt:* ${ev.time}
*Joy:* ${ev.location}
${ev.recurring ? "*Takrorlanadi:* Ha" : "*Takrorlanadi:* Yo‘q"}
${ev.endDate ? `*Tugash sanasi:* ${ev.endDate}` : ""}
`;
    await bot.sendMessage(chat_id, msg, { parse_mode: 'Markdown' });
  }

  await bot.sendMessage(current_chat, "📨 Xabar yuborildi.");
}

// --------------------
// COMMANDS
// --------------------
bot.onText(/^\/check_events$/, (msg) => {
  const chatId = String(msg.chat.id);
  if (!allowedIds.includes(chatId)) return;
  checkEvents(GROUP_CHAT_ID, msg.chat.id);
});

bot.onText(/^\/check_halfday_events$/, (msg) => {
  const chatId = String(msg.chat.id);
  if (!allowedIds.includes(chatId)) return;
  checkEvents(GROUP_CHAT_ID, msg.chat.id, true);
});

// --------------------
// HTTP KEEP-ALIVE
// --------------------
http.createServer((req, res) => {
 if (req.url === '/check') {
      await runBirthdayCheck(GROUP_CHAT_ID);
      res.end('Cron executed\n');
      return;
    }

    if (req.url === '/events') {
      await checkEvents(GROUP_CHAT_ID, ADMIN_ID);
      res.end('Full-day events executed');
      return;
    }

    if (req.url === '/events/half') {
      await checkEvents(GROUP_CHAT_ID, ADMIN_ID, true);
      res.end('Half-day events executed');
      return;
    }

    res.end('Bot is running\n');
}).listen(process.env.PORT || 3000);
