require('dotenv').config();
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

let channels = {};
let selectedChannels = [];
let groups = {};
let selectedChannels1 = [];
let selectedChannelsForRemoval = [];
let toggleChannels = [];
const ITEMS_PER_PAGE = 2; 
let pendingMedia = [];
let isAwaitingChannel = false;
let isSending = false;
let selectedForDeletion = [];

let userId;

const apiKeyBot = process.env.API_KEY_BOT || console.log('Ошибка с импортом apiKeyBot');
const bot = new TelegramBot(apiKeyBot, { polling: true });

const pool = new Pool({
    user: process.env.DB_USER_NAME,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_USER_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect()
    .then(() => console.log('Подключение к базе данных установлено'))
    .catch(err => console.error('Ошибка подключения к базе данных:', err));

bot.on("polling_error", err => console.log(err.data?.error?.message));

bot.on('text', async (msg) => {
    try {
        // Обрабатываем команду /start
        if (msg.text.startsWith('/start')) {
            userId = msg.from.id;  // ID пользователя в Telegram
            const client = await pool.connect();

            try {
                const result = await client.query('SELECT role FROM users WHERE user_id = $1', [userId]);

                if (result.rows.length > 0) {
                    const userRole = result.rows[0].role;
                    
                    if (userRole === true) {
                        // Пользователь найден и имеет роль с полными правами (role === true)

                        // Запрос к таблице user_channels
                        const channelResult = await client.query('SELECT channel_id, channel_name FROM user_chanels WHERE user_id = $1', [userId]);
                        channels = {};

                        for (const row of channelResult.rows) {
                            channels[row.channel_id] = row.channel_name;  // Сохраняем id канала и его имя в объект
                        }

                        // Запрос к таблице user_groups
                        const groupResult = await client.query('SELECT id, group_name FROM user_group WHERE user_id = $1', [userId]);
                        groups = {};

                        for (const row of groupResult.rows) {
                            if (!groups[row.group_name]) {
                                groups[row.group_name] = [];
                            }
                            const groupChannels = await client.query('SELECT channel_id FROM group_channel WHERE group_id = $1', [row.id]);

                            for (const row1 of groupChannels.rows) {
                                groups[row.group_name].push(row1.channel_id);  // Сохраняем имя группы и id в объект
                            }
                        }

                        await bot.sendMessage(msg.chat.id, `Добро пожаловать! У вас есть полный доступ.`);
                        
                        // Логируем объекты для проверки

                    } else {
                        await bot.sendMessage(msg.chat.id, `Добро пожаловать! У вас нет полного доступа.`);
                    }
                } else {
                    // Если пользователь не найден, добавляем его
                    const defaultRole = false;  // Роль по умолчанию
                    await client.query(`INSERT INTO users (user_id, role) VALUES ($1, $2)`, [userId, defaultRole]);

                    await bot.sendMessage(msg.chat.id, `Добро пожаловать! У вас пока нет доступа, обратитесь к администратору.`);
                }
            } finally {
                client.release();  // Освобождаем соединение с базой данных
            }
            return;
        } else if (msg.text.startsWith('/channels' || msg.text.startsWith('/groups'))) {
            userId = msg.from.id;  // ID пользователя в Telegram
            const client = await pool.connect();

            try {
                const result = await client.query('SELECT role FROM users WHERE user_id = $1', [userId]);

                if (result.rows.length > 0) {
                    const userRole = result.rows[0].role;
                    
                    if (userRole === true) {
                        // Пользователь найден и имеет роль с полными правами (role === true)

                        // Запрос к таблице user_channels
                        const channelResult = await client.query('SELECT channel_id, channel_name FROM user_chanels WHERE user_id = $1', [userId]);
                        channels = {};

                        for (const row of channelResult.rows) {
                            channels[row.channel_id] = row.channel_name;  // Сохраняем id канала и его имя в объект
                        }

                        // Запрос к таблице user_groups
                        const groupResult = await client.query('SELECT id, group_name FROM user_group WHERE user_id = $1', [userId]);
                        groups = {};

                        for (const row of groupResult.rows) {
                            if (!groups[row.group_name]) {
                                groups[row.group_name] = [];
                            }
                            const groupChannels = await client.query('SELECT channel_id FROM group_channel WHERE group_id = $1', [row.id]);

                            for (const row1 of groupChannels.rows) {
                                groups[row.group_name].push(row1.channel_id);  // Сохраняем имя группы и id в объект
                            }
                        }
                        
                        // Логируем объекты для проверки

                    } else {
                        await bot.sendMessage(msg.chat.id, `Добро пожаловать! У вас нет полного доступа.`);
                    }
                } else {
                    // Если пользователь не найден, добавляем его
                    const defaultRole = false;  // Роль по умолчанию
                    await client.query(`INSERT INTO users (user_id, role) VALUES ($1, $2)`, [userId, defaultRole]);

                    await bot.sendMessage(msg.chat.id, `Добро пожаловать! У вас пока нет доступа, обратитесь к администратору.`);
                }
            } finally {
                client.release();  // Освобождаем соединение с базой данных
            }
            return;
        }
    } catch (error) {
        console.error('Ошибка обработки команды:', error);
    }
});

bot.on('message', async (msg) => {
    // Получаем ID бота при старте
    const botInfo = await bot.getMe();
    const botId = botInfo.id;

    if (isAwaitingChannel && msg.forward_from_chat) {
        const channelId = msg.forward_from_chat.id;
        const channelTitle = msg.forward_from_chat.title || "Неизвестный канал";
        const userId = msg.from.id;  // ID пользователя, который отправил сообщение

        isAwaitingChannel = false;

        // Подключаемся к базе данных и добавляем запись
        const client = await pool.connect();
        try {
            // Проверяем, что бот может отправлять сообщения в канал
            let canSendMessages = false;
            try {
                const member = await bot.getChatMember(channelId, botId);
                canSendMessages = member.can_post_messages;
                console.log('canSendMessages')
            } catch (error) {
                console.log('canSendMessages + error')
                if (error.response) {
                    // Если бот не состоит в канале, отправляем сообщение пользователю
                    await bot.sendMessage(msg.chat.id, `Бот не является участником канала "${channelTitle}", поэтому его нельзя добавить в базу данных.`);
                    return;
                } else {
                    throw error;  // Перебрасываем ошибку, если она не связана с правами доступа
                }
            }
            
            if (!canSendMessages) {
                await bot.sendMessage(msg.chat.id, `Бот не имеет прав на отправку сообщений в канал "${channelTitle}", поэтому его нельзя добавить в базу данных.`);
                return;
            }

            // Вставляем данные в таблицу user_channels
            channels[channelId] = channelTitle;
            await client.query(
                `INSERT INTO user_chanels (user_id, channel_id, channel_name) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (user_id, channel_id) DO NOTHING`,
                [userId, channelId, channelTitle]
            );

            await bot.sendMessage(msg.chat.id, `Канал "${channelTitle}" успешно добавлен в базу данных.`);
        } catch (error) {
            console.error('Ошибка при добавлении канала в базу данных:', error);
            await bot.sendMessage(msg.chat.id, `Бот не имеет прав на отправку сообщений в канал "${channelTitle}"`);
        } finally {
            client.release();  // Освобождаем соединение с базой данных
        }
    }
});


const generateChannelButtons = (page = 1, itemsPerPage = ITEMS_PER_PAGE) => {
    // Сортируем каналы в алфавитном порядке по названиям
    const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
    });

    // Определяем общее количество страниц
    const totalChannels = sortedChannels.length;
    const totalPages = Math.ceil(totalChannels / itemsPerPage);

    // Получаем каналы для текущей страницы
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageChannels = sortedChannels.slice(startIndex, endIndex);

    // Генерируем кнопки для текущей страницы
    const channelButtons = currentPageChannels.map(([id, title]) => ({
        text: `${selectedChannels.includes(id) ? '✅' : '⬜️'} ${title}`, // Добавляем отметку выбора
        callback_data: `${id}_${page}` // Передаем id канала и текущую страницу
    }));

    // Добавляем навигационные кнопки
    const navigationButtons = [];
    if (page > 1) {
        navigationButtons.push({ text: '⬅️ Предыдущая', callback_data: `spage_${page - 1}` });
    }
    if (page < totalPages) {
        navigationButtons.push({ text: 'Следующая ➡️', callback_data: `spage_${page + 1}` });
    }

    // Формируем кнопку навигации, если она существует
    const navigationRow = navigationButtons.length > 0 ? [navigationButtons] : [];

    // Добавляем кнопки действий в виде отдельных строк
    const actionButtons = [
        [
            { text: '➕ Добавить канал', callback_data: 'add_channel' },
            { text: '🗑️ Удалить каналы', callback_data: 'delete_channel' }
        ],
        [
            { text: '✅ Выбрать все каналы', callback_data: 'select_all' },
            { text: '📤 Отправить сообщение', callback_data: 'send_message' }
        ]
    ];


    // Собираем все кнопки в один массив, включаем навигацию и действия
    return [
        ...channelButtons.map(button => [button]), // Оборачиваем каждую кнопку в массив для строки
        ...navigationRow, // Добавляем навигацию, если есть
        [],
        ...actionButtons // Добавляем кнопки действия
    ];
};

const generateDeleteButtons = (page = 1, itemsPerPage = ITEMS_PER_PAGE) => {
    // Сортируем каналы в алфавитном порядке по названиям
    const sortedChannels = Object.entries(channels).sort(([, titleA], [, titleB]) => {
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
    });

    // Определяем общее количество страниц
    const totalChannels = sortedChannels.length;
    const totalPages = Math.ceil(totalChannels / itemsPerPage);

    // Получаем каналы для текущей страницы
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageChannels = sortedChannels.slice(startIndex, endIndex);

    // Генерируем кнопки для текущей страницы
    const channelButtons = currentPageChannels.map(([id, title]) => {
        return [{
            text: `${title} ${selectedForDeletion.includes(id) ? '❌' : ''}`,
            callback_data: `delete_${id}_${page}` // Добавляем текущую страницу к callback_data
        }];
    });

    // Добавляем навигационные кнопки
    if (page > 1) {
        channelButtons.push([{ text: '⬅️ Предыдущая', callback_data: `delete_page_${page - 1}` }]);
    }
    if (page < totalPages) {
        channelButtons.push([{ text: 'Следующая ➡️', callback_data: `delete_page_${page + 1}` }]);
    }

    // Добавляем кнопку для удаления выбранных
    channelButtons.push([{ text: 'Удалить выбранные', callback_data: 'remove_selected' }]);

    // Информация о странице
    const pageInfoText = `Выберите каналы для удаления:\n\nСтраница ${page} из ${totalPages} (всего каналов: ${totalChannels})`;

    return { inline_keyboard: channelButtons, pageInfoText }; // Возвращаем и кнопки, и текст с информацией о странице
};




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
    
    // Генерация кнопок для каналов с эмодзи
    const channelButtons = channelsOnPage.map((channelId) => {
        const title = channels[channelId];
        const isSelected = toggleChannels.includes(channelId);

        return [{
            text: `${isSelected ? '✅' : '⬜️'} ${title}`,
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

    // Кнопка выбора всех/убрать всех каналов с эмодзи
    const selectAllButton = [{
        text: `${toggleChannels.length === channelIdsInGroup.length ? '❌ Убрать все каналы' : '✅ Выбрать все каналы'}`,
        callback_data: `select_all_channels_${groupName}_${toggleChannels.length === channelIdsInGroup.length ? 'deselect' : 'select'}_${currentPage}`
    }];

    // Кнопки действий в два столбца с эмодзи
    const actionButtons = [
        [
            { text: '⚙️ Настройки группы', callback_data: `settings_group_${groupName}` },
            { text: '🔙 Назад к группам', callback_data: 'view_groups' }
        ],
        [
            { text: '🏠 Главное меню', callback_data: 'main_menu' },
            { text: '📤 Отправить в группу', callback_data: 'send_in_group' }
        ]
    ];
    

    // Объединение всех кнопок в один массив
    return [
        ...channelButtons,
        navigationButtons.length > 0 ? [navigationButtons] : [], // Добавляем навигацию, если есть
        selectAllButton,
        ...actionButtons // Добавляем кнопки действий
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
                userId = msg.from.id;  // ID пользователя, создавшего группу
        
                // Проверяем допустимость имени группы
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
        
                // Проверяем, выбраны ли каналы для группы
                if (selectedChannels1 && selectedChannels1.length > 0) {
                    groups[groupName] = selectedChannels1;
        
                    const client = await pool.connect();  // Подключение к базе данных
        
                    try {
                        // Вставляем новую группу в таблицу user_groups
                        const insertGroupResult = await client.query(
                            'INSERT INTO user_group (user_id, group_name) VALUES ($1, $2) RETURNING id',
                            [userId, groupName]
                        );
                        const groupId = insertGroupResult.rows[0].id;  // Получаем ID новой группы
        
                        // Вставляем каналы в таблицу group_channels
                        for (const channelId of selectedChannels1) {
                            await client.query(
                                `INSERT INTO group_channel 
                                 (group_id, channel_id)
                                 VALUES ($1, $2)
                                 ON CONFLICT (group_id, channel_id) DO NOTHING`,
                                [groupId, channelId]
                            );
                        }
        
                        await bot.sendMessage(chatId, `Группа "${groupName}" создана с каналами: \n${selectedChannels1.map(id => channels[id]).join(', ')}`, {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: 'Просмотреть группы', callback_data: 'view_groups' },
                                        { text: 'Создать еще группу', callback_data: 'create_group' }
                                    ]
                                ]
                            }
                        });
                    } catch (error) {
                        console.error('Ошибка при создании группы и добавлении каналов:', error);
                        await bot.sendMessage(chatId, 'Ошибка при создании группы. Пожалуйста, попробуйте снова.');
                    } finally {
                        client.release();  // Освобождаем соединение с базой данных
                    }
        
                    selectedChannels1 = [];
        
                } else {
                    // Ошибка, если каналы не были выбраны
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
                toggleChannels = []

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
                const client = await pool.connect();
                const copyGroupResult = await client.query('SELECT id, group_name FROM user_group WHERE user_id = $1', [userId]);
                let copyGroups = {};

                // Сохраняем группы в словаре
                for (const row of copyGroupResult.rows) {
                    if (!copyGroups[row.id]) {
                        copyGroups[row.group_name] = row.id;
                    }
                }

                const channelIds = selectedChannels1;
                const groupId = copyGroups[groupName];

                // Инициализируем массив, если он не существует
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }

                // Добавляем каналы, избегая дублирования
                for (const channelId of channelIds) {
                    if (!groups[groupName].includes(channelId)) {
                        groups[groupName].push(channelId);
                    }
                }

                const channelNames = channelIds.map(id => channels[id]);

                try {
                    // Вставляем каналы в таблицу group_channel
                    for (const channelId of channelIds) {
                        await client.query(
                            `INSERT INTO group_channel (group_id, channel_id) 
                            VALUES ($1, $2)
                            ON CONFLICT (group_id, channel_id) DO NOTHING`,
                            [groupId, channelId] // groupId и channelId
                        );
                    }

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
                } catch (error) {
                    console.error('Ошибка добавления каналов в группу:', error);
                    await bot.sendMessage(chatId, 'Произошла ошибка при добавлении каналов в группу. Попробуйте еще раз.');
                }
                
                client.release(); // Освобождаем соединение с базой данных
            }

            else {
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
        
            try {
                // Получаем ID группы по имени
                const groupId = await getGroupIdByName(groupName);
                
                if (selectedChannelsForRemoval.length > 0) {
                    const channelNames = selectedChannelsForRemoval.map(id => channels[id]);
        
                    // Удаляем каналы из группы в базе данных по ID группы
                    await removeChannelsByIdFromDB(groupId, selectedChannelsForRemoval);
                
                    // Обновляем локальную структуру данных
                    groups[groupName] = groups[groupName].filter(id => !selectedChannelsForRemoval.includes(id));
        
                    await bot.editMessageText(`Каналы ${channelNames.join(', ')} удалены из группы "${groupName}".`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Назад к группам', callback_data: 'view_groups' }]
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
                                [{ text: 'Назад к группам', callback_data: 'view_groups' }]
                            ]
                        }
                    });
                }
            } catch (error) {
                console.error("Ошибка при получении ID группы или удалении:", error);
                await bot.editMessageText('Ошибка при выполнении операции. Попробуйте снова.', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Назад к группам', callback_data: 'view_groups' }]
                        ]
                    }
                });
            }
            return;
        }
        
        
        
        
        async function removeChannelsByIdFromDB(groupId, channelIds) {
            // Запрос на удаление каналов из указанной группы
            const query = `
                DELETE FROM group_channel 
                WHERE group_id = $1 AND channel_id = ANY($2::bigint[])`;
            const values = [groupId, channelIds];
            await pool.query(query, values);
        }
        
        
        async function getGroupIdByName(groupName) {
            const query = `SELECT id FROM user_group WHERE group_name = $1`; // Убедитесь, что названия таблиц и полей соответствуют вашей БД
            const values = [groupName];
        
            const result = await pool.query(query, values);
            
            if (result.rows.length > 0) {
                return result.rows[0].id; // Возвращаем ID группы
            } else {
                throw new Error(`Группа с именем "${groupName}" не найдена.`);
            }
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
                userId = msg.from.id;
                
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
                    try {
                        const client = await pool.connect();
                        const result = await client.query(
                            'UPDATE user_group SET group_name = $1 WHERE group_name = $2 AND user_id = $3',
                            [newGroupName, groupName, userId]
                        );
        
                        if (result.rowCount > 0) {
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
                        } else {
                            await bot.sendMessage(chatId, `Ошибка при изменении названия группы. Попробуйте снова.`, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: 'Назад к группам', callback_data: 'view_groups' }
                                        ]
                                    ]
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Ошибка при обновлении группы в базе данных:', error);
                        await bot.sendMessage(chatId, `Ошибка при изменении названия группы.`, {
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
            });
        }
        
        if (data.startsWith('delete_group_')) {
            const groupName = data.split('_').pop();
        
            try {
                // Удаляем каналы из группы
                await deleteChannelsFromGroup(groupName);
        
                // Удаляем группу из базы данных
                await deleteGroupFromDB(groupName);
        
                // Удаляем группу из локальной структуры данных
                if (groups[groupName]) {
                    delete groups[groupName];
        
                    await bot.editMessageText(`Группа "${groupName}" и все связанные каналы были удалены.`, {
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
            } catch (error) {
                console.error("Ошибка при удалении группы из БД:", error);
                await bot.editMessageText('Ошибка при удалении группы. Попробуйте снова.', {
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
        }

        async function GroupIdByName(groupName) {
            const query = `SELECT id FROM user_group WHERE group_name = $1`;
            const values = [groupName];
            const result = await pool.query(query, values);
            
            if (result.rows.length > 0) {
                return result.rows[0].id; // Предполагается, что ID группы находится в первом элементе результата
            } else {
                throw new Error('Группа не найдена');
            }
        }
        
        
        async function deleteChannelsFromGroup(groupName) {
            const groupId = await GroupIdByName(groupName); // Получаем ID группы по имени
            const query = `DELETE FROM group_channel WHERE group_id = $1`; // Предполагаем, что у вас есть поле group_id в таблице
            const values = [groupId];
            await pool.query(query, values);
        }
        
        
        
        async function deleteGroupFromDB(groupName) {
            const query = `DELETE FROM user_group WHERE group_name = $1`;
            const values = [groupName];
            await pool.query(query, values);
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
                        { text: '➕ Добавить канал', callback_data: `add_channel_to_group_${groupName}` },
                        { text: '🗑️ Удалить канал', callback_data: `remove_channel_from_group_${groupName}` }
                    ],
                    [
                        { text: '✏️ Изменить название группы', callback_data: `edit_group_${groupName}` },
                        { text: '❌ Удалить группу', callback_data: `delete_group_${groupName}` }
                    ],
                    [
                        { text: '🔙 Назад к каналам', callback_data: `view_group_${groupName}_1` }
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

function formatTextWithEntities(text, entities) {
    let formattedText = text;
    entities.reverse().forEach(entity => {
        const { offset, length, type } = entity;
        const entityText = formattedText.slice(offset, offset + length);
        
        let formattedEntity;
        switch (type) {
            case 'bold':
                formattedEntity = `<b>${entityText}</b>`;
                break;
            case 'italic':
                formattedEntity = `<i>${entityText}</i>`;
                break;
            case 'underline':
                formattedEntity = `<u>${entityText}</u>`;
                break;
            case 'strikethrough':
                formattedEntity = `<s>${entityText}</s>`;
                break;
            case 'code':
                formattedEntity = `<code>${entityText}</code>`;
                break;
            case 'pre':
                formattedEntity = `<pre>${entityText}</pre>`;
                break;
            case 'text_link':
                formattedEntity = `<a href="${entity.url}">${entityText}</a>`;
                break;
            default:
                formattedEntity = entityText;
        }

        formattedText = formattedText.slice(0, offset) + formattedEntity + formattedText.slice(offset + length);
    });

    return formattedText;
}

async function getChannelUsernameById(channelId) {
    try {
        const chat = await bot.getChat(channelId);
        console.log('channelId', channelId, chat);

        if (chat.username) {
            return chat.username
        }

        if (chat.invite_link) {
            const chatUrl = chat.invite_link
            console.log(chatUrl.split('/')[3])
            return chatUrl.split('/')[3];
        }

        // Если нет ни username, ни invite_link, возвращаем null
        return null;
    } catch (error) {
        console.error(`Ошибка при получении username для канала ${channelId}:`, error);
        return null;
    }
}

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;

    if (callbackData === 'delete_channel') {
        selectedForDeletion = []; // Сбрасываем выбранные для удаления каналы
        
        // Генерируем кнопки для удаления, чтобы получить информацию о страницах
        const { inline_keyboard, pageInfoText } = generateDeleteButtons(1); // Передаем 1, если хотите показать первую страницу
    
        // Изменяем сообщение
        await bot.editMessageText(pageInfoText, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id, // Идентификатор сообщения, которое нужно редактировать
            reply_markup: {
                inline_keyboard: inline_keyboard // Генерируем кнопки для удаления
            }
        });
        return;
    }
    
    

    if (callbackData.startsWith('delete_')) {
        const [action, channelId, page] = callbackData.split('_'); // Извлекаем все части callback_data
    
        // Логика для добавления/удаления канала из списка выбранных для удаления
        if (selectedForDeletion.includes(channelId)) {
            selectedForDeletion = selectedForDeletion.filter(id => id !== channelId);
        } else {
            selectedForDeletion.push(channelId);
        }
    
        // Генерируем кнопки и текст информации о текущей странице
        const { inline_keyboard, pageInfoText } = generateDeleteButtons(parseInt(page), ITEMS_PER_PAGE); // Передаем текущую страницу
    
        // Изменяем сообщение
        await bot.editMessageText(pageInfoText, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id, // Идентификатор сообщения, которое нужно редактировать
            reply_markup: {
                inline_keyboard // Используем корректный формат для inline_keyboard
            }
        });
    
        return;
    }
    
    
    if (callbackData.startsWith('delete_page_')) {
        const currentPage = parseInt(callbackData.split('_')[2], 10); // Извлекаем текущую страницу
    
        // Генерируем кнопки для текущей страницы
        const { inline_keyboard, pageInfoText } = generateDeleteButtons(currentPage, ITEMS_PER_PAGE);
    
        // Изменяем сообщение
        await bot.editMessageText(pageInfoText, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id, // Идентификатор сообщения, которое нужно редактировать
            reply_markup: {
                inline_keyboard // Используем корректный формат для inline_keyboard
            }
        });
        return;
    }
    


    if (callbackData.startsWith('spage_')) {
        const currentPage = parseInt(callbackData.split('_')[1]) || 1;
        const totalChannels = Object.keys(channels).length;
        const totalPages = Math.ceil(totalChannels / ITEMS_PER_PAGE);
        const pageInfoText = `Выберите каналы для отправки:\n\nСтраница ${currentPage} из ${totalPages} (всего каналов: ${totalChannels})`;
    
        await bot.editMessageText(pageInfoText, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            reply_markup: {
                inline_keyboard: generateChannelButtons(currentPage, ITEMS_PER_PAGE)
            }
        });
        return;
    }
    

    // Логика удаления выбранных каналов
    if (callbackData === 'remove_selected') {
        const client = await pool.connect(); // Получаем соединение с базой данных
        
        try {
            for (const channelId of selectedForDeletion) {
                delete channels[channelId]; // Удаляем канал из списка
    
                // Выполняем удаление канала из таблицы user_chanels
                await client.query(
                    `DELETE FROM user_chanels 
                     WHERE channel_id = $1 AND user_id = $2 RETURNING channel_name`,
                    [channelId, userId]
                );
                // if (result.rows.length === 0) {
                //     console.log('Канал не найден или уже удален.');
                //     return;
                // }

                // const channelName = result.rows[0].channel_name;
                // console.log(channelName);

                // const groupIdResult = await client.query(
                //     'SELECT id FROM user_group WHERE user_id = $1 AND group_name = $2',
                //     [userId, channelName]  // Use channelName instead of grouplName
                // );

                // if (groupIdResult.rows.length === 0) {
                //     console.log('Группа не найдена.');
                //     return;
                // }

                // const groupId = groupIdResult.rows[0].id;

                await client.query(
                    `DELETE FROM group_channel 
                    WHERE channel_id = $1`,
                    [channelId]
                );
            }
    
            selectedForDeletion = []; // Очищаем список
            await bot.sendMessage(chatId, 'Выбранные каналы успешно удалены.');
            await bot.editMessageReplyMarkup({
                inline_keyboard: generateChannelButtons() // Возвращаем основное меню каналов
            }, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id
            });
        } catch (error) {
            console.error('Ошибка удаления каналов:', error);
            await bot.sendMessage(chatId, 'Произошла ошибка при удалении каналов. Попробуйте еще раз.');
        } finally {
            client.release(); // Освобождаем соединение с базой данных
        }
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
        let textToSend = '';        
        
        const finalizeMediaGroup = async () => {
            if (mediaGroup.length > 0) {
                isSending = true;
                const originalMessage = mediaGroup[0];
                const fromChatId = originalMessage.fromChatId;
                const messageId = originalMessage.messageId;

                console.log ('fromChatId', fromChatId, messageId)
                for (const channelId of channelsToSend) {
                    try {
                        if (fromChatId && messageId) {
                            try {
                                const copyMediaGroup = mediaGroup.map((item) => {
                                    return { ...item };
                                });
                                const channelUsername = await getChannelUsernameById(fromChatId)
                                const originalMessageText = originalMessage.caption || 'Текст сообщения недоступен';
                                const fromChatTitle = originalMessage.fromChatTitle || 'Неизвестный источник';
                                console.log('channelUsername', channelUsername)
                                const fromChatLink = `https://t.me/${channelUsername}/${messageId}`;
                        
                                // Строим сообщение с шапкой
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${originalMessageText}`;
                                
                                const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);

                                const textMessageId = sentMessage[0].message_id;

                                await bot.editMessageCaption(messageText, {
                                    chat_id: channelId,
                                    message_id: textMessageId,
                                    parse_mode: 'Markdown'
                                });
                                selectedChannels = [];
                            }
                            catch (error) {
                                console.error(`Ошибка пересылки в канал ${channelId}:`, error);
                                const copyMediaGroup = mediaGroup.map((item) => {
                                    return { ...item };
                                });
                        
                                const originalMessageText = originalMessage.caption || 'Текст сообщения недоступен';
                                const fromChatTitle = originalMessage.fromChatTitle || 'Неизвестный источник';
                                const fromChatLink = `https://t.me/${fromChatTitle}`;
                        
                                // Строим сообщение с шапкой
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${originalMessageText}`;
                                
                                const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);
                                const messageId = sentMessage[0].message_id;

                                await bot.editMessageCaption(messageText, {
                                    chat_id: channelId,
                                    message_id: messageId,
                                    parse_mode: 'Markdown'
                                });

                                selectedChannels = [];
                            }
                                
                        }
                        else {
                            console.log('channelId', channelId)
                            const channelTitle = channels[channelId];
                            const channelUsername = await getChannelUsernameById(channelId);
                            console.log('channelUsername', channelUsername)
                            // if (!channelUsername) {
                            //     console.error(`Канал с ID ${channelId} не имеет username.`);
                            //     continue;
                            // }

                            const copyMediaGroup = mediaGroup.map((item) => {
                                return { ...item };
                            });

                            const originalMessageText = copyMediaGroup[0].caption;    
                            const hyperlinkText = `${originalMessageText}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                            const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);
                            const messageId = sentMessage[0].message_id;

                            await bot.editMessageCaption(hyperlinkText, {
                                chat_id: channelId,
                                message_id: messageId,
                                parse_mode: 'Markdown'
                            });

                            selectedChannels = [];
                        }
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
        
                clearTimeout(mediaTimeout);
        
                if (msg.photo) {
                    mediaGroup.push({
                        type: 'photo',
                        media: msg.photo[msg.photo.length - 1].file_id,
                        caption: mediaGroup.length === 0 ? msg.text || msg.caption || '' : undefined,
                        fromChatId: msg.forward_from_chat ? msg.forward_from_chat.id : null,
                        messageId: msg.forward_from_message_id || null,
                        fromChatTitle: msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
                    });
                }
                
                if (msg.video) {
                    mediaGroup.push({
                        type: 'video',
                        media: msg.video.file_id,
                        caption: mediaGroup.length === 0 ? textToSend : undefined,
                        fromChatId: msg.forward_from_chat ? msg.forward_from_chat.id : null,
                        messageId: msg.forward_from_message_id || null,
                        fromChatTitle: msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник' // Добавляем title
                    });
                }
        
                mediaTimeout = setTimeout(finalizeMediaGroup, 2000);
            } else if (!msg.media_group_id && isGroupProcessing) {
                clearTimeout(mediaTimeout);
                await finalizeMediaGroup();
            } else if (!isGroupProcessing) {
                const originalText = msg.text || msg.caption || '';
                const textToSend = `${formatTextWithEntities(originalText, msg.entities || [])}`;
        
                if (msg.photo || msg.video) {
                    // Если есть фото или видео, отправляем медиафайлы с текстом
                    for (const channelId of channelsToSend) {
                        const channelTitle = channels[channelId];
                        let channelUsername = await getChannelUsernameById(channelId);
                        const fromChatId = msg.forward_from_chat ? msg.forward_from_chat.id : null;
                        const messageId = msg.forward_from_message_id || null
                        const fromChatTitle = msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
        
                        // if (!channelUsername) {
                        //     console.error(`Канал с ID ${channelId} не имеет username.`);
                        //     channelUsername = 'Переслано'
                        // }
        
                        if (msg.photo) {
                            if (fromChatId) {
                                let channelUsername = await getChannelUsernameById(channelId);
                                let fromChannelUsername = await getChannelUsernameById(fromChatId);
                                const fromChatLink = `https://t.me/${fromChannelUsername}/${messageId}`;
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${textToSend}`;
                                try {
                                    await bot.forwardMessage(channelId, fromChatId, messageId);
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                } catch (error) {
                                    console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                    // Отправка медиафайла с текстом вручную
                                    const sentMessage = await bot.sendPhoto(channelId, msg.photo[msg.photo.length - 1].file_id, {
                                        caption: messageText,
                                        parse_mode: 'Markdown'
                                    });
                                    const hyperlinkText = `${messageText}\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                    await bot.editMessageCaption(hyperlinkText, {
                                        chat_id: channelId,
                                        message_id: sentMessage.message_id,
                                        parse_mode: 'Markdown'
                                    });
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                }
                            } else {
                                const sentMessage = await bot.sendPhoto(channelId, msg.photo[msg.photo.length - 1].file_id, {
                                    caption: textToSend,
                                    parse_mode: 'Markdown'
                                });
                                const hyperlinkText = `${textToSend}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                await bot.editMessageCaption(hyperlinkText, {
                                    chat_id: channelId,
                                    message_id: sentMessage.message_id,
                                    parse_mode: 'Markdown'
                                });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        }
        
                        if (msg.video) {
                            if (fromChatId) {
                                let channelUsername = await getChannelUsernameById(channelId);
                                let fromChannelUsername = await getChannelUsernameById(fromChatId);
                                const fromChatLink = `https://t.me/${fromChannelUsername}/${messageId}`;
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${textToSend}`;
                                try {
                                    await bot.forwardMessage(channelId, fromChatId, messageId);
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                } catch (error) {
                                    console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                    // Отправка медиафайла с текстом вручную
                                    const sentMessage = await bot.sendVideo(channelId, msg.video.file_id, {
                                        caption: messageText,
                                        parse_mode: 'Markdown'
                                    });
                                    const hyperlinkText = `${messageText}\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                    await bot.editMessageCaption(hyperlinkText, {
                                        chat_id: channelId,
                                        message_id: sentMessage.message_id,
                                        parse_mode: 'Markdown'
                                    });
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                }
                            } else {
                                const sentMessage = await bot.sendVideo(channelId, msg.video.file_id, {
                                    caption: textToSend,
                                    parse_mode: 'Markdown'
                                });
                                const hyperlinkText = `${textToSend}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                await bot.editMessageCaption(hyperlinkText, {
                                    chat_id: channelId,
                                    message_id: sentMessage.message_id,
                                    parse_mode: 'Markdown'
                                });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        }
                    }
                } else {
                    for (const channelId of channelsToSend) {
                        const fromChatId = msg.forward_from_chat ? msg.forward_from_chat.id : null;
                        const messageId = msg.forward_from_message_id || null
                        const fromChatTitle = msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
                        const channelTitle = channels[channelId];
                        let channelUsername = await getChannelUsernameById(channelId);
        
                        if (!channelUsername) {
                            console.error(`Канал с ID ${channelId} не имеет username.`);
                        }
        
                        if (fromChatId) {
                            let channelUsername = await getChannelUsernameById(channelId);
                            let fromChannelUsername = await getChannelUsernameById(fromChatId);
                            const fromChatLink = `${fromChannelUsername}/${messageId}`;
                            const messageText = `📢 Переслано из <a href="https://t.me/${fromChatLink}">${fromChatTitle}</a>:\n\n${textToSend}`;
                            try {
                                await bot.forwardMessage(channelId, fromChatId, messageId);
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            } catch (error) {
                                console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                // Отправка медиафайла с текстом вручную
                                const textMessage = `${messageText}\n\nПодписывайтесь на канал - <a href="https://t.me/${channelUsername}">${channelTitle}</a>`;
                                await bot.sendMessage(channelId, textMessage, { parse_mode: 'HTML' });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        } else {
                            const textMessage = `${textToSend}\n\nПодписывайтесь на канал - <a href="https://t.me/${channelUsername}">${channelTitle}</a>`;
                            try {
                                await bot.sendMessage(channelId, textMessage, { parse_mode: 'HTML' });
                                await bot.sendMessage(chatId, `Текстовое сообщение успешно отправлено в канал ${channelTitle}.`);
                            } catch (error) {
                                console.error(`Ошибка отправки в канал ${channelId}:`, error);
                            }
                            selectedChannels = [];
                        }
                    }
                }
                bot.removeListener('message', handleMediaMessage);
            }
        };

        bot.on('message', handleMediaMessage);
    } else if (callbackData === 'select_all') {
        if (selectedChannels.length === Object.keys(channels).length) {
            // Если все каналы уже выбраны, отменяем выбор
            selectedChannels = [];
            
            // Обновляем текст сообщения
            await bot.editMessageText('Выбор отменен. Ни один канал не выбран.', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                reply_markup: {
                    inline_keyboard: generateChannelButtons() // Обновляем кнопки
                }
            });
        } else {
            // Если не все каналы выбраны, выбираем все
            selectedChannels = Object.keys(channels);
            
            // Обновляем текст сообщения
            await bot.editMessageText('Выбраны все каналы.', {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                reply_markup: {
                    inline_keyboard: generateChannelButtons() // Обновляем кнопки
                }
            });
        }
    }
     else if (callbackData === 'send_in_group') {
        const channelsToSend = toggleChannels;
        if (channelsToSend.length === 0) {
            await bot.sendMessage(chatId, 'Нет выбранных каналов.');
            return;
        }

        await bot.sendMessage(chatId, 'Введите текст для рассылки и прикрепите медиа (фото или видео).');

        let mediaGroup = [];
        let isGroupProcessing = false;
        let mediaTimeout;
        let textToSend = '';      

        const finalizeMediaGroup = async () => {
            if (mediaGroup.length > 0) {
                isSending = true;
                const originalMessage = mediaGroup[0];
                const fromChatId = originalMessage.fromChatId;
                const messageId = originalMessage.messageId;
                for (const channelId of channelsToSend) {
                    try {
                        if (fromChatId && messageId) {
                            try {
                                const copyMediaGroup = mediaGroup.map((item) => {
                                    return { ...item };
                                });
                                const channelUsername = await getChannelUsernameById(fromChatId)
                                const originalMessageText = originalMessage.caption || 'Текст сообщения недоступен';
                                const fromChatTitle = originalMessage.fromChatTitle || 'Неизвестный источник';
                                console.log('channelUsername', channelUsername)
                                const fromChatLink = `https://t.me/${channelUsername}/${messageId}`;
                        
                                // Строим сообщение с шапкой
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${originalMessageText}`;
                                
                                const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);

                                const textMessageId = sentMessage[0].message_id;

                                await bot.editMessageCaption(messageText, {
                                    chat_id: channelId,
                                    message_id: textMessageId,
                                    parse_mode: 'Markdown'
                                });
                                selectedChannels = [];
                            }
                            catch (error) {
                                console.error(`Ошибка пересылки в канал ${channelId}:`, error);
                                const copyMediaGroup = mediaGroup.map((item) => {
                                    return { ...item };
                                });
                        
                                const originalMessageText = originalMessage.caption || 'Текст сообщения недоступен';
                                const fromChatTitle = originalMessage.fromChatTitle || 'Неизвестный источник';
                                const fromChatLink = `https://t.me/${fromChatTitle}`;
                        
                                // Строим сообщение с шапкой
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${originalMessageText}`;
                                
                                const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);
                                const messageId = sentMessage[0].message_id;

                                await bot.editMessageCaption(messageText, {
                                    chat_id: channelId,
                                    message_id: messageId,
                                    parse_mode: 'Markdown'
                                });

                                selectedChannels = [];
                            }
                                
                        }
                        else {
                            console.log('channelId', channelId)
                            const channelTitle = channels[channelId];
                            const channelUsername = await getChannelUsernameById(channelId);
                            console.log('channelUsername', channelUsername)
                            // if (!channelUsername) {
                            //     console.error(`Канал с ID ${channelId} не имеет username.`);
                            //     continue;
                            // }

                            const copyMediaGroup = mediaGroup.map((item) => {
                                return { ...item };
                            });

                            const originalMessageText = copyMediaGroup[0].caption;    
                            const hyperlinkText = `${originalMessageText}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                            const sentMessage = await bot.sendMediaGroup(channelId, copyMediaGroup);
                            const messageId = sentMessage[0].message_id;

                            await bot.editMessageCaption(hyperlinkText, {
                                chat_id: channelId,
                                message_id: messageId,
                                parse_mode: 'Markdown'
                            });

                            selectedChannels = [];
                        }
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
        
                clearTimeout(mediaTimeout);
        
                if (msg.photo) {
                    mediaGroup.push({
                        type: 'photo',
                        media: msg.photo[msg.photo.length - 1].file_id,
                        caption: mediaGroup.length === 0 ? msg.text || msg.caption || '' : undefined,
                        fromChatId: msg.forward_from_chat ? msg.forward_from_chat.id : null,
                        messageId: msg.forward_from_message_id || null,
                        fromChatTitle: msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
                    });
                }
                
                if (msg.video) {
                    mediaGroup.push({
                        type: 'video',
                        media: msg.video.file_id,
                        caption: mediaGroup.length === 0 ? textToSend : undefined,
                        fromChatId: msg.forward_from_chat ? msg.forward_from_chat.id : null,
                        messageId: msg.forward_from_message_id || null,
                        fromChatTitle: msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник' // Добавляем title
                    });
                }
        
                mediaTimeout = setTimeout(finalizeMediaGroup, 2000);
            } else if (!msg.media_group_id && isGroupProcessing) {
                clearTimeout(mediaTimeout);
                await finalizeMediaGroup();
            } else if (!isGroupProcessing) {
                const originalText = msg.text || msg.caption || '';
                const textToSend = `${formatTextWithEntities(originalText, msg.entities || [])}`;
        
                if (msg.photo || msg.video) {
                    // Если есть фото или видео, отправляем медиафайлы с текстом
                    for (const channelId of channelsToSend) {
                        const channelTitle = channels[channelId];
                        let channelUsername = await getChannelUsernameById(channelId);
                        const fromChatId = msg.forward_from_chat ? msg.forward_from_chat.id : null;
                        const messageId = msg.forward_from_message_id || null
                        const fromChatTitle = msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
        
                        // if (!channelUsername) {
                        //     console.error(`Канал с ID ${channelId} не имеет username.`);
                        //     channelUsername = 'Переслано'
                        // }
        
                        if (msg.photo) {
                            if (fromChatId) {
                                let channelUsername = await getChannelUsernameById(channelId);
                                let fromChannelUsername = await getChannelUsernameById(fromChatId);
                                const fromChatLink = `https://t.me/${fromChannelUsername}/${messageId}`;
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${textToSend}`;
                                try {
                                    await bot.forwardMessage(channelId, fromChatId, messageId);
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                } catch (error) {
                                    console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                    // Отправка медиафайла с текстом вручную
                                    const sentMessage = await bot.sendPhoto(channelId, msg.photo[msg.photo.length - 1].file_id, {
                                        caption: messageText,
                                        parse_mode: 'Markdown'
                                    });
                                    const hyperlinkText = `${messageText}\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                    await bot.editMessageCaption(hyperlinkText, {
                                        chat_id: channelId,
                                        message_id: sentMessage.message_id,
                                        parse_mode: 'Markdown'
                                    });
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                }
                            } else {
                                const sentMessage = await bot.sendPhoto(channelId, msg.photo[msg.photo.length - 1].file_id, {
                                    caption: textToSend,
                                    parse_mode: 'Markdown'
                                });
                                const hyperlinkText = `${textToSend}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                await bot.editMessageCaption(hyperlinkText, {
                                    chat_id: channelId,
                                    message_id: sentMessage.message_id,
                                    parse_mode: 'Markdown'
                                });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        }
        
                        if (msg.video) {
                            if (fromChatId) {
                                let channelUsername = await getChannelUsernameById(channelId);
                                let fromChannelUsername = await getChannelUsernameById(fromChatId);
                                const fromChatLink = `https://t.me/${fromChannelUsername}/${messageId}`;
                                const messageText = `📢 Переслано из [${fromChatTitle}](${fromChatLink}):\n\n${textToSend}`;
                                try {
                                    await bot.forwardMessage(channelId, fromChatId, messageId);
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                } catch (error) {
                                    console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                    // Отправка медиафайла с текстом вручную
                                    const sentMessage = await bot.sendVideo(channelId, msg.video.file_id, {
                                        caption: messageText,
                                        parse_mode: 'Markdown'
                                    });
                                    const hyperlinkText = `${messageText}\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                    await bot.editMessageCaption(hyperlinkText, {
                                        chat_id: channelId,
                                        message_id: sentMessage.message_id,
                                        parse_mode: 'Markdown'
                                    });
                                    await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                    selectedChannels = [];
                                }
                            } else {
                                const sentMessage = await bot.sendVideo(channelId, msg.video.file_id, {
                                    caption: textToSend,
                                    parse_mode: 'Markdown'
                                });
                                const hyperlinkText = `${textToSend}\n\nПодписывайтесь на канал - [${channelTitle}](https://t.me/${channelUsername})`;
                                await bot.editMessageCaption(hyperlinkText, {
                                    chat_id: channelId,
                                    message_id: sentMessage.message_id,
                                    parse_mode: 'Markdown'
                                });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        }
                    }
                } else {
                    // Если только текст, отправляем текстовое сообщение с гиперссылкой
                    for (const channelId of channelsToSend) {
                        const fromChatId = msg.forward_from_chat ? msg.forward_from_chat.id : null;
                        const messageId = msg.forward_from_message_id || null
                        const fromChatTitle = msg.forward_from_chat ? msg.forward_from_chat.title : 'Неизвестный источник'
                        const channelTitle = channels[channelId];
                        let channelUsername = await getChannelUsernameById(channelId);
        
                        if (!channelUsername) {
                            console.error(`Канал с ID ${channelId} не имеет username.`);
                        }
        
                        if (fromChatId) {
                            let channelUsername = await getChannelUsernameById(channelId);
                            let fromChannelUsername = await getChannelUsernameById(fromChatId);
                            const fromChatLink = `https://t.me/${fromChannelUsername}/${messageId}`;
                            const messageText = `📢 Переслано из <a href="${fromChatLink}">${fromChatTitle}</a>:\n\n${textToSend}`;
                            try {
                                await bot.forwardMessage(channelId, fromChatId, messageId);
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            } catch (error) {
                                console.error(`Ошибка пересылки сообщения из ${fromChatId}:`, error.statusCode);
                                // Отправка медиафайла с текстом вручную
                                const textMessage = `${messageText}\n\nПодписывайтесь на канал - <a href="https://t.me/${channelUsername}">${channelTitle}</a>`;
                                await bot.sendMessage(channelId, textMessage, { parse_mode: 'HTML' });
                                await bot.sendMessage(chatId, `Сообщение с фото успешно отправлено в канал ${channelTitle}.`);
                                selectedChannels = [];
                            }
                        } else {
                            const textMessage = `${textToSend}\n\nПодписывайтесь на канал - <a href="https://t.me/${channelUsername}">${channelTitle}</a>`;
                            try {
                                await bot.sendMessage(channelId, textMessage, { parse_mode: 'HTML' });
                                await bot.sendMessage(chatId, `Текстовое сообщение успешно отправлено в канал ${channelTitle}.`);
                            } catch (error) {
                                console.error(`Ошибка отправки в канал ${channelId}:`, error);
                            }
                            selectedChannels = [];
                        }
                    }
                }
                bot.removeListener('message', handleMediaMessage);
            }
        };

        bot.on('message', handleMediaMessage);
    } else if (
        callbackData !== 'view_groups' && 
        callbackData !== 'main_menu' && 
        callbackData !== 'view_group' && 
        callbackData !== 'create_group' && 
        callbackData.split('_')[0] !== 'group' && 
        callbackData !== 'confirm_create_group' &&
        callbackData.split('_')[0] !== 'view' &&
        callbackData.split('_')[0] !== 'add' &&
        callbackData.split('_')[0] !== 'confirm' &&
        callbackData.split('_')[0] !== 'settings' &&
        callbackData.split('_')[0] !== 'delete' &&
        callbackData.split('_')[0] !== 'select' &&
        callbackData.split('_')[0] !== 'send'  &&
        callbackData.split('_')[0] !== 'edit'  &&
        callbackData.split('_')[0] !== 'remove' &&
        callbackData.startsWith !== 'toggle_channel_' &&
        callbackData.split('_')[0] !== 'toggle'
    ) {

        const [channelId, page] = callbackData.split('_'); // Извлекаем id канала и текущую страницу
        const currentPage = parseInt(page) || 1; // Сохраняем текущую страницу
        if (selectedChannels.includes(channelId)) {
            selectedChannels = selectedChannels.filter(id => id !== channelId); // Удаляем из выбранных
        } else {
            selectedChannels.push(channelId); // Добавляем в выбранные
        }

        // Обновляем клавиатуру, сохраняя текущую страницу
        await bot.editMessageReplyMarkup({
            inline_keyboard: generateChannelButtons(currentPage, ITEMS_PER_PAGE) // Передаем текущую страницу
        }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
        });
    
        return;
    }
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