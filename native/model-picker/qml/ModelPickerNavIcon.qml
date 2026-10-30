import QtQuick

Item {
    id: icon
    required property string entry
    property int size: ModelPickerTheme.navIconSize
    property color color: ModelPickerTheme.muted
    width: size
    height: size
    readonly property string quickPath: entry === "All" ? "M4 8h4V4H4zm6 12h4v-4h-4zm-6 0h4v-4H4zm0-6h4v-4H4zm6 0h4v-4h-4zm6-10v4h4V4zm-6 4h4V4h-4zm6 6h4v-4h-4zm0 6h4v-4h-4z" :
                                       entry === "Favorites" ? "m22 9.24-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28z" :
                                       entry === "Recent" ? "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z" : ""
    readonly property var providerFiles: ({
        "openai": "openai.svg",
        "openai-chat": "openai.svg",
        "chatgpt": "openai.svg",
        "anthropic": "anthropic.svg",
        "claude": "claude-color.svg",
        "google": "gemini-color.svg",
        "gemini": "gemini-color.svg",
        "google-ai": "gemini-color.svg",
        "google-cloud": "googlecloud-color.svg",
        "vertexai": "vertexai-color.svg",
        "huggingface": "huggingface-color.svg",
        "huggingface-local": "huggingface-color.svg",
        "huggingface-inference": "huggingface-color.svg",
        "hf_inference": "huggingface-color.svg",
        "ollama": "ollama.svg",
        "llama.cpp": "ollama.svg",
        "llamacpp": "ollama.svg",
        "llama-cpp": "ollama.svg",
        "lmstudio": "lmstudio.svg",
        "lm-studio": "lmstudio.svg",
        "azure": "azure-color.svg",
        "azureai": "azureai-color.svg",
        "aws": "aws-color.svg",
        "bedrock": "bedrock-color.svg",
        "replicate": "replicate.svg",
        "fal": "fal-color.svg",
        "fal-ai": "fal-color.svg",
        "falai": "fal-color.svg",
        "deepseek": "deepseek-color.svg",
        "groq": "groq.svg",
        "mistral": "mistral-color.svg",
        "together": "together-color.svg",
        "together-ai": "together-color.svg",
        "togetherai": "together-color.svg",
        "perplexity": "perplexity-color.svg",
        "ai21": "ai21.svg",
        "cloudflare": "cloudflare-color.svg",
        "workers-ai": "workersai-color.svg",
        "workersai": "workersai-color.svg",
        "fireworks": "fireworks-color.svg",
        "fireworks-ai": "fireworks-color.svg",
        "stability": "stability-color.svg",
        "stable-diffusion": "stability-color.svg",
        "cerebras": "cerebras-color.svg",
        "moonshot": "moonshot.svg",
        "novita": "novita-color.svg",
        "sambanova": "sambanova-color.svg",
        "siliconcloud": "siliconcloud-color.svg",
        "xinference": "xinference-color.svg",
        "dalle": "dalle-color.svg",
        "dall-e": "dalle-color.svg",
        "bfl": "bfl.svg",
        "black-forest-labs": "bfl.svg",
        "blackforestlabs": "bfl.svg",
        "flux": "flux.svg",
        "luma": "luma-color.svg",
        "luma-ai": "luma-color.svg",
        "recraft": "recraft.svg",
        "ideogram": "ideogram.svg",
        "tripo": "tripo-color.svg",
        "haiper": "haiper.svg",
        "kling": "kling-color.svg",
        "hunyuan": "hunyuan-color.svg",
        "pika": "pika.svg",
        "runway": "runway.svg",
        "vidu": "vidu-color.svg",
        "viggle": "viggle.svg",
        "hailuo": "hailuo-color.svg",
        "kolors": "kolors-color.svg",
        "krea": "krea.svg",
        "elevenlabs": "elevenlabs.svg",
        "eleven-labs": "elevenlabs.svg",
        "deepmind": "deepmind-color.svg",
        "xai": "xai.svg",
        "x": "xai.svg",
        "grok": "grok.svg",
        "meta": "meta-color.svg",
        "metaai": "metaai-color.svg",
        "llamaindex": "llamaindex-color.svg",
        "langchain": "langchain-color.svg",
        "langfuse": "langfuse-color.svg",
        "langsmith": "langsmith-color.svg",
        "langgraph": "langgraph-color.svg",
        "alibaba": "alibabacloud-color.svg",
        "alibaba-cloud": "alibabacloud-color.svg",
        "bailian": "bailian-color.svg",
        "qwen": "qwen-color.svg",
        "zhipu": "zhipu-color.svg",
        "chatglm": "chatglm-color.svg",
        "wenxin": "wenxin-color.svg",
        "baidu": "baidu-color.svg",
        "bytedance": "bytedance-color.svg",
        "doubao": "doubao-color.svg",
        "yi": "yi-color.svg",
        "stepfun": "stepfun-color.svg",
        "sensenova": "sensenova-color.svg",
        "minimax": "minimax-color.svg",
        "spark": "spark-color.svg",
        "iflytek": "iflytekcloud-color.svg",
        "internlm": "internlm-color.svg",
        "skywork": "skywork-color.svg",
        "tencent": "tencent-color.svg",
        "tencentcloud": "tencentcloud-color.svg",
        "yuanbao": "yuanbao-color.svg",
        "nvidia": "nvidia-color.svg",
        "hyperbolic": "hyperbolic-color.svg",
        "deepinfra": "deepinfra-color.svg",
        "baseten": "baseten.svg",
        "friendli": "friendli.svg",
        "exa": "exa-color.svg",
        "jina": "jina.svg",
        "upstage": "upstage-color.svg",
        "cohere": "cohere-color.svg",
        "commanda": "commanda-color.svg",
        "aya": "aya-color.svg",
        "palm": "palm-color.svg",
        "copilot": "copilot-color.svg",
        "github-copilot": "githubcopilot.svg",
        "github": "github.svg",
        "microsoft": "copilot-color.svg",
        "vercel": "vercel.svg",
        "openrouter": "openrouter.svg",
        "lobehub": "lobehub-color.svg",
        "automatic": "automatic-color.svg",
        "automatic1111": "automatic-color.svg",
        "stable-diffusion-webui": "automatic-color.svg",
        "glif": "glif.svg",
        "pollinations": "pollinations.svg",
        "ppio": "ppio-color.svg",
        "inference": "inference.svg",
        "featherless": "featherless-color.svg",
        "voyage": "voyage-color.svg"
    })
    readonly property string providerFile: providerFiles[entry.toLowerCase()] || ""
    readonly property string rgb: "rgb(" + Math.round(color.r * 255) + "," + Math.round(color.g * 255) + "," + Math.round(color.b * 255) + ")"
    Image {
        anchors.fill: parent
        visible: icon.quickPath !== ""
        sourceSize: Qt.size(icon.size * 2, icon.size * 2)
        source: icon.quickPath === "" ? "" : "data:image/svg+xml;utf8," + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="' + icon.rgb + '" d="' + icon.quickPath + '"/></svg>')
    }
    Image {
        id: providerLogo
        anchors.fill: parent
        visible: icon.quickPath === "" && icon.providerFile !== ""
        sourceSize: Qt.size(icon.size * 2, icon.size * 2)
        fillMode: Image.PreserveAspectFit
        source: icon.providerFile === "" ? "" : "qrc:/model-picker/providers/" + icon.providerFile
    }
    Text {
        anchors.centerIn: parent
        visible: icon.quickPath === "" && icon.providerFile === ""
        text: icon.entry.substring(0, 2).toUpperCase()
        color: icon.color
        font.pixelSize: ModelPickerTheme.eyebrowFontSize
        font.weight: Font.Normal
    }
}
