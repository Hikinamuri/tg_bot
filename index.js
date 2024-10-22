require('dotenv').config()
const TelegramBot =  require('node-telegram-bot-api')

const channels = {};

const apiKeyBot = process.env.API_KEY_BOT || console.log('Ошибка с импортом apiKeyBot');
const bot = new TelegramBot(apiKeyBot, {
    polling: true
});

bot.on("polling_error", err => console.log(err.data?.error?.message));

bot.on('text', async msg => {
    try {
        if (msg.text === '/start') {
            bot.sendMessage(msg.chat.id, 'Добрый день')
            return
        }
        else if(msg.text == '/help') {
            await bot.sendMessage(msg.chat.id, `Раздел помощи HTML\n\n<b>Жирный Текст</b>\n<i>Текст Курсивом</i>\n<code>Текст с Копированием</code>\n<s>Перечеркнутый текст</s>\n<u>Подчеркнутый текст</u>\n<pre language='c++'>код на c++</pre>\n<a href='t.me'>Гиперссылка</a>`, {
                parse_mode: "HTML"
            });
            return
        }

        const forwardFromChatId = msg.forward_origin?.chat?.id;
        const messageText = `${msg.text}\n<a href='t.me'>${msg.forward_origin?.chat?.title}</a>`

        console.log(messageText, 'messageText')
        // forwardFromChatId ? await bot.sendMessage(forwardFromChatId, messageText, {
        //     parse_mode: "HTML"
        // }) : await bot.sendMessage(msg.chat.id, msg.text)
    }
    catch (error) {
        console.error(error);
    }
})

bot.on('message', async (msg) => {
    if (msg.forward_from_chat) {
        const channelId = msg.forward_from_chat.id;
        const channelTitle = msg.forward_from_chat.title || "Неизвестный канал";

        channels[channelId] = channelTitle;

        await bot.sendMessage(msg.chat.id, `Канал "${channelTitle}" успешно добавлен.`);
    }
    console.log(msg);    
});

bot.onText(/\/channels/, async (msg) => {
    const chatId = msg.chat.id;

    if (Object.keys(channels).length === 0) {
        await bot.sendMessage(chatId, 'Пока нет доступных каналов.');
        return;
    }

    let channelList = "Список доступных каналов:\n";
    Object.entries(channels).forEach(([id, title]) => {
        channelList += `${title} (ID: ${id})\n`;
    });

    await bot.sendMessage(chatId, channelList);
});

bot.onText(/\/send (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const textToSend = match[1]; // Текст сообщения

    if (Object.keys(channels).length === 0) {
        await bot.sendMessage(chatId, 'Нет доступных каналов для отправки.');
        return;
    }

    for (const channelId of Object.keys(channels)) {
        try {
            await bot.sendMessage(channelId, textToSend);
        } catch (error) {
            console.error(`Ошибка отправки в канал ${channelId}:`, error);
        }
    }

    await bot.sendMessage(chatId, 'Сообщение отправлено во все каналы.');
});

const commands = [
    { command: "start", description: "Запуск бота" },
    { command: "channels", description: "Список каналов" },
    { command: "send", description: "Отправить сообщение в канал" },
    { command: "help", description: "Раздел помощи" },
]

bot.setMyCommands(commands);