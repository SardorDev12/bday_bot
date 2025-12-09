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
const EVENT_MANAGER_ID = process.env.EVENT_MANAGER_ID;
const ALLOWED_USERS = process.env.ALLOWED_USERS;
  
// connect mongoose
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

// models
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
  type: String,
  recurring: Boolean,
  endDate: String,
  location: String,
});

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);

// bot instance
const bot = new TelegramBot(TOKEN, { polling: true });

// Event Management
const userState = {};

bot.onText(/^\/add_event$/, async (msg) => {
  const chatId = msg.chat.id;

  if (!ALLOWED_USERS.includes(msg.chat.id)){
     bot.sendMessage(chatId,"Ruxsat etilmagan urinish!")
     return;
  }

  userState[chatId] = { step: 1, data: {} };

  bot.sendMessage(chatId, 'Uchrashuv *mavzusini* kiriting:', {
    parse_mode: 'Markdown',
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId]) return;

  const state = userState[chatId];

  if(msg.text === "/stop"){
    delete userState[chatId];
    return bot.sendMessage(chatId, "❌ Bekor qilindi.");
  }

  // Step 1: Title
  if (state.step === 1) {
    state.data.title = text;
    state.step = 2;
    return bot.sendMessage(chatId, '*Ishtirokchilarni* vergul bilan kiriting:', { parse_mode: 'Markdown' });
  }

  // Step 2: Guests
  if (state.step === 2) {
    state.data.guests = text.split(',').map(g => g.trim());
    state.step = 3;
    return bot.sendMessage(chatId, 'Uchrashuv *sanasini* kiriting (KK.OO.YYYY):', { parse_mode: 'Markdown' });
  }

  // Step 3: Date
  if (state.step === 3) {
    const isValidDate = (d) => /^\d{2}\.\d{2}\.\d{4}$/.test(d);
    if (!isValidDate(text)) {
      return bot.sendMessage(chatId, "❌ Sana formati noto‘g‘ri. To'g'ri format: 03.12.2025");
    }
    state.data.date = text;
    state.step = 4;
    return bot.sendMessage(chatId, 'Uchrashuv *vaqtini* kiriting (SS:MM):', { parse_mode: 'Markdown' });
  }

  // Step 4: Time
  if (state.step === 4) {
    const isValidTime = (d) => /^\d{2}\:\d{2}$/.test(d);
    if (!isValidTime(text)) {
      return bot.sendMessage(chatId, "❌ Vaqt formati noto‘g‘ri. To'g'ri format: 10.30");
    }
    state.data.time = text;
    state.step = 5;
    return bot.sendMessage(chatId, 'Uchrashuv *takroriymi?* (0 = Yo‘q, 1 = Ha):', { parse_mode: 'Markdown' });
  }

  // Step 5: Recurring
  if (state.step === 5) {
    state.data.recurring = text.trim() === "1";

    if (state.data.recurring) {
      state.step = 6;
      return bot.sendMessage(chatId, 'Uchrashuv *yakuniy sanasini* kiriting (KK.OO.YYYY):',
        { parse_mode: 'Markdown' });
    } else {
      state.step = 7;
      return bot.sendMessage(chatId, 'Uchrashuv *turini* kiriting (PM, DATA, TRANSFORMATION):',
        { parse_mode: 'Markdown' });
    }
  }
  // Step 6: End date
  if (state.step === 6) {
    state.data.endDate = text;
    state.step = 7;
    return bot.sendMessage(chatId, 'Uchrashuv *turini* kiriting (PM, DATA, TRANSFORMATION):',
      { parse_mode: 'Markdown' });
  }

  // Step 7: Type
  if (state.step === 7) {
    state.data.type = text;
    state.step = 8;
    return bot.sendMessage(chatId, 'Uchrashuv *manzilini* kiriting:', { parse_mode: 'Markdown' });
  }

  // Step 8: Location + CONFIRM PREVIEW
  if (state.step === 8) {
    state.data.location = text;
    state.step = 9;

    const message = `
    📌 *Ma'lumotlarni tasdiqlaysizmi?*
    
    *Mavzu:* ${state.data.title}
    
    *Ishtirokchilar:* ${state.data.guests.join(', ')}
    
    *Uchrashuv sanasi:* ${state.data.date}
    
    *Boshlanish vaqti:* ${state.data.time}
    
    *Uchrashuv turi:* ${state.data.type}
    
    *Joy:* ${state.data.location}
    
    *Tugash sanasi:* ${state.data.endDate}
    
    *Takroriymi?:* ${state.data.recurring ? "Ha" : "Yo‘q"}
    
    ❌ Bekor qilish: /cancel  
    ✅ Tasdiqlash: /confirm
    `;

    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }  
  // Step 9: Confirm or cancel
  if (state.step === 9) {
    if (text === "/cancel") {
      delete userState[chatId];
      return bot.sendMessage(chatId, "❌ Bekor qilindi.");
    }

    if (text === "/confirm") {
      await Event.create(state.data);
      delete userState[chatId];
      return bot.sendMessage(chatId, "✅ Uchrashuv muvaffaqiyatli saqlandi!");
    }
  }
});

async function checkEvents(receiver_chat, current_chat = ADMIN_ID, halfDay = false) {
  let now = new Date();
  let currentHours = now.getHours();
  let events;
  const today = dayjs().format("DD.MM.YYYY");
  const todayNorm = normalize(today);

  function normalize(d) {
    const [dd, mm, yyyy] = d.split(".");
    return `${yyyy}-${mm}-${dd}`; // sortable
  }
  
  let allEvents = await Event.find({
    $or: [
      { date: today },
      { recurring: true }
    ]
  });
  
  // Now filter recurring by normalized values
  allEvents = allEvents.filter(ev => {
    if (!ev.recurring) return true;
  
    const evStart = normalize(ev.date);
    const evEnd = normalize(ev.endDate);
  
    return evStart <= todayNorm && evEnd >= todayNorm;
  });
  
  if (!halfDay) {
  events = allEvents;
  } else {
    if (currentHours < 14) {
      events = allEvents.filter(ev => {
        if (!ev.time) return false;
        const [h] = ev.time.split(":").map(Number);
        return h < 14;
      });
    } else {
      events = allEvents.filter(ev => {
        if (!ev.time) return false;
        const [h] = ev.time.split(":").map(Number);
        return h >= 14;
      });
    }
  }

  // If no events found
  if (!events?.length) {
    await bot.sendMessage(current_chat, '📭 Bugun uchrashuv rejalashtirilmagan.');
    return false;
  }

  // Send event messages
  for (const ev of events) {
  const message = `
    📅 *Bugun uchrashuv bor!*
    
    *Mavzu:* ${ev.title}
    
    *Ishtirokchilar:* ${ev.guests.join(', ')}
    
    *Boshlanish vaqti:* ${ev.time}
    
    *Joy:* ${ev.location}
    
    ${ev.type ? `*Uchrashuv turi:* ${ev.type}` : ""}
    `;

  await bot.sendMessage(receiver_chat, message, { parse_mode: 'Markdown' });
  }

  await bot.sendMessage(current_chat, '📨 Uchrashuv xabarlari yuborildi.');
  return true;
}

// birthdays
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

// commands
bot.setMyCommands([
  { command: "start", description: "Botni ishga tushirish" },
  { command: "b_days", description: "Bugungi tug'ilgan kunlar" },
  { command: "t_bdays", description: "Test - Bugungi tug'ilgan kunlar" },
  { command: "events", description: "Bugungi uchrashuvlar" },
  { command: "t_events", description: "Test bugungi uchrashuvlar" },
  { command: "h_events", description: "Yarim kunlik uchrashuvlar" },
  { command: "t_hevents", description: "Test - Yarim kunlik uchrashuvlar" },
  { command: "add_event", description: "Uchrashuv qo'shish" },
]);

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Unknown';

  let user = await User.findOne({ chatId });

  if (!user) {
    await User.create({ chatId, name, date: '00.00' });
    bot.sendMessage(chatId, '👋 Siz ro‘yxatga qo‘shildingiz!');
    const m = `<a href="tg://user?id=${chatId}">${name}</a> ro‘yxatga qo‘shildi.`;
    bot.sendMessage(ADMIN_ID, m, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, 'Siz allaqachon ro‘yxatdasiz.');
  }
});

bot.onText(/^\/b_days$/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await runBirthdayCheck(GROUP_CHAT_ID);
});

bot.onText(/^\/t_bdays$/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await runBirthdayCheck(TEST_GROUP_URL);
});

bot.onText(/^\/events$/, async (msg) => {
  if (!ALLOWED_USERS.includes(msg.chat.id)){
     bot.sendMessage(chatId,"Ruxsat etilmagan urinish!")
     return;
  }
  await checkEvents(GROUP_CHAT_ID,msg.from.id);
});

bot.onText(/^\/t_events$/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await checkEvents(TEST_GROUP_URL,msg.from.id );
});

bot.onText(/^\/h_events$/, async (msg) => {
  if (!ALLOWED_USERS.includes(msg.chat.id)){
     bot.sendMessage(chatId,"Ruxsat etilmagan urinish!")
     return;
  }
  await checkEvents(GROUP_CHAT_ID,msg.from.id, true);
});

bot.onText(/^\/t_hevents$/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return;
  await checkEvents(TEST_GROUP_URL,msg.from.id, true );
});

// url triggers for cron job servive
const PORT = process.env.PORT || 3000;
http
  .createServer(async (req, res) => {
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
  })
  .listen(PORT);













