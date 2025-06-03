const { app, core, imaging, action } = require('photoshop');
const { storage } = require('uxp');
const batchPlay = action.batchPlay;
const fs = storage.localFileSystem;

// ----------------------- API 地址 -----------------------
const KONTEXT_API_ENDPOINTS = {
    pro: "https://api.us1.bfl.ai/v1/flux-kontext-pro",
    max: "https://api.us1.bfl.ai/v1/flux-kontext-max",
};

// ----------------------- 加载 UI -----------------------
document.addEventListener("DOMContentLoaded", () => {
    console.log("Panel loaded");
    loadOrCreateSettings();
    initializeTabSwitching();
    initializeEventListeners();
});

// ========== Tab 切换 ==========
function initializeTabSwitching() {
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll("[data-tab-content]");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tabContents.forEach((content) => (content.style.display = "none"));
            tab.classList.add("active");
            const targetContent = document.querySelector(
                `[data-tab-content="${tab.dataset.tab}"]`,
            );
            if (targetContent) targetContent.style.display = "block";
        });
    });
}
// ========== 全局设置 ==========
let settings = {
    // Config tab
    apikey: "",
    // Fill tab
    prompt: "",
    steps: 30,
    guidance: 20,
    safetyTolerance: 2,
    promptUpsampling: false,
    // Edit tab
    kontextPrompt: "",
    kontextSelectedModel: "pro",
    kontextSeed: null,
    kontextPromptUpsampling: false,
    kontextSafetyTolerance: 2,
    kontextAspectRatio: null,
};

// 获取当前选区坐标 (retained from original)
async function getSelectionCoordinates() {
    try {
        const selectionInfo = await batchPlay(
            [
                {
                    _obj: "get",
                    _target: [
                        { _property: "selection" },
                        { _ref: "document", _enum: "ordinal", _value: "targetEnum" }
                    ]
                }
            ],
            { synchronousExecution: true }
        );

        const selection = selectionInfo[0].selection;
        if (!selection) {
            console.warn("当前没有选区！"); // Changed to warn as it might not be an error for Kontext tab if not using selection for mask
            return null;
        }

        if (selection._obj === "rectangle") {
            const coordinates = {
                top: selection.top._value,
                left: selection.left._value,
                bottom: selection.bottom._value,
                right: selection.right._value,
            };
            console.log("矩形选区坐标:", coordinates);
            return coordinates;
        } else if (selection._obj === "polygon") {
            const horizontal = selection.points.horizontal.list.map(pt => pt._value);
            const vertical = selection.points.vertical.list.map(pt => pt._value);
            console.log("多边形选区坐标:");
            console.log("Horizontal:", horizontal);
            console.log("Vertical:", vertical);
            return { horizontal, vertical };
        } else {
            console.warn("选区类型暂不支持:", selection._obj);
            return null;
        }
    } catch (error) {
        // If no document is open, selectionInfo might be undefined or throw error.
        if (error.message.includes("document")) {
            console.warn("获取选区坐标时出错: 可能没有打开的文档或没有选区。");
        } else {
            console.error("获取选区坐标时出错:", error);
        }
        return null;
    }
}

// 创建图层蒙版并应用选区 (retained from original)
async function createLayerMask() {
    try {
        await batchPlay(
            [
                {
                    _obj: "make",
                    at: { _enum: "channel", _ref: "channel", _value: "mask" },
                    new: { _class: "channel" },
                    using: { _enum: "userMaskEnabled", _value: "revealSelection" }
                }
            ],
            { synchronousExecution: true }
        );
        console.log("成功创建图层蒙版并应用选区！");
    } catch (error) {
        console.error("创建图层蒙版时出错:", error);
    }
}

// 反转蒙版内容 (retained from original)
async function invertLayerMask() {
    try {
        await batchPlay(
            [
                {
                    _obj: "invert"
                }
            ],
            { synchronousExecution: true }
        );
        console.log("成功反转蒙版内容！");
    } catch (error) {
        console.error("反转蒙版内容时出错:", error);
    }
}

// ========== 读取 / 保存配置 ==========
async function loadOrCreateSettings() {
    try {
        const tempFolder = await fs.getDataFolder();
        let settingsFile;
        try {
            settingsFile = await tempFolder.getEntry("settings.json");
            settings = Object.assign(settings, JSON.parse(await settingsFile.read()));
        } catch {
            settingsFile = await tempFolder.createFile("settings.json", { overwrite: true });
            await settingsFile.write(JSON.stringify(settings, null, 2));
        }

        // ---- 填充界面 ----
        document.getElementById("apikey").value = settings.apikey || "";
        document.getElementById("prompt").value = settings.prompt || "";
        document.getElementById("steps").value = settings.steps;
        document.getElementById("guidance").value = settings.guidance;
        document.getElementById("safetyTolerance").value = settings.safetyTolerance;
        document.getElementById("promptUpsampling").checked = settings.promptUpsampling;
        // ---- 编辑界面 ----
        document.getElementById("kontextPrompt").value = settings.kontextPrompt || "";
        document.getElementById("kontextModel").value = settings.kontextSelectedModel;
        document.getElementById("kontextSeed").value =
            settings.kontextSeed !== null ? settings.kontextSeed : "";
        document.getElementById("kontextPromptUpsampling").checked =
            settings.kontextPromptUpsampling;
        document.getElementById("kontextSafetyTolerance").value =
            settings.kontextSafetyTolerance;
        document.getElementById("kontextAspectRatio").value =
            settings.kontextAspectRatio !== null ? settings.kontextAspectRatio : "";
    } catch (err) {
        console.error("加载配置失败：", err);
    }
}

async function saveSettings() {
    try {
        // Config
        settings.apikey = document.getElementById("apikey").value.trim();
        // Fill
        settings.prompt = document.getElementById("prompt").value;
        settings.steps = +document.getElementById("steps").value;
        settings.guidance = +document.getElementById("guidance").value;
        settings.safetyTolerance = +document.getElementById("safetyTolerance").value;
        settings.promptUpsampling = document.getElementById("promptUpsampling").checked;
        // Edit
        settings.kontextPrompt = document.getElementById("kontextPrompt").value;
        settings.kontextSelectedModel = document.getElementById("kontextModel").value;
        const seedVal = document.getElementById("kontextSeed").value;
        settings.kontextSeed = seedVal ? +seedVal : null;
        settings.kontextPromptUpsampling =
            document.getElementById("kontextPromptUpsampling").checked;
        settings.kontextSafetyTolerance = +document.getElementById(
            "kontextSafetyTolerance",
        ).value;
        const aspectVal = document.getElementById("kontextAspectRatio").value.trim();
        settings.kontextAspectRatio = aspectVal || null;

        // 写文件
        const tempFolder = await fs.getDataFolder();
        const file = await tempFolder.createFile("settings.json", { overwrite: true });
        await file.write(JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error("保存设置失败：", err);
    }
}

// ========== 工具函数 ==========
function debounce(fn, wait = 500) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

const debouncedSaveSettings = debounce(saveSettings);

// ========== 事件绑定 ==========
function initializeEventListeners() {
    // ---- 配置 ----
    document.getElementById("apikey").addEventListener("change", debouncedSaveSettings);
    // ---- 填充 ----
    ["prompt", "steps", "guidance", "safetyTolerance"].forEach((id) =>
        document.getElementById(id).addEventListener("change", debouncedSaveSettings),
    );
    document
        .getElementById("promptUpsampling")
        .addEventListener("change", debouncedSaveSettings);
    document.getElementById("btnGenerate").addEventListener("click", handleGenerateFill);

    // ---- 编辑 ----
    [
        "kontextPrompt",
        "kontextModel",
        "kontextSeed",
        "kontextPromptUpsampling",
        "kontextSafetyTolerance",
        "kontextAspectRatio",
    ].forEach((id) => document.getElementById(id).addEventListener("change", debouncedSaveSettings));
    document
        .getElementById("btnGenerateKontext")
        .addEventListener("click", handleGenerateKontext);

    // **预设按钮**
    document
        .getElementById("btnPresetRestore")
        .addEventListener("click", (e) =>
            handlePresetKontext(
                "Restore and colorize this image. Remove any scratches or imperfections.",
                e.target,
            ),
        );
    document
        .getElementById("btnPresetRemoveText")
        .addEventListener("click", (e) =>
            handlePresetKontext("remove all the text", e.target),
        );
    document
        .getElementById("btnPresetGhibli")
        .addEventListener("click", (e) =>
            handlePresetKontext("convert this picture to Ghibli style", e.target),
        );
}


async function getActiveLayerBase64() {
    try {
        const activeDoc = app.activeDocument;
        if (!activeDoc) {
            console.error("No active document.");
            throw new Error("没有打开的文档。");
        }
        if (activeDoc.activeLayers.length === 0) {
             console.error("No active layers in the document.");
            throw new Error("文档中没有活动的图层。");
        }
        const activeLayer = activeDoc.activeLayers[0];

        console.log("activeLayer Name:", activeLayer.name);
        console.log("activeLayer ID:", activeLayer.id);

        const tempFolder = await fs.getTemporaryFolder();
        const fileName = `layer_${activeLayer.id}_${Date.now()}.png`; // Ensure unique name
        const outputFile = await tempFolder.createFile(fileName, { overwrite: true });
        console.log("outputFile",outputFile.nativePath)
        
        const token = await fs.createSessionToken(outputFile);

        await core.executeAsModal(async (executionContext) => {
            const hostControl = executionContext.hostControl;
            const suspensionID = await hostControl.suspendHistory({
                documentID: activeDoc.id,
                name: "Export Layer for API"
            });
            try {
                await batchPlay(
                    [
                        {
                            "_obj": "save",
                            "as": {
                                "_obj": "PNGFormat",
                                "transparency": true,
                                "method": {
                                    "_enum": "PNGInterlaceType",
                                    "_value": "PNGInterlaceNone"
                                },
                                "PNGFileFormatExtention": {
                                    "_enum": "PNGFileFormatExtentionType",
                                    "_value": "lowercase"
                                }
                            },
                            "in": {
                                "_path": token,
                                "_kind": "local"
                            },
                            "documentID": activeDoc.id,
                            "layerID": [activeLayer.id], // Ensure this is an array
                            "copy": true, // Important: save a copy to avoid modifying the original layer's state
                            "_isCommand": true
                        }
                    ],
                    { "synchronousExecution": true }
                );
            } finally {
                 await hostControl.resumeHistory(suspensionID);
            }
        }, { commandName: "Export Layer" });

        console.log("Layer exported to temporary file:", outputFile.nativePath);

        const arrayBuffer = await outputFile.read({ format: storage.formats.binary });
        const base64String = arrayBufferToBase64(arrayBuffer);

        try {
            await outputFile.delete();
            console.log(`已删除临时文件：${outputFile.name}`);
        } catch (deleteError) {
            console.error("删除临时文件时发生错误：", deleteError);
        }
        return base64String;
    } catch (error) {
        console.error("获取图层Base64时发生错误:", error);
        throw error;
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;
    let binary = '';
    for (let i = 0; i < len; i += 1024) { // Process in chunks to avoid "RangeError: Maximum call stack size exceeded"
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 1024, len)));
    }
    return btoa(binary);
}

// Submit task for Flux Pro Fill API
async function submitFluxTask(imageBase64, {apikey, prompt, steps, promptUpsampling, guidance, safetyTolerance }) {
    const url = "https://api.bfl.ml/v1/flux-pro-1.0-fill";

    const requestBody = {
        image: imageBase64,
        prompt, 
        steps, 
        prompt_upsampling: promptUpsampling, 
        guidance, 
        output_format: "png", 
        safety_tolerance: safetyTolerance 
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-key": apikey,
            },
            body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Unknown API error" }));
            console.error("Flux API POST error response:", errorData);
            throw new Error(`API请求失败 (${response.status}): ${errorData.message || errorData.detail || JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        console.log("Flux API POST response:", data);
        return data.id; // Return task ID
    } catch (error) {
        console.error("Error submitting flux task:", error);
        throw error;
    }
}

// Submit task for a generic Flux Kontext API (Pro or Max)
async function submitGenericFluxKontextTask(params, apiUrl) {
    const { apikey, prompt, input_image, seed, aspect_ratio, prompt_upsampling, safety_tolerance } = params;
    
    const requestBody = {
        prompt,
        input_image, // This can be null or base64 string
        seed: seed === "" || seed === undefined ? null : parseInt(seed, 10),
        aspect_ratio: aspect_ratio === "" || aspect_ratio === undefined ? null : aspect_ratio,
        output_format: "png",
        prompt_upsampling,
        safety_tolerance: parseInt(safety_tolerance, 10),
    };

    console.log(`Submitting Kontext Task to ${apiUrl} with body:`, JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(apiUrl, { // Use the passed apiUrl
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-key": apikey,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: "Unknown API error" }));
            console.error(`Flux Kontext API (${apiUrl}) POST error response:`, errorData);
            throw new Error(`API请求失败 (${response.status}): ${errorData.message || errorData.detail || JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        console.log(`Flux Kontext API (${apiUrl}) POST response:`, data);
        // API returns id and polling_url
        return { taskId: data.id, pollingUrl: data.polling_url };
    } catch (error) {
        console.error(`Error submitting Flux Kontext task to ${apiUrl}:`, error);
        throw error;
    }
}


// Get task result using task ID (for original Fill tab)
async function getTaskResult(apikey, taskId, updateProgress) {
    const url = `https://api.bfl.ml/v1/get_result?id=${taskId}`; // Specific to Fill API
    return pollForResult(apikey, url, updateProgress);
}

// Get task result using a direct polling URL (for new Edit tab)
async function getTaskResultFromPollingUrl(apikey, pollingUrl, updateProgress) {
    return pollForResult(apikey, pollingUrl, updateProgress);
}

// Generic polling function
async function pollForResult(apikey, initialPollingUrl, updateProgress) {
    let currentPollingUrl = initialPollingUrl;
    try {
        while (true) {
            const response = await fetch(currentPollingUrl, {
                method: "GET",
                headers: { "x-key": apikey },
            });
      
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Unknown API error during polling" }));
                console.error("API polling error:", errorData);
                throw new Error(`轮询请求失败 (${response.status}): ${errorData.message || errorData.detail || JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            console.log("API GET response:", data);

            if (data.status === "Ready" || data.status === "succeeded") { // Accommodate different "Ready" statuses
                 // Check for result structure, Flux Kontext Max might differ.
                 // Assuming result.sample or a direct image URL in data.result or data.outputs
                if (data.result && data.result.sample) {
                    return data.result.sample;
                } else if (data.outputs && data.outputs.length > 0 && data.outputs[0].url) { // Another common pattern
                    return data.outputs[0].url;
                } else if (data.url) { // If the polling URL itself becomes the image URL
                    return data.url;
                }
                // Fallback if result structure is primary and contains URLs
                else if (data.result && typeof data.result === 'object') {
                    const imageKeys = ['url', 'image_url', 'imageUrl', 'sample'];
                    for (const key of imageKeys) {
                        if (data.result[key]) return data.result[key];
                    }
                    if (Array.isArray(data.result) && data.result.length > 0 && data.result[0].url) {
                         return data.result[0].url; // If result is an array of objects with URLs
                    }
                }
                console.error("任务完成，但找不到图片 URL:", data);
                throw new Error("任务完成，但响应中找不到图片 URL。");
            } else if (data.status === "Error" || data.status === "failed") {
                console.error("任务处理失败，错误信息：", data.error || data.message || data.detail || "未知错误");
                throw new Error(`生成任务失败: ${data.error || data.message || data.detail || "未知错误"}`);
            } else {
                // Update progress and wait
                let statusMessage = `等待任务完成，当前状态：${data.status}`;
                if (data.progress) statusMessage += ` (${data.progress}%)`;
                console.log(statusMessage);
                if (typeof updateProgress === "function") {
                    updateProgress(statusMessage);
                }
                // If the response includes a new polling_url (common in some async APIs)
                if (data.polling_url && data.polling_url !== currentPollingUrl) {
                    currentPollingUrl = data.polling_url;
                }
                await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds delay
            }
        }
    } catch (error) {
        console.error("获取任务结果时发生错误:", error);
        throw error;
    }
}


async function loadImageToLayerDirectly(imageUrl) {
    try {
        console.log("Downloading image from:", imageUrl);
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`无法下载图片，状态码：${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const tempFolder = await fs.getTemporaryFolder();
        const tempFile = await tempFolder.createFile(`temp_image_${Date.now()}.png`, { overwrite: true });
        await tempFile.write(uint8Array, { format: storage.formats.binary });
        console.log("Image saved to temporary file:", tempFile.nativePath);

        const tempFileToken = await fs.createSessionToken(tempFile);

        await core.executeAsModal(async (executionContext) => {
            const suspensionID = await executionContext.hostControl.suspendHistory({
                documentID: app.activeDocument.id, // ensure doc is active
                name: "Place Image"
            });
            try {
                await batchPlay(
                    [
                        {
                            _obj: "placeEvent",
                            target: {
                                _path: tempFileToken, 
                                _kind: "local",
                            },
                            _isCommand: true,
                        },
                    ],
                    { synchronousExecution: true }
                );
            } finally {
                await executionContext.hostControl.resumeHistory(suspensionID);
            }
        }, { commandName: "Load Image to New Layer" });

        console.log("图片已成功加载到 Photoshop 的新图层中");

        await tempFile.delete();
        console.log("临时文件已删除");
    } catch (error) {
        console.error("加载图片到 Photoshop 新图层时发生错误:", error);
        throw error;
    }
}

// Event handler for the "Fill" tab's Generate button
async function handleGenerateFill() {
    await saveSettings(); // Save current form values to settings
    const logElement = document.getElementById("log");
    const logMessage = document.getElementById("logMessage");
    const generateButton = document.getElementById("btnGenerate");

    logElement.style.display = "block";
    logMessage.textContent = "初始化 (填充)...";
    generateButton.disabled = true;

    try {
        const { apikey, prompt, steps, promptUpsampling, guidance, safetyTolerance } = settings; // Use saved settings

        if (!apikey) {
            throw new Error("API 密钥未配置。请前往“配置”选项卡设置。");
        }

        logMessage.textContent = "用户输入的参数 (填充):";
        console.log("用户输入的参数 (填充)：", { apikey, prompt, steps, promptUpsampling, guidance, safetyTolerance });

        const selectionCoordinates = await getSelectionCoordinates();
        if (!selectionCoordinates) {
            logMessage.textContent = "未能获取选区坐标，操作终止！请确保有有效选区。";
            generateButton.disabled = false;
            return;
        }
        
        await core.executeAsModal(async (executionContext) => {
             const suspensionID = await executionContext.hostControl.suspendHistory({
                documentID: app.activeDocument.id,
                name: "Prepare Mask for Fill"
            });
            try {
                await createLayerMask();
                await invertLayerMask();
            } finally {
                await executionContext.hostControl.resumeHistory(suspensionID);
            }
        }, { commandName: "Apply Selection as Mask and Invert" });
        
        logMessage.textContent = "正在获取带蒙版的图层数据...";
        const layerBase64 = await getActiveLayerBase64();
        console.log("选中图层的 Base64 (填充):", layerBase64.substring(0,100) + "...");

        logMessage.textContent = "正在提交任务到 Flux API (填充)...";
        const taskId = await submitFluxTask(layerBase64, { apikey, prompt, steps, promptUpsampling, guidance, safetyTolerance });
        console.log("任务已提交 (填充)，任务 ID:", taskId);
        logMessage.textContent = `任务已提交 (填充)，任务 ID: ${taskId}`;

        logMessage.textContent = "等待任务完成 (填充)...";
        const imageUrl = await getTaskResult(apikey, taskId, (statusMessage) => { // Uses original getTaskResult
            logMessage.textContent = statusMessage;
        });
        console.log("任务完成 (填充)，生成的图片 URL:", imageUrl);

        logMessage.textContent = "正在将图片加载到 Photoshop (填充)...";
        await loadImageToLayerDirectly(imageUrl);
        
        logMessage.textContent = "处理完成 (填充)！图片已加载到 Photoshop。";
    } catch (error) {
        console.error("填充操作发生错误:", error);
        logMessage.textContent = `错误 (填充): ${error.message}`;
    } finally {
        generateButton.disabled = false;
    }
}

// Event handler for the "Image Edit" tab's Generate button
async function handleGenerateKontext() {
    await saveSettings(); // Save current form values to settings
    const logElement = document.getElementById("logKontext");
    const logMessage = document.getElementById("logMessageKontext");
    const generateButton = document.getElementById("btnGenerateKontext");

    logElement.style.display = "block";
    logMessage.textContent = "初始化 (编辑)...";
    generateButton.disabled = true;

    try {
        const { apikey, kontextPrompt, kontextSelectedModel, kontextSeed, kontextPromptUpsampling, kontextSafetyTolerance, kontextAspectRatio } = settings;

        if (!apikey) {
            throw new Error("API 密钥未配置。请前往“配置”选项卡设置。");
        }
        if (!kontextPrompt) {
            throw new Error("提示词不能为空。");
        }
        
        const kontextApiUrl = KONTEXT_API_ENDPOINTS[kontextSelectedModel];
        if (!kontextApiUrl) {
            throw new Error(`无效的模型选择: ${kontextSelectedModel}`);
        }
        
        logMessage.textContent = `用户输入的参数 (编辑) - 模型: ${kontextSelectedModel.toUpperCase()}:`;
        console.log(`用户输入的参数 (编辑) - 模型: ${kontextSelectedModel.toUpperCase()}：`, { apikey, kontextPrompt, kontextSeed, kontextPromptUpsampling, kontextSafetyTolerance, kontextAspectRatio, kontextApiUrl });

        logMessage.textContent = "正在获取选中图层数据 (编辑)...";
        let layerBase64 = null;
        try {
            if (app.activeDocument && app.activeDocument.activeLayers.length > 0) {
                layerBase64 = await getActiveLayerBase64();
                console.log("选中图层的 Base64 (编辑):", layerBase64 ? layerBase64.substring(0,100) + "..." : "N/A");
                logMessage.textContent = "选中图层数据已获取。";
            } else {
                console.log("没有活动图层被选中，将作为纯文本到图像生成。");
                logMessage.textContent = "无选中图层，将进行文本到图像生成。";
            }
        } catch (e) {
             console.warn("获取图层Base64失败 (编辑), 将尝试作为纯文本到图像生成:", e.message);
             logMessage.textContent = "获取图层Base64失败，将进行文本到图像生成。";
        }


        logMessage.textContent = `正在提交任务到 Flux Kontext API (${kontextSelectedModel.toUpperCase()})...`;
        const { taskId, pollingUrl } = await submitGenericFluxKontextTask({ // Use the renamed generic function
            apikey,
            prompt: kontextPrompt,
            input_image: layerBase64, // Pass null if no layer
            seed: kontextSeed,
            aspect_ratio: kontextAspectRatio,
            prompt_upsampling: kontextPromptUpsampling,
            safety_tolerance: kontextSafetyTolerance,
        }, kontextApiUrl); // Pass the resolved API URL
        console.log(`任务已提交 (编辑) - ${kontextSelectedModel.toUpperCase()}，任务 ID:`, taskId, "Polling URL:", pollingUrl);
        logMessage.textContent = `任务已提交 (编辑)，ID: ${taskId}`;

        logMessage.textContent = "等待任务完成 (编辑)...";
        const imageUrl = await getTaskResultFromPollingUrl(apikey, pollingUrl, (statusMessage) => {
            logMessage.textContent = statusMessage;
        });
        console.log("任务完成 (编辑)，生成的图片 URL:", imageUrl);

        logMessage.textContent = "正在将图片加载到 Photoshop (编辑)...";
        await loadImageToLayerDirectly(imageUrl);
        
        logMessage.textContent = "处理完成 (编辑)！图片已加载到 Photoshop。";
    } catch (error) {
        console.error("编辑操作发生错误:", error);
        logMessage.textContent = `错误 (编辑): ${error.message}`;
    } finally {
        generateButton.disabled = false;
    }
}

// ========== 预设按钮公共处理 ==========
async function handlePresetKontext(presetPrompt, buttonEl) {
    await saveSettings(); // 先同步界面到配置
    const logBox = document.getElementById("logKontext");
    const logMsg = document.getElementById("logMessageKontext");
    buttonEl.disabled = true;
    logBox.style.display = "block";
    logMsg.textContent = `初始化 (预设) - ${buttonEl.textContent}...`;

    try {
        const {
            apikey,
            kontextSelectedModel,
            kontextSeed,
            kontextPromptUpsampling,
            kontextSafetyTolerance,
            kontextAspectRatio,
        } = settings;

        if (!apikey) throw new Error("API 密钥未配置。请在“配置”页输入。");

        const apiUrl = KONTEXT_API_ENDPOINTS[kontextSelectedModel];
        if (!apiUrl) throw new Error(`无效模型: ${kontextSelectedModel}`);

        // 获取图层 Base64（可选）
        let layerBase64 = null;
        try {
            if (app.activeDocument && app.activeDocument.activeLayers.length > 0) {
                layerBase64 = await getActiveLayerBase64();
            }
        } catch (e) {
            console.warn("获取图层失败，按纯文本生成：", e.message);
        }

        logMsg.textContent = "已提交生成任务 (预设)...";
        const { taskId, pollingUrl } = await submitGenericFluxKontextTask(
            {
                apikey,
                prompt: presetPrompt,
                input_image: layerBase64,
                seed: kontextSeed,
                aspect_ratio: kontextAspectRatio,
                prompt_upsampling: kontextPromptUpsampling,
                safety_tolerance: kontextSafetyTolerance,
            },
            apiUrl,
        );

        logMsg.textContent = `任务 ID: ${taskId}，等待结果...`;
        const imgUrl = await getTaskResultFromPollingUrl(apikey, pollingUrl, (t) => {
            logMsg.textContent = t;
        });

        logMsg.textContent = "正在加载结果到 Photoshop...";
        await loadImageToLayerDirectly(imgUrl);
        logMsg.textContent = "完成！图片已导入新图层。";
    } catch (err) {
        console.error("预设任务失败：", err);
        logMsg.textContent = `错误：${err.message}`;
    } finally {
        buttonEl.disabled = false;
    }
}
