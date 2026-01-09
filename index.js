import { saveSettingsDebounced, extension_settings, getContext, renderExtensionTemplateAsync } from "../../../extensions.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { eventSource, event_types } from "../../../script.js";

const extensionName = "nai-img-helper";
const defaultSettings = {
    enabled: true,
    autoMode: false,
    apiUrl: "http://127.0.0.1:8080",
    model: "nai-diffusion-4-5-full",
    size: "832:1216",
    prefix: "masterpiece, best quality, ",
    negativePrompt: "blurry, lowres, bad quality, worst quality, ugly, deformed, low quality, jpeg artifacts, nsfw",
    sampler: "Euler Ancestral"
};

let settings = extension_settings[extensionName] || {};
Object.assign(settings, defaultSettings);

async function loadSettings() {
    const html = await renderExtensionTemplateAsync(extensionName, 'settings');
    $('#extensions_settings').append(html);

    $('#nai_enabled').prop('checked', settings.enabled).on('change', function() {
        settings.enabled = $(this).prop('checked');
        saveSettings();
    });
    $('#nai_auto_mode').prop('checked', settings.autoMode).on('change', function() {
        settings.autoMode = $(this).prop('checked');
        saveSettings();
    });
    $('#nai_api_url').val(settings.apiUrl).on('input', function() {
        settings.apiUrl = $(this).val().replace(/\/$/, "");
        saveSettings();
    });
    $('#nai_model').val(settings.model).on('input', function() {
        settings.model = $(this).val();
        saveSettings();
    });
    $('#nai_size').val(settings.size).on('change', function() {
        settings.size = $(this).val();
        saveSettings();
    });
    $('#nai_prefix').val(settings.prefix).on('input', function() {
        settings.prefix = $(this).val();
        saveSettings();
    });
    $('#nai_negative').val(settings.negativePrompt).on('input', function() {
        settings.negativePrompt = $(this).val();
        saveSettings();
    });
    $('#nai_sampler').val(settings.sampler).on('change', function() {
        settings.sampler = $(this).val();
        saveSettings();
    });
}

function saveSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

async function generateImage(prompt, isAuto = false) {
    if (!settings.enabled) return;
    if (!prompt) return;

    const context = getContext();
    const endpoint = `${settings.apiUrl}/v1/chat/completions`;
    
    if (!isAuto) toastr.info("正在请求 NAI 生成图片...", "NAI图片助手");
    console.log("[NAI图片助手] 正在生成，提示词:", prompt);

    const finalPrompt = (settings.prefix || "") + prompt;

    const payload = {
        model: settings.model,
        messages: [{ role: "user", content: finalPrompt }],
        size: settings.size,
        negative_prompt: settings.negativePrompt,
        sampler: settings.sampler,
        stream: false
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API 错误: ${response.status}`);
        const data = await response.json();
        
        let imageUrl = "";
        if (data.choices && data.choices[0] && data.choices[0].message) {
            imageUrl = data.choices[0].message.content;
        } else if (data.url) {
            imageUrl = data.url;
        }

        if (imageUrl) {
            const urlMatch = imageUrl.match(/\((https?:\/\/.*?)\)/);
            if (urlMatch) imageUrl = urlMatch[1];

            const imageHtml = `<br><img src="${imageUrl}" class="generated_image" style="max-width: 100%; border-radius: 10px; margin-top: 10px; display: block; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">`;
            
            const chat = context.chat;
            if (chat.length > 0) {
                const lastMsg = chat[chat.length - 1];
                
                if (!lastMsg.mes.includes(imageUrl)) {
                    lastMsg.mes += `\n${imageHtml}`;
                    context.saveChat();
                    context.reloadChat();
                    if (!isAuto) toastr.success("图片生成完毕！");
                }
            }
        }
    } catch (error) {
        console.error(error);
        if (!isAuto) toastr.error("生成失败: " + error.message);
    }
}

function onMessageReceived(id) {
    if (!settings.enabled || !settings.autoMode) return;

    const context = getContext();
    const message = context.chat[id];

    if (message && !message.is_user && !message.is_system) {
        setTimeout(() => {
            let cleanText = message.mes.replace(/<[^>]*>?/gm, '');
            let prompt = cleanText.substring(0, 200); 
            generateImage(prompt, true);
        }, 500);
    }
}

jQuery(async () => {
    await loadSettings();
    
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'img',
        callback: (args, value) => generateImage(value, false),
        returns: '生成图片',
        helpString: '用法: /img <提示词>'
    }));

    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    
    console.log("[NAI图片助手] 插件已加载 - 作者: 忆安");
});
