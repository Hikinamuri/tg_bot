require('dotenv').config()
const TelegramBot =  require('node-telegram-bot-api')

const channels = {};
let selectedChannels = [];
let groups = {};
let selectedChannels1 = [];

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

// Генерация кнопок для выбора каналов
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

const generateGroupChannelButtons = () => {
    const channelButton = Object.entries(channels).map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels1.includes(title) ? '✅' : ''}`,
            callback_data: `group_${id}`
        }];
    });
    channelButton.push([{ text: 'Создать группу', callback_data: 'confirm_create_group' }]);
    return channelButton;
};

const generateGroupButtons = () => {
    return Object.entries(groups).map(([name, channels]) => {
        return [{
            text: `${name} (${channels.length})`,
            callback_data: `view_${name}` // Уникальный callback_data для каждой группы
        }];
    });
};

// Основной обработчик для callback_query
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        if (data === 'send_message') {
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
            return;
        }

        // Логика для выбора всех каналов
        if (data === 'select_all') {
            selectedChannels = Object.keys(channels);
            await bot.sendMessage(chatId, 'Выбраны все каналы.');
            await bot.editMessageReplyMarkup({
                inline_keyboard: generateChannelButtons()
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }

        // Выбор конкретного канала
        if (data.startsWith('channel_')) {
            const channelId = data.split('_')[1];
            if (selectedChannels.includes(channelId)) {
                selectedChannels = selectedChannels.filter(id => id !== channelId);
            } else {
                selectedChannels.push(channelId);
            }

            await bot.editMessageReplyMarkup({
                inline_keyboard: generateChannelButtons()
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }

        // Логика для создания группы
        if (data === 'create_group') {
            selectedChannels1 = [];
            await bot.editMessageText('Выберите каналы для новой группы:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateGroupChannelButtons()
                }
            });
            return;
        }

        // Добавление канала в группу
            if (data.startsWith('group_')) {
                const channelId = data.split('_')[1]; // Извлекаем идентификатор канала
                const selectedChannel = channels[channelId]; // Получаем название канала

                // Проверяем, есть ли уже этот канал в выбранной группе
                if (!selectedChannels1.includes(selectedChannel)) {
                    selectedChannels1.push(selectedChannel); // Добавляем канал в список
                    await bot.editMessageText(`Канал "${selectedChannel}" добавлен в группу.\n\nВыбранные каналы: ${selectedChannels1.join(', ')}`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: generateGroupChannelButtons() // Обновляем кнопки
                        }
                    });
                } else {
                    // Сообщение об ошибке, если канал уже был добавлен
                    await bot.sendMessage(chatId, `Ошибка: Канал "${selectedChannel}" уже добавлен в группу.`);
                }
                return;
            }

        // Подтверждение создания группы
        if (data === 'confirm_create_group') {
            await bot.sendMessage(chatId, 'Введите название для группы:');
            bot.once('text', async (msg) => {
                const groupName = msg.text;
                groups[groupName] = selectedChannels1;
                await bot.sendMessage(chatId, `Группа "${groupName}" создана с каналами: ${selectedChannels1.join(', ')}`);
                selectedChannels1 = [];
            });
            return;
        }

        if (data === 'view_groups') {
            if (Object.keys(groups).length === 0) {
                await bot.sendMessage(chatId, 'Пока нет доступных групп.');
                return;
            }
    
            // Отображаем список существующих групп
            await bot.sendMessage(chatId, 'Выберите группу:', {
                reply_markup: {
                    inline_keyboard: generateGroupButtons() // Генерация кнопок для групп
                }
            });
            return;
        }
if (data.startsWith('view_')) {
    const groupName = data.split('_')[2]; // Извлекаем имя группы после "group_view_"
    const channelsInGroup = groups[groupName]; // Получаем каналы для выбранной группы

    if (channelsInGroup && channelsInGroup.length > 0) {
        await bot.editMessageText(`Группа "${groupName}" включает следующие каналы:\n${channelsInGroup.join(', ')}`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Добавить канал', callback_data: `add_channel_to_group_${groupName}` },
                        { text: 'Удалить канал', callback_data: `remove_channel_from_group_${groupName}` }
                    ],
                    [
                        { text: 'Изменить название группы', callback_data: `edit_group_${groupName}` },
                        { text: 'Удалить группу', callback_data: `delete_group_${groupName}` }
                    ]
                ]
            }
        });
    } else {
        await bot.editMessageText(`Группа "${groupName}" пуста.`, {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    }
    return;
}

    } catch (error) {
        console.error('Ошибка в обработке callback_query:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте еще раз.');
    }
});




// Уникальные кнопки для команды /channels
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

// Уникальные кнопки для команды /groups
bot.onText(/\/groups/, async (msg) => {
    const chatId = msg.chat.id;
    const sentMessage = await bot.sendMessage(chatId, 'Что вы хотите сделать:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Создать новую группу', callback_data: 'create_group' }],
                [{ text: 'Посмотреть существующие группы', callback_data: 'view_groups' }]
            ]
        }
    });
});



// Команды для бота
const commands = [
    { command: "start", description: "Запуск бота" },
    { command: "channels", description: "Список каналов" },
    { command: "groups", description: "Список групп" },
];

bot.setMyCommands(commands);
