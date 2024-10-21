require('dotenv').config()
const TelegramBot =  require('node-telegram-bot-api')

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

        await bot.sendMessage('-1002327959084', msg.text);
    }
    catch (error) {
        console.error(error);
    }
})

bot.on('message', async msg => {
    console.log(msg);    
})

const commands = [
    {

        command: "start",
        description: "Запуск бота"

    },
    {

        command: "help",
        description: "Раздел помощи"

    },
]

bot.setMyCommands(commands);