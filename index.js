require('dotenv').config()
const TelegramBot =  require('node-telegram-bot-api')

const channels = {};
let selectedChannels = [];

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

// Добавление канала
bot.on('message', async (msg) => {
    if (msg.forward_from_chat) {
        const channelId = msg.forward_from_chat.id;
        const channelTitle = msg.forward_from_chat.title || "Неизвестный канал";

        channels[channelId] = channelTitle;

        await bot.sendMessage(msg.chat.id, `Канал "${channelTitle}" успешно добавлен.`);
    }
    console.log(msg);    
});

const generateChannelButtons = () => {
    const channelButtons = Object.entries(channels).map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels.includes(id) ? '✅' : ''}`,
            callback_data: id
        }];
    });

    channelButtons.push([{ text: 'Отправить сообщение ✅', callback_data: 'send_message' }]);
    channelButtons.push([{ text: 'Выбрать все каналы', callback_data: 'select_all' }]);

    return channelButtons;
}

bot.onText(/\/channels/, async (msg) => {
    const chatId = msg.chat.id;

    if (Object.keys(channels).length === 0) {
        await bot.sendMessage(chatId, 'Пока нет доступных каналов.');
        return;
    }

    await bot.sendMessage(chatId, 'Выберите каналы для отправки:', {
        reply_markup: {
            inline_keyboard: generateChannelButtons()
        }
    });
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

    if (callbackData === 'send_message') {
        // Если ни один канал не выбран, отправляем во все каналы
        const channelsToSend = selectedChannels.length ? selectedChannels : Object.keys(channels);
        await bot.sendMessage(chatId, `Введите сообщение для отправки в ${channelsToSend.length} канала(ов).`);

        bot.once('text', async (msg) => {
            const textToSend = msg.text;

            for (const channelId of channelsToSend) {
                try {
                    await bot.sendMessage(channelId, textToSend);
                } catch (error) {
                    console.error(`Ошибка отправки в канал ${channelId}:`, error);
                }
            }

            await bot.sendMessage(chatId, 'Сообщение успешно отправлено.');
            selectedChannels = [];
        });
    } else if (callbackData === 'select_all') {
        selectedChannels = Object.keys(channels);
        await bot.sendMessage(chatId, 'Выбраны все каналы.');
        bot.emit('channels', callbackQuery.message);
    } else {
        if (selectedChannels.includes(callbackData)) {
            selectedChannels = selectedChannels.filter(id => id !== callbackData);
        } else {
            selectedChannels.push(callbackData);
        }

        await bot.editMessageReplyMarkup({
            inline_keyboard: generateChannelButtons()
        }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
    }
});

const commands = [
    { command: "start", description: "Запуск бота" },
    { command: "channels", description: "Список каналов" },
]

bot.setMyCommands(commands);