require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const channels = {};
let selectedChannels = [];
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
});

bot.on('photo', async (msg) => {

    if (msg.forward_from_chat) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        pendingMedia.push({
            type: 'photo',
            media: fileId
        });
    } else {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        pendingMedia.push({
            type: 'photo',
            media: fileId
        });
    }
});

bot.on('video', async (msg) => {
    const fileId = msg.video.file_id;
    pendingMedia.push({
        type: 'video',
        media: fileId
    });
});

// Добавление канала
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
