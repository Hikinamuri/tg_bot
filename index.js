require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const channels = {};
let selectedChannels = [];
let groups = {};
let selectedChannels1 = [];
let selectedChannelsForRemoval = [];
let toggleChannels = [];
const ITEMS_PER_PAGE = 1; 
let pendingMedia = [];
let isAwaitingChannel = false;
let isSending = false;
let selectedForDeletion = [];

const apiKeyBot = process.env.API_KEY_BOT || console.log('Ошибка с импортом apiKeyBot');
const bot = new TelegramBot(apiKeyBot, { polling: true });

bot.on("polling_error", err => console.log(err.data?.error?.message));

bot.on('text', async (msg) => {
    try {
        if (msg.text === '/start') {
            bot.sendMessage(msg.chat.id, 'Добрый день');
            return;
        }
        // const forwardFromChatId = msg.forward_origin?.chat?.id;
        // const messageText = `${msg.text}\n<a href='t.me'>${msg.forward_origin?.chat?.title}</a>`;
    }
    catch (error) {
        console.error(error);
    }
})

bot.on('message', async (msg) => {
    if (isAwaitingChannel && msg.forward_from_chat) {
        const channelId = msg.forward_from_chat.id;
        const channelTitle = msg.forward_from_chat.title || "Неизвестный канал";

        channels[channelId] = channelTitle;
        isAwaitingChannel = false;

        await bot.sendMessage(msg.chat.id, `Канал "${channelTitle}" успешно добавлен.`);
    }
});

const generateChannelButtons = () => {
    const channelButtons = Object.entries(channels).map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels.includes(id) ? '✅' : ''}`,
            callback_data: id
        }];
    });

    channelButtons.push([{ text: 'Добавить канал', callback_data: 'add_channel' }]);
    channelButtons.push([{ text: 'Удалить каналы', callback_data: 'delete_channel' }]);
    channelButtons.push([{ text: 'Выбрать все каналы', callback_data: 'select_all' }]);
    channelButtons.push([{ text: 'Отправить сообщение ✅', callback_data: 'send_message' }]);

    return channelButtons;
}

const generateDeleteButtons = () => {
    const channelButtons = Object.entries(channels).map(([id, title]) => {
        return [{
            text: `${title} ${selectedForDeletion.includes(id) ? '❌' : ''}`,
            callback_data: `delete_${id}`  // Изменяем callback_data для кнопок удаления
        }];
    });

    channelButtons.push([{ text: 'Удалить выбранные', callback_data: 'remove_selected' }]);

    return channelButtons;
}

const generateGroupChannelButtons = (currentPage = 1) => {
    const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
    });

    const totalChannels = sortedChannels.length;
    const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE);

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalChannels);
    const channelsOnPage = sortedChannels.slice(startIdx, endIdx);

    const channelButtons = channelsOnPage.map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels1.includes(id) ? '✅' : '⬜️'}`,
            callback_data: `group_${id}_${currentPage}`
        }];
    });

    const navigationButtons = [];
    if (currentPage > 1) {
        navigationButtons.push({ text: '⬅️ Предыдущая', callback_data: `view_page_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
        navigationButtons.push({ text: 'Следующая ➡️', callback_data: `view_page_${currentPage + 1}` });
    }

    const createGroupButton = [{ text: 'Создать группу', callback_data: 'confirm_create_group' }];
    
    const mainMenuButton = [{ text: 'Главное меню', callback_data: 'main_menu' }];

    return [
        ...channelButtons,
        navigationButtons.length > 0 ? navigationButtons : [],
        createGroupButton,
        mainMenuButton
    ];
};

const generateGroupButtons = () => {
    const sortedGroups = Object.entries(groups).sort(([nameA], [nameB]) => {
        return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
    });

    return sortedGroups.map(([name, channels]) => {
        return [{
            text: `${name} (${channels.length})`,
            callback_data: `view_group_${name}`
        }];
    });
};

const generateSelectableChannelButtonsForGroup = (groupName, currentPage = 1) => {
    const channelIdsInGroup = (groups[groupName] || []).slice();

    channelIdsInGroup.sort((a, b) => {
        const titleA = channels[a]?.toLowerCase() || '';
        const titleB = channels[b]?.toLowerCase() || '';
        return titleA.localeCompare(titleB);
    });

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const channelsOnPage = channelIdsInGroup.slice(startIdx, endIdx);

    const channelButtons = channelsOnPage.map((channelId) => {
        const title = channels[channelId];
        const isSelected = toggleChannels.includes(channelId);

        return [{
            text: `${title} ${isSelected ? '✅' : '⬜️'}`,
            callback_data: `toggle_channel_${channelId}_${groupName}_${currentPage}`
        }];
    });

    const totalPages = Math.ceil(channelIdsInGroup.length / ITEMS_PER_PAGE);
    const navigationButtons = [];
    if (currentPage > 1) {
        navigationButtons.push({ text: '⬅️ Предыдущая', callback_data: `view_group_${groupName}_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
        navigationButtons.push({ text: 'Следующая ➡️', callback_data: `view_group_${groupName}_${currentPage + 1}` });
    }

    const selectAllButton = [{
        text: toggleChannels.length === channelIdsInGroup.length ? 'Убрать все каналы' : 'Выбрать все каналы',
        callback_data: `select_all_channels_${groupName}_${toggleChannels.length === channelIdsInGroup.length ? 'deselect' : 'select'}_${currentPage}`
    }];
    

    return [
        ...channelButtons,
        navigationButtons.length > 0 ? navigationButtons : [],
        [{ text: 'Настройки группы', callback_data: `settings_group_${groupName}` }],
        selectAllButton,
        [{ text: 'Назад к группам', callback_data: 'view_groups' }],
        [{ text: 'Главное меню', callback_data: 'main_menu' }]
    ];
};


const generateAddChannelButtonsForGroup = (groupName, currentPage = 1) => {
    const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
    });

    const totalChannels = sortedChannels.length;
    const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalChannels);
    const channelsOnPage = sortedChannels.slice(startIdx, endIdx);

    const channelButtons = channelsOnPage.map(([id, title]) => {
        return [{
            text: `${title} ${selectedChannels1.includes(id) ? '✅' : '⬜️'}`,
            callback_data: `select_channel_${id}_${currentPage}`
        }];
    });

    const navigationButtons = [];
    if (currentPage > 1) {
        navigationButtons.push({ text: '⬅️ Предыдущая', callback_data: `add_channel_page_${groupName}_${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
        navigationButtons.push({ text: 'Следующая ➡️', callback_data: `add_channel_page_${groupName}_${currentPage + 1}` });
    }

    return [
        ...channelButtons,
        [{ text: 'Добавить выбранные каналы в группу', callback_data: `confirm_add_to_group_${groupName}` }],
        navigationButtons.length > 0 ? navigationButtons : [],
        [{ text: 'Назад к настройкам группы', callback_data: `settings_group_${groupName}` }]
    ];
};

const generateRemoveChannelButtonsForGroup = (groupName, currentPage = 1) => {
    const channelIdsInGroup = groups[groupName] || [];
    const sortedChannelIds = channelIdsInGroup.sort((a, b) => {
        const titleA = channels[a].toLowerCase();
        const titleB = channels[b].toLowerCase();
        return titleA.localeCompare(titleB);
    });

    const totalChannels = sortedChannelIds.length; 
    const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalChannels);
    const channelsOnPage = sortedChannelIds.slice(startIdx, endIdx);

    const channelButtons = channelsOnPage.map((channelId) => {
        const title = channels[channelId]; 
        const isSelected = selectedChannelsForRemoval.includes(channelId);
        return [{
            text: `${title} ${isSelected ? '✅' : '⬜️'}`,
            callback_data: `select_remove_channel_${channelId}_${currentPage}`
        }];
    });

    const navigationButtons = [];
    if (currentPage > 1) {
        navigationButtons.push([{ text: '⬅️ Предыдущая', callback_data: `remove_channel_page_${groupName}_${currentPage - 1}` }]);
    }
    if (currentPage < totalPages) {
        navigationButtons.push([{ text: 'Следующая ➡️', callback_data: `remove_channel_page_${groupName}_${currentPage + 1}` }]);
    }

    return [
        ...channelButtons,
        [{ text: 'Подтвердить удаление выбранных каналов', callback_data: `confirm_remove_from_group_${groupName}` }],
        ...navigationButtons,
        [{ text: 'Назад к настройкам группы', callback_data: `settings_group_${groupName}` }]
    ];
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
            const currentPage = 1; 
        
            const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
                return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
            });
        
            const totalChannels = sortedChannels.length; 
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 
        
            const pageInfoText = `Выберите каналы для новой группы:\n\nСтраница ${currentPage} из ${totalPages} (всего каналов: ${totalChannels})`;
        
            await bot.editMessageText(pageInfoText, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        ...generateGroupChannelButtons(currentPage), 
                        [
                        ]
                    ]
                }
            });
            return;
        }
        
        if (data.startsWith('view_page_')) {
            const currentPage = parseInt(data.split('_')[2]) || 1; 
        
            const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
                return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
            });
        
            const totalChannels = sortedChannels.length;
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 
        
            const pageInfoText = `Выберите каналы для новой группы:\n\nСтраница ${currentPage} из ${totalPages} (всего каналов: ${totalChannels})`;
        
            await bot.editMessageText(pageInfoText, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateGroupChannelButtons(currentPage)
                }
            });
            return;
        }      
        
        if (data.startsWith('group_')) {
            const parts = data.split('_');
            const channelId = parts[1];
            const currentPage = parseInt(parts[2]) || 1;
            const selectedChannel = channels[channelId];
        
            if (selectedChannels1.includes(channelId)) { 
                selectedChannels1 = selectedChannels1.filter(id => id !== channelId); 
                await bot.editMessageText(`Канал "${selectedChannel}" удалён из группы.\n\nВыбранные каналы: ${selectedChannels1.length > 0 ? selectedChannels1.map(id => channels[id]).join(', ') : 'Нет выбранных каналов'}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: generateGroupChannelButtons(currentPage) 
                    }
                });
            } else {
                selectedChannels1.push(channelId);
                await bot.editMessageText(`Канал "${selectedChannel}" добавлен в группу.\n\nВыбранные каналы: ${selectedChannels1.map(id => channels[id]).join(', ')}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: generateGroupChannelButtons(currentPage)
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
                    await bot.sendMessage(chatId, 'Название группы недопустимо или уже существует. Попробуйте снова.', {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Создать еще группу', callback_data: 'create_group' } 
                                ]
                            ]
                        }
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
                    await bot.sendMessage(chatId, 'Ошибка: каналы не выбраны.', {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Создать еще группу', callback_data: 'create_group' } 
                            ]
                        ]
                    }
                });
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
        
        if (data.startsWith('view_group_')) {
            const parts = data.split('_');
            const groupName = parts[2];  
            let currentPage = parseInt(parts[3]) || 1;
        
            const channelsInGroup = groups[groupName] || [];
            const totalChannels = channelsInGroup.length;
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 
        
            if (currentPage < 1) {
                currentPage = 1;
            }
        
            if (totalChannels > 0) {
                if (currentPage > totalPages) {
                    currentPage = totalPages;
                }
        
                const startChannel = (currentPage - 1) * ITEMS_PER_PAGE + 1;
                const endChannel = Math.min(currentPage * ITEMS_PER_PAGE, totalChannels);
        
                await bot.editMessageText( 
                    `Группа "${groupName}" содержит следующие каналы (страница ${currentPage} из ${totalPages}, показываются ${startChannel}-${endChannel} из ${totalChannels}):`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: generateSelectableChannelButtonsForGroup(groupName, currentPage) 
                        }
                    }
                );
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
        
        if (data.startsWith('toggle_channel_')) {
            const parts = data.split('_');
            const channelId = parts[2];
            const groupName = parts[3];
            const currentPage = parseInt(parts[4], 10) || 1; 
        
            const isSelected = toggleChannels.includes(channelId);
        
            if (isSelected) {
                toggleChannels = toggleChannels.filter(id => id !== channelId);
            } else {
                toggleChannels.push(channelId);
            }
        
            const newMarkup = generateSelectableChannelButtonsForGroup(groupName, currentPage); 
        
            const currentMessage = query.message.reply_markup;
            if (JSON.stringify(currentMessage.inline_keyboard) !== JSON.stringify(newMarkup)) {
                await bot.editMessageReplyMarkup({
                    inline_keyboard: newMarkup
                }, {
                    chat_id: chatId,
                    message_id: query.message.message_id
                });
            }
            return;
        }
        
        if (data.startsWith('select_all_channels_')) {
            const parts = data.split('_');
            const groupName = parts[3];
            const action = parts[4];
            const currentPage = parseInt(parts[5], 10) || 1;
        
            if (action === 'select') {
                toggleChannels = groups[groupName] ? [...groups[groupName]] : [];
            } else {
                toggleChannels = [];
            }
        
            const newMarkup = generateSelectableChannelButtonsForGroup(groupName, currentPage);
        
            const currentMessage = query.message.reply_markup;
            const currentMarkupString = JSON.stringify(currentMessage.inline_keyboard);
            const newMarkupString = JSON.stringify(newMarkup);
        
            if (currentMarkupString !== newMarkupString) {
                await bot.editMessageReplyMarkup({
                    inline_keyboard: newMarkup
                }, {
                    chat_id: chatId,
                    message_id: query.message.message_id
                });
            }
            return;
        }
        
        

        if (data.startsWith('add_channel_to_group_')) {
            const groupName = data.split('_').pop();
            selectedChannels1 = [];
            const currentPage = 1; 
        
            const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
                return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
            });
        
            const totalChannels = sortedChannels.length; 
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 
        
            const pageInfoText = `Добавляем каналы в группу "${groupName}". Выберите каналы:\n\nСтраница ${currentPage} из ${totalPages} (всего каналов: ${totalChannels})`;
        
            await bot.editMessageText(pageInfoText, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateAddChannelButtonsForGroup(groupName, currentPage)
                }
            });
            return;
        }
        
        if (data.startsWith('add_channel_page_')) {
            const parts = data.split('_');
            const groupName = parts[3];
            const currentPage = parseInt(parts[4]) || 1;
        
            await bot.editMessageText(`Добавляем каналы в группу "${groupName}". Выберите каналы:\n\nСтраница ${currentPage} из ${Math.ceil(Object.entries(channels).length / ITEMS_PER_PAGE)} (всего каналов: ${Object.entries(channels).length})`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateAddChannelButtonsForGroup(groupName, currentPage)
                }
            });
            return;
        }
        
        if (data.startsWith('select_channel_')) {
            const parts = data.split('_');
            const channelId = parts[2];
            const currentPage = parseInt(parts[3]) || 1;
        
            if (selectedChannels1.includes(channelId)) {
                selectedChannels1 = selectedChannels1.filter(id => id !== channelId);
            } else {
                selectedChannels1.push(channelId);
            }
        
            await bot.editMessageReplyMarkup({
                inline_keyboard: generateAddChannelButtonsForGroup(query.message.text.split('"')[1], currentPage)
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        if (data.startsWith('confirm_add_to_group_')) {
            const groupName = data.split('_').pop();
            if (selectedChannels1.length > 0) {
                const channelIds = selectedChannels1;
                groups[groupName] = [...(groups[groupName] || []), ...channelIds];
                const channelNames = channelIds.map(id => channels[id]);
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
            const currentPage = 1; 
        
            const channelIdsInGroup = groups[groupName] || [];
            const totalChannels = channelIdsInGroup.length; 
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE);
        
            const pageInfoText = `Удаляем каналы из группы "${groupName}". Выберите каналы:\n\nСтраница ${currentPage} из ${totalPages} (всего каналов: ${totalChannels})`;
        
            await bot.editMessageText(pageInfoText, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateRemoveChannelButtonsForGroup(groupName, currentPage)
                }
            });
            return;
        }
        
        if (data.startsWith('select_remove_channel_')) {
            const parts = data.split('_');
            const channelId = parts[3]; 
            const currentPage = parseInt(parts[4]);
        
            const groupName = query.message.text.split('"')[1];
        
            if (selectedChannelsForRemoval.includes(channelId)) {
                selectedChannelsForRemoval = selectedChannelsForRemoval.filter(id => id !== channelId);
            } else {
                selectedChannelsForRemoval.push(channelId);
            }
            await bot.editMessageReplyMarkup({
                inline_keyboard: generateRemoveChannelButtonsForGroup(groupName, currentPage)
            }, {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        if (data.startsWith('remove_channel_page_')) {
            const parts = data.split('_');
            const groupName = parts.slice(3, parts.length - 1).join('_');
            const currentPage = parseInt(parts[parts.length - 1]);
        
            console.log(`Current group name: ${groupName}, current page: ${currentPage}`);
        
            await bot.editMessageText(`Удаляем каналы из группы "${groupName}". Выберите каналы:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateRemoveChannelButtonsForGroup(groupName, currentPage) 
                }
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
            } else {
                await bot.editMessageText('Ошибка: не выбраны каналы для удаления.', {
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
        
        if (data.startsWith('remove_channel_page_')) {
            const parts = data.split('_');
            const groupName = parts[2];
            let currentPage = parseInt(parts[3]) || 1;
        
            const totalChannels = (groups[groupName] || []).length;
            const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE); 
        
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
        
            await bot.editMessageText(`Удаляем каналы из группы "${groupName}". Выберите каналы:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: generateRemoveChannelButtonsForGroup(groupName, currentPage)
                }
            });
            return;
        }
  
        if (data.startsWith('edit_group_')) {
            const groupName = data.split('_').pop();
            
            if (!groups[groupName]) {
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
                return; 
            }
        
            await bot.editMessageText(`Введите новое название для группы "${groupName}":`, {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
        
            bot.once('text', async (msg) => {
                const newGroupName = msg.text;
                
                if (newGroupName === groupName) {
                    await bot.sendMessage(chatId, `Название группы осталось "${groupName}", так как оно не изменилось.`, {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: 'Назад к группам', callback_data: 'view_groups' }
                                ]
                            ]
                        }
                    });
                } else {
                    groups[newGroupName] = groups[groupName]; 
                    delete groups[groupName];
        
                    await bot.sendMessage(chatId, `Название группы изменено на "${newGroupName}".`, {
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

    if (data.startsWith('settings_group_')) { 
        const groupName = data.split('_')[2];
    
        await bot.editMessageText(`Настройки группы "${groupName}":`, {
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
                        { text: 'Назад к каналам', callback_data: `view_group_${groupName}_1` }
                    ]
                ]
            }
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
        await bot.sendMessage(chatId, 'Пока нет доступных каналов.', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Добавить канал', callback_data: 'add_channel' }]],
            }
        });
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

    if (callbackData === 'delete_channel') {
        selectedForDeletion = []; // Сбрасываем выбранные для удаления каналы
        await bot.sendMessage(chatId, 'Выберите каналы для удаления:', {
            reply_markup: {
                inline_keyboard: generateDeleteButtons()
            }
        });
        return;
    }

    if (callbackData.startsWith('delete_')) {
        const channelId = callbackData.split('_')[1];

        // Логика для добавления/удаления канала из списка выбранных для удаления
        if (selectedForDeletion.includes(channelId)) {
            selectedForDeletion = selectedForDeletion.filter(id => id !== channelId);
        } else {
            selectedForDeletion.push(channelId);
        }

        await bot.editMessageReplyMarkup({
            inline_keyboard: generateDeleteButtons()
        }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });

        return;
    }

    // Логика удаления выбранных каналов
    if (callbackData === 'remove_selected') {
        selectedForDeletion.forEach(channelId => {
            delete channels[channelId]; // Удаляем канал из списка
        });
        selectedForDeletion = []; // Очищаем список
        await bot.sendMessage(chatId, 'Выбранные каналы успешно удалены.');
        await bot.editMessageReplyMarkup({
            inline_keyboard: generateChannelButtons() // Возвращаем основное меню каналов
        }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
        return; // Завершаем обработку
    }

    if (callbackData === 'add_channel') {
        isAwaitingChannel = true;
        await bot.sendMessage(chatId, 'Чтобы добавить канал, перешлите любое сообщение из канала боту и сделайте его администратором нужного канала.');
        return;
    }

    if (callbackData === 'send_message') {
        const channelsToSend = selectedChannels.length ? selectedChannels : Object.keys(channels);
        if (channelsToSend.length === 0) {
            await bot.sendMessage(chatId, 'Нет выбранных каналов.');
            return;
        }

        // Запрашиваем сообщение с текстом и медиа
        await bot.sendMessage(chatId, 'Введите текст для рассылки и прикрепите медиа (фото или видео).');

        let mediaGroup = [];
        let isGroupProcessing = false;
        let mediaTimeout;

        const finalizeMediaGroup = async () => {
            if (mediaGroup.length > 0) {
                isSending = true;
                for (const channelId of channelsToSend) {
                    try {
                        // const channelTitle = channels[channelId];
                        // mediaGroup[0].caption += `\n\nПодписывайтесь на канал - ${channelTitle}`
                        
                        await bot.sendMediaGroup(channelId, mediaGroup);
                        selectedChannels = []
                    } catch (error) {
                        console.error(`Ошибка отправки в канал ${channelId}:`, error);
                    }
                }
                await bot.sendMessage(chatId, 'Медиа-группа успешно отправлена.');
                mediaGroup = [];
                isGroupProcessing = false;
                isSending = false;
            }
            bot.removeListener('message', handleMediaMessage);
        };

        const handleMediaMessage = async (msg) => {
            if (isSending) return;
            
            if (msg.media_group_id) {
                isGroupProcessing = true;

                // Очищаем предыдущий таймаут
                clearTimeout(mediaTimeout);

                // Проверяем наличие фото
                if (msg.photo) {
                    mediaGroup.push({
                        type: 'photo',
                        media: msg.photo[msg.photo.length - 1].file_id, // Наивысшее качество
                        caption: mediaGroup.length === 0 ? msg.text || msg.caption || '' : undefined // Подпись только к первому медиа
                    });
                }

                // Проверяем наличие видео
                if (msg.video) {
                    mediaGroup.push({
                        type: 'video',
                        media: msg.video.file_id,
                        caption: mediaGroup.length === 0 ? textToSend : undefined
                    });
                }

                mediaTimeout = setTimeout(finalizeMediaGroup, 2000);
            } else if (!msg.media_group_id && isGroupProcessing) {
                clearTimeout(mediaTimeout);
                await finalizeMediaGroup();
            } else if (!isGroupProcessing) {
                let mediaToSend = [];

                if (msg.photo) {
                    mediaToSend.push({
                        type: 'photo',
                        media: msg.photo[msg.photo.length - 1].file_id,
                        caption: textToSend
                    });
                }

                if (msg.video) {
                    mediaToSend.push({
                        type: 'video',
                        media: msg.video.file_id,
                        caption: textToSend
                    });
                }

                if (mediaToSend.length === 0) {
                    for (const channelId of channelsToSend) {
                        const channelTitle = channels[channelId];
                        const textToSend = `${msg.text || msg.caption || ''}\n\nПодписывайтесь на канал - ${channelTitle}`;

                        try {
                            await bot.sendMessage(channelId, textToSend);
                            await bot.sendMessage(chatId, 'Текст успешно отправлен.');
                            selectedChannels = []
                        } catch (error) {
                            console.error(`Ошибка отправки в канал ${channelId}:`, error);
                        }
                    }
                } else {
                    for (const channelId of channelsToSend) {
                        try {
                            await bot.sendMediaGroup(channelId, mediaToSend);
                        } catch (error) {
                            console.error(`Ошибка отправки в канал ${channelId}:`, error);
                        }
                    }
                }
            bot.removeListener('message', handleMediaMessage);
            }
        };

        bot.on('message', handleMediaMessage);
    } else if (callbackData === 'select_all') {
        selectedChannels = Object.keys(channels);
        await bot.sendMessage(chatId, 'Выбраны все каналы.');
        bot.emit('channels', callbackQuery.message);
    } else {
        // Логика выбора каналов
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
    { command: "groups", description: "Список групп" },
];

bot.setMyCommands(commands);