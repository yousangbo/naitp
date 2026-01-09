import { saveSettingsDebounced, extension_settings, getContext } from "../../../extensions.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { eventSource, event_types } from "../../../script.js";

const extensionName = import.meta.url.split('/').slice(0, -1).pop();
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

const settingsHtml = `
<div class="nai-img-helper-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>NAI图片助手</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div style="background-color:#202020;padding:10px;border-radius:5px;margin-bottom:10px;border:1px solid #444;">
                <label class="checkbox_label"><input type="checkbox" id="nai_enabled"/><b>启用插件</b></label><br><br>
                <label class="checkbox_label"><input type="checkbox" id="nai_auto_mode"/><b>自动绘图</b></label>
            </div>
            <label>API地址:</label><input type="text" id="nai_api_url" class="text_pole"/><br><br>
            <label>模型ID:</label><input type="text" id="nai_model" class="text_pole"/><br><br>
            <label>尺寸:</label>
            <select id="nai_size" class="text_pole">
                <option value="832:1216">832:1216</option>
                <option value="1216:832">1216:832</option>
                <option value="1024:1024">1024:1024</option>
            </select><br><br>
            <label>前缀:</label><textarea id="nai_prefix" class="text_pole" rows="2"></textarea><br><br>
            <label>反向:</label><textarea id="nai_negative" class="text_pole" rows="3"></textarea><br><br>
            <label>采样:</label>
            <select id="nai_sampler" class="text_pole">
                <option value="Euler Ancestral">Euler Ancestral</option>
                <option value="Euler">Euler</option>
                <option value="DPM++ 2S Ancestral">DPM++ 2S Ancestral</option>
                <option value="DPM++ 2M SDE">DPM++ 2M SDE</option>
            </select>
        </div>
    </div>
</div>`;

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
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
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
            const imageHtml = `<br><img src="${imageUrl}" class="generated_image" style="max-width: 100%; border-radius: 10px; margin-top: 10px; display: block;">`;
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
    if (!context.chat || !context.chat[id]) return;
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
    $('#extensions_settings').append(settingsHtml);
    $('#nai_enabled').prop('checked', settings.enabled).on('change', function() { settings.enabled = $(this).prop('checked'); saveSettings(); });
    $('#nai_auto_mode').prop('checked', settings.autoMode).on('change', function() { settings.autoMode = $(this).prop('checked'); saveSettings(); });
    $('#nai_api_url').val(settings.apiUrl).on('input', function() { settings.apiUrl = $(this).val().replace(/\/$/, ""); saveSettings(); });
    $('#nai_model').val(settings.model).on('input', function() { settings.model = $(this).val(); saveSettings(); });
    $('#nai_size').val(settings.size).on('change', function() { settings.size = $(this).val(); saveSettings(); });
    $('#nai_prefix').val(settings.prefix).on('input', function() { settings.prefix = $(this).val(); saveSettings(); });
    $('#nai_negative').val(settings.negativePrompt).on('input', function() { settings.negativePrompt = $(this).val(); saveSettings(); });
    $('#nai_sampler').val(settings.sampler).on('change', function() { settings.sampler = $(this).val(); saveSettings(); });

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'img',
        callback: (args, value) => generateImage(value, false),
        returns: '生成图片',
        helpString: '用法: /img <提示词>'
    }));

    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
});
