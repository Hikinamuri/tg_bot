require('dotenv').config()
const TelegramBot =  require('node-telegram-bot-api')

const channels = {};
let selectedChannels = [];
let groups = {};
let selectedChannels1 = [];
let selectedChannelsForRemoval = [];

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
            text: `${title} ${selectedChannels1.includes(id) ? '✅' : ''}`,
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
            callback_data: `view_${name}` 
        }];
    });
};

const generateAddChannelButtonsForGroup = (groupName) => {
    return Object.entries(channels).map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels1.includes(id) ? '✅' : ''}`, 
            callback_data: `select_channel_${id}`
        }];
    }).concat([
        [{ text: 'Добавить выбранные каналы в группу', callback_data: `confirm_add_to_group_${groupName}` }]
    ]);
};

const generateRemoveChannelButtonsForGroup = (groupName) => {

    const channelIdsInGroup = groups[groupName] || [];

    return channelIdsInGroup.map((channelId) => {
        const title = channels[channelId]; 

        if (!title) {
            console.warn(`Канал с ID ${channelId} не найден в channels.`);
            return null; 
        }

        const isSelected = selectedChannelsForRemoval.includes(channelId);

        return [{
            text: `${title} ${isSelected ? '✅' : ''}`,
            callback_data: `select_remove_channel_${channelId}` 
        }];
    }).filter(Boolean) 
    .concat([
        [{ text: 'Подтвердить удаление выбранных каналов', callback_data: `confirm_remove_from_group_${groupName}` }]
    ]);
};




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

        if (data === 'create_group') {
            selectedChannels1 = []; 
            await bot.editMessageText('Выберите каналы для новой группы:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        ...generateGroupChannelButtons(), 
                        [
                            { text: 'Главное меню', callback_data: 'main_menu' }
                        ]
                    ]
                }
            });
            return;
        }
        
        if (data.startsWith('group_')) {
            const channelId = data.split('_')[1]; 
            const selectedChannel = channels[channelId];
        
            if (selectedChannels1.includes(channelId)) { 
                selectedChannels1 = selectedChannels1.filter(id => id !== channelId); 
                await bot.editMessageText(`Канал "${selectedChannel}" удалён из группы.\n\nВыбранные каналы: ${selectedChannels1.length > 0 ? selectedChannels1.map(id => channels[id]).join(', ') : 'Нет выбранных каналов'}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            ...generateGroupChannelButtons(),
                            [
                                { text: 'Главное меню', callback_data: 'main_menu' } 
                            ]
                        ]
                    }
                });
            } else {
                selectedChannels1.push(channelId);
                await bot.editMessageText(`Канал "${selectedChannel}" добавлен в группу.\n\nВыбранные каналы: ${selectedChannels1.map(id => channels[id]).join(', ')}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            ...generateGroupChannelButtons(),
                            [
                                { text: 'Главное меню', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
            }
            return;
        }
        
        if (data === 'confirm_create_group') { 
            await bot.editMessageText('Введите название для группы:', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            
            bot.once('text', async (msg) => {
                const groupName = msg.text.trim();
                if (!groupName || groups[groupName]) {
                    await bot.editMessageText('Название группы недопустимо или уже существует. Попробуйте снова.', {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });                 
                    return;
                }
                
                if (selectedChannels1 && selectedChannels1.length > 0) {
                    groups[groupName] = selectedChannels1;
                    await bot.sendMessage(chatId, `Группа "${groupName}" создана с каналами: ${selectedChannels1.map(id => channels[id]).join(', ')}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Просмотреть группы', callback_data: 'view_groups' },
                                    { text: 'Создать еще группу', callback_data: 'create_group' } 
                                ]
                            ]
                        }
                    });           
                    selectedChannels1 = [];
        
                } else {
                    await bot.sendMessage(chatId, 'Ошибка: каналы не выбраны.');
                }
            });
            return;
        }        
        
        if (data === 'view_groups') {
            if (Object.keys(groups).length === 0) {                
                await bot.editMessageText('Пока нет доступных групп.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Главное меню', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
                return;
            }
    
            await bot.editMessageText('Выберите группу:', {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        ...generateGroupButtons(), 
                        [
                            { text: 'Главное меню', callback_data: 'main_menu' }
                        ]
                    ]
                }
            });            
            return;
        }
        if (data.startsWith('view_')) {
            const groupName = data.split('_')[1]; 
            const channelsInGroup = groups[groupName];
        
            if (channelsInGroup && channelsInGroup.length > 0) {
                const channelNames = channelsInGroup.map(id => channels[id]).filter(Boolean);
        
                await bot.editMessageText(`Группа "${groupName}" включает следующие каналы:\n${channelNames.join(', ')}`, {
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
                            ],
                            [
                                { text: 'Главное меню', callback_data: 'main_menu' }
                            ],
                            [
                                { text: 'Назад к группам', callback_data: 'view_groups' }
                            ]
                        ]
                    }
                });
            } else {
                await bot.editMessageText(`Группа "${groupName}" пуста или не существует.`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Главное меню', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
            }          
        }

        if (data.startsWith('add_channel_to_group_')) {
            const groupName = data.split('_').pop();
            selectedChannels1 = []; 

            await bot.editMessageText( `Добавляем каналы в группу "${groupName}". Выберите каналы:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateAddChannelButtonsForGroup(groupName)
                }
            });
            return;
        }

        if (data.startsWith('select_channel_')) {
            const channelId = data.split('_')[2]; 
            if (selectedChannels1.includes(channelId)) {
                selectedChannels1 = selectedChannels1.filter(id => id !== channelId); 
            } else {
                selectedChannels1.push(channelId); 
            }
        
            await bot.editMessageReplyMarkup({
                inline_keyboard: generateAddChannelButtonsForGroup(query.message.text.split('"')[1])
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        if (data.startsWith('confirm_add_to_group_')) {
            const groupName = data.split('_').pop(); 
            if (selectedChannels1.length > 0) {
                const channelNames = selectedChannels1.map(id => channels[id]); 
                groups[groupName] = [...(groups[groupName] || []), ...channelNames]; 
                await bot.editMessageText(`Каналы ${channelNames.join(', ')} добавлены в группу "${groupName}".`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Назад к группам', callback_data: 'view_groups' }
                            ]
                        ]
                    }
                });
                                 
                selectedChannels1 = []; 
            } else {
                await bot.editMessageText('Ошибка: не выбраны каналы для добавления.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Назад к группам', callback_data: 'view_groups' }
                            ]
                        ]
                    }
                });
            }
            return;
        }
        
            if (data.startsWith('remove_channel_from_group_')) {
                const groupName = data.split('_').pop();
                selectedChannelsForRemoval = []; 

                await bot.editMessageText(`Удаляем каналы из группы "${groupName}". Выберите каналы:`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: generateRemoveChannelButtonsForGroup(groupName) 
                    }
                });
                return;
            }

            if (data.startsWith('select_remove_channel_')) {
                const channelId = data.split('_')[3];

                if (selectedChannelsForRemoval.includes(channelId)) {
                    selectedChannelsForRemoval = selectedChannelsForRemoval.filter(id => id !== channelId); 
                } else {
                    selectedChannelsForRemoval.push(channelId);
                }

                await bot.editMessageReplyMarkup({
                    inline_keyboard: generateRemoveChannelButtonsForGroup(query.message.text.split('"')[1])
                }, {
                    chat_id: chatId,
                    message_id: query.message.message_id
                });
                return;
            }

            if (data.startsWith('confirm_remove_from_group_')) {
                const groupName = data.split('_').pop();

                if (selectedChannelsForRemoval.length > 0) {
                    const channelNames = selectedChannelsForRemoval.map(id => channels[id]);
                    groups[groupName] = groups[groupName].filter(id => !selectedChannelsForRemoval.includes(id));
                    await bot.editMessageText(`Каналы ${channelNames.join(', ')} удалены из группы "${groupName}".`, {
                    chat_id: chatId,
                                message_id: query.message.message_id,
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: 'Назад к группам', callback_data: 'view_groups' }
                                        ]
                                    ]
                                }
                            });
                    selectedChannelsForRemoval = [];
                } 
                else {
                    await bot.editMessageText( 'Ошибка: не выбраны каналы для удаления.', {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Назад к группам', callback_data: 'view_groups' }
                                ]
                            ]
                        }
                    });
                }
            return;
        }
  
        if (data.startsWith('edit_group_')) {
            const groupName = data.split('_').pop();
            await bot.editMessageText(`Введите новое название для группы "${groupName}":`, {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
            
            bot.once('text', async (msg) => {
                const newGroupName = msg.text;
                if (groups[groupName]) {
                    groups[newGroupName] = groups[groupName]; 
                    delete groups[groupName];
                    await bot.sendMessage(chatId, `Название группы изменено на "${newGroupName}".`,{
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Назад к группам', callback_data: 'view_groups' }
                                ]
                            ]
                        }
                    });
                } 
                
                else {
                    await bot.editMessageText(`Группа "${groupName}" не найдена.`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Назад к группам', callback_data: 'view_groups' }
                                ]
                            ]
                        }
                    });
                }
            });
        }
    
        if (data.startsWith('delete_group_')) {
            const groupName = data.split('_').pop();
            if (groups[groupName]) {
                delete groups[groupName];
                await bot.editMessageText(`Группа "${groupName}" была удалена.`,{
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Назад к группам', callback_data: 'view_groups' }
                            ]
                        ]
                    }
                });

            } else {
                await bot.editMessageText(`Группа "${groupName}" не найдена.`,{
                    hat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Назад к группам', callback_data: 'view_groups' }
                            ]
                        ]
                    }
                });
            }
        }
    } 

    catch (error) {
        console.error('Ошибка в обработке callback_query:', error);
        await bot.editMessageText('Произошла ошибка. Пожалуйста, попробуйте еще раз.',{
            chat_id: chatId,
            message_id: query.message.message_id,
        });
    }

    if (data === 'main_menu') {
        const chatId = query.message.chat.id; 
        await bot.editMessageText('Что вы хотите сделать:', {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Создать новую группу', callback_data: 'create_group' }],
                    [{ text: 'Посмотреть существующие группы', callback_data: 'view_groups' }]
                ]
            }
        });
        return;
    }
});

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

const commands = [
    { command: "start", description: "Запуск бота" },
    { command: "channels", description: "Список каналов" },
    { command: "groups", description: "Список групп" },
];

bot.setMyCommands(commands);
