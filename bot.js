import lib from 'https://bash.ooo/lib.js';
import Bot from 'https://raw.githubusercontent.com/TxThinkingInc/zhi.js/refs/heads/master/bot.js'

var bot_token = "TODO" // get from https://www.txthinking.com/zhi.html
var openai_api_key = "TODO" // get from https://platform.openai.com/api-keys
var chats = [
    // One Bot Token can be used in multiple Chats
    {
        ChatUUID: "TODO", // get from https://www.txthinking.com/zhi.html
        Key: "TODO", // the Chat Key
        UserUUID: "TODO", // get from https://www.txthinking.com/zhi.html
        Name: "TODO", // bot name
        Avatar: "TODO", // bot avatar, file path
    },
]

/////////////////////////////////////////////////////////////////////////////////////////////////////////

function help(model, memory) {
    return `
You can see this by sending message:

    /help

Models:

    1. gpt-4-turbo
    2. gpt-4
    3. gpt-4o
    4. o1

Current Model: ${model}. You can change model by sending message:

    /model 1
    /model 2
    /model 3
    /model 4

Current Memory: ${memory} messages. You can start a new session by sending message:

    /new

`
}

var sessions = {}
var models = {}
var syncs = {}
for (var i = 0; i < chats.length; i++) {
    sessions[chats[i].ChatUUID] = [
        {
            role: 'system',
            content: 'You are a helpful assistant.',
        },
    ]
    models[chats[i].ChatUUID] = 'gpt-4-turbo'
    syncs[chats[i].ChatUUID] = new lib.Sync()
}
var bot = await Bot.init(bot_token, chats)
async function run() {
    await bot.connect()
    for (var i = 0; i < chats.length; i++) {
        await bot.send_markdown(chats[i].ChatUUID, help(models[chats[i].ChatUUID], sessions[chats[i].ChatUUID].length))
    }
    bot.on_error(async function(e) {
        console.log("error", e)
    })
    bot.on_close(async function(e) {
        console.log("close", e)
        bot.close()
        await Bun.sleep(3000);
        await run()
    })
    bot.on_message(async function(m) {
        await syncs[m.ChatUUID].atomic(async () => {
            try {
                await handle_message(m)
            } catch (e) {
                console.log("handle_message", e)
            }
        })
    })
}
await run()

async function handle_message(m) {
    if (m.Kind != "text" && m.Kind != "markdown") {
        await bot.send_text(m.ChatUUID, "Only support text message now. PR welcome.")
        return
    }
    if ("/help" == m.Text.trim()) {
        await bot.send_markdown(m.ChatUUID, help(models[m.ChatUUID], sessions[m.ChatUUID].length))
        return
    }
    if (/^\/model [1,2,3,4]$/.test(m.Text.trim())) {
        var i = m.Text.trim().substring(7)
        if (i == 1) {
            models[m.ChatUUID] = "gpt-4-turbo"
        }
        if (i == 2) {
            models[m.ChatUUID] = "gpt-4"
        }
        if (i == 3) {
            models[m.ChatUUID] = "gpt-4o"
        }
        if (i == 4) {
            models[m.ChatUUID] = "o1"
        }
        await bot.send_text(m.ChatUUID, `Switched to ${models[m.ChatUUID]}`)
        return
    }
    if ("/new" == m.Text.trim()) {
        sessions[m.ChatUUID] = [
            {
                role: 'system',
                content: 'You are a helpful assistant.',
            },
        ]
        await bot.send_text(m.ChatUUID, `New session started`)
        return
    }
    sessions[m.ChatUUID].push({
        role: 'user',
        content: m.Text,
    })
    try {
        var r = await chat_gpt(sessions[m.ChatUUID], models[m.ChatUUID], m.ChatUUID)
    } catch (e) {
        sessions[m.ChatUUID].pop()
        await bot.send_text(m.ChatUUID, e.toString())
        return
    }
    sessions[m.ChatUUID].push({
        role: 'system',
        content: r.text,
    })
    await bot.send_markdown(m.ChatUUID, r.text)
}

async function chat_gpt(messages, model, user) {
    var r = await fetch(`https://api.openai.com/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openai_api_key}`,
        },
        body: JSON.stringify({
            model: model,
            user: `${user}`,
            messages: messages,
        }),
    })
    if (r.status != 200) {
        throw await r.text()
    }
    var j = await r.json()
    return {
        text: j.choices[0].message.content,
        input: j.usage.prompt_tokens,
        output: j.usage.completion_tokens,
    }
}
