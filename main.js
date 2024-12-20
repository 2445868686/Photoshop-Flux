const { app, core, imaging, action } = require('photoshop');
const { storage } = require('uxp');
const batchPlay = action.batchPlay;
const fs = storage.localFileSystem;

document.addEventListener("DOMContentLoaded", () => {
    console.log("Panel loaded");
    loadOrCreateSettings();
});
document.addEventListener("DOMContentLoaded", () => {
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll("[data-tab-content]");
  
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tabContents.forEach(content => (content.style.display = "none"));
        tab.classList.add("active");
        const targetContent = document.querySelector(`[data-tab-content="${tab.dataset.tab}"]`);
        targetContent.style.display = "block";
      });
    });
  });
  
let settings = {
    apikey: "",
    prompt: "",
    steps: 30,
    guidance: 20,
    safetyTolerance: 2,
    promptUpsampling: false,
};
// 获取当前选区坐标
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
            console.error("当前没有选区！");
            return null;
        }

        if (selection._obj === "rectangle") {
            // 矩形选区
            const coordinates = {
                top: selection.top._value,
                left: selection.left._value,
                bottom: selection.bottom._value,
                right: selection.right._value,
            };
            console.log("矩形选区坐标:", coordinates);
            return coordinates;
        } else if (selection._obj === "polygon") {
            // 多边形选区
            const horizontal = selection.points.horizontal.list.map(pt => pt._value);
            const vertical = selection.points.vertical.list.map(pt => pt._value);
            console.log("多边形选区坐标:");
            console.log("Horizontal:", horizontal);
            console.log("Vertical:", vertical);
            return { horizontal, vertical };
        } else {
            console.error("选区类型暂不支持:", selection._obj);
            return null;
        }
    } catch (error) {
        console.error("获取选区坐标时出错:", error);
        return null;
    }
}

// 创建图层蒙版并应用选区
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

// 反转蒙版内容
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

async function loadOrCreateSettings() {
    try {
        const tempFolder = await fs.getDataFolder();
        
        let settingsFile;
        try {
            settingsFile = await tempFolder.getEntry("settings.json");
            console.log("配置文件已找到，尝试加载...");
        } catch {
            console.log("配置文件不存在，正在创建...");
            settingsFile = await tempFolder.createFile("settings.json", { overwrite: true });
            await settingsFile.write(JSON.stringify(settings, null, 2));
            console.log("已创建默认配置文件: settings.json,",settingsFile.nativePath);
        }

        // 如果文件已存在，读取内容并解析为 JSON
        console.log("settings.json:",settingsFile.nativePath);
        const content = await settingsFile.read();
        settings = JSON.parse(content);
        console.log("成功加载配置:", settings);

        // 填充表单
        document.getElementById("apikey").value = settings.apikey;
        document.getElementById("prompt").value = settings.prompt;
        document.getElementById("steps").value = settings.steps;
        document.getElementById("guidance").value = settings.guidance;
        document.getElementById("safetyTolerance").value = settings.safetyTolerance;
        document.getElementById("promptUpsampling").checked = settings.promptUpsampling;

    } catch (error) {
        console.error("加载或创建配置文件时发生错误:", error);
    }
}

async function saveSettings() {
    try {
        // 更新当前设置
        settings.apikey = document.getElementById("apikey").value;
        settings.prompt = document.getElementById("prompt").value;
        settings.steps = parseInt(document.getElementById("steps").value, 10);
        settings.guidance = parseFloat(document.getElementById("guidance").value);
        settings.safetyTolerance = parseInt(document.getElementById("safetyTolerance").value, 10);
        settings.promptUpsampling = document.getElementById("promptUpsampling").checked;

        // 获取临时文件夹并保存设置
        const tempFolder = await fs.getDataFolder();
        const settingsFile = await tempFolder.createFile("settings.json", { overwrite: true });
        await settingsFile.write(JSON.stringify(settings, null, 2));
        console.log("成功保存配置:", settings);
    } catch (error) {
        console.error("保存配置时发生错误:", error);
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSaveSettings = debounce(saveSettings, 500);

document.getElementById("apikey").addEventListener("change", debouncedSaveSettings);
document.getElementById("prompt").addEventListener("change", debouncedSaveSettings);
document.getElementById("steps").addEventListener("change", debouncedSaveSettings);
document.getElementById("guidance").addEventListener("change", debouncedSaveSettings);
document.getElementById("safetyTolerance").addEventListener("change", debouncedSaveSettings);
document.getElementById("promptUpsampling").addEventListener("change", debouncedSaveSettings);


async function getActiveLayerBase64() {
    try {
        const activeDoc = app.activeDocument;
        const activeLayer = activeDoc.activeLayers[0];

        console.log("activeLayer Name:", activeLayer.name);
        console.log("activeLayer ID:", activeLayer.id);

        // 获取临时文件夹
        const tempFolder = await fs.getTemporaryFolder();
        const fileName = `${activeLayer.name}.png`;
        const outputFile = await tempFolder.createFile(fileName, { overwrite: true });
        console.log("outputFile",outputFile.nativePath)
        // 获取文件令牌
        const token = await fs.createSessionToken(outputFile);

        // 使用 batchPlay 导出图层
        await core.executeAsModal(async () => {
            const result = await batchPlay(
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
                            "_kind": "local",
                            "storageClass": "temp" // 指定存储类别为临时文件
                        },
                        "documentID": activeDoc.id,
                        "layerID": [activeLayer.id],
                        "_isCommand": true,
                        "_options": { "synchronousExecution": true }
                    }
                ],
                { "synchronousExecution": true }
            );
            console.log("batchPlay result:", result); 
        }, { commandName: "Export Layer" });

        console.log("outputFile:", outputFile);

        // 读取生成的文件并获取 ArrayBuffer
        const arrayBuffer = await outputFile.read({ format: storage.formats.binary });

        // 将 ArrayBuffer 转换为 Base64
        const base64String = arrayBufferToBase64(arrayBuffer);

        // 使用完文件后立即删除
        try {
            await outputFile.delete();
            console.log(`已删除临时文件：${outputFile.nativePath}`);
        } catch (deleteError) {
            console.error("删除临时文件时发生错误：", deleteError);
        }
        return base64String;
    } catch (error) {
        console.error("发生错误:", error);
        throw error;
    }
}

// 将 ArrayBuffer 转换为 Base64 字符串
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;
    let binary = '';
    for (let i = 0; i < len; i += 1024) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 1024));
    }
    return btoa(binary);
}

// 修改提交任务的函数以支持动态参数
async function submitFluxTask(imageBase64, {apikey, prompt, steps, promptUpsampling, guidance, safetyTolerance }) {
    const url = "https://api.bfl.ml/v1/flux-pro-1.0-fill"; // API 端点

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
        
        const data = await response.json();
        console.log("Flux API POST response:", data);
        return data.id; // 返回任务 ID
    } catch (error) {
        console.error("Error submitting flux task:", error);
        throw error;
    }
}

// 获取任务结果
async function getTaskResult(apikey, taskId, updateProgress) {
    const url = `https://api.bfl.ml/v1/get_result?id=${taskId}`;
  
    try {
        while (true) {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "x-key": apikey,
                },
            });
      
            const data = await response.json();
            console.log("Flux API GET response:", data);
            if (response.ok) {
                if (data.status === "Ready") {
                    return data.result.sample; // 返回图片的 URL
                } else if (data.status === "Error") {
                    console.error("任务处理失败，错误信息：", data.error || data.message || "未知错误");
                    throw new Error(`生成任务失败，错误信息：${data.error || data.message || "未知错误"}`);
                } else {
                    console.log("等待任务完成...");
                    if (typeof updateProgress === "function") {
                        updateProgress(`等待任务完成，当前状态：${data.status}`);
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            } else {
                console.error("API 返回错误：", data);
                throw new Error(`请求失败，状态码：${response.status}，错误信息：${data.error || data.message || "未知错误"}`);
            }
        }
    } catch (error) {
        console.error("获取任务结果时发生错误:", error);
        throw error;
    }
}

async function loadImageToLayerDirectly(imageUrl) {
    try {
        const { app, core, action } = require("photoshop");
        const { storage } = require("uxp");
        const fs = storage.localFileSystem;

        // 下载图片数据
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`无法下载图片，状态码：${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 创建临时文件
        const tempFolder = await fs.getTemporaryFolder();
        const tempFile = await tempFolder.createFile("temp_image.png", { overwrite: true });
        await tempFile.write(uint8Array, { format: storage.formats.binary });

        // 生成文件路径令牌
        const tempFileToken = await fs.createSessionToken(tempFile);

        // 使用 batchPlay 将图片加载到新图层
        await core.executeAsModal(async () => {
            await batchPlay(
                [
                    {
                        _obj: "placeEvent",
                        target: {
                            _path: tempFileToken, // 使用文件令牌
                            _kind: "local",
                        },
                        _isCommand: true,
                    },
                ],
                { synchronousExecution: true }
            );
        }, { commandName: "Load Image to New Layer" });

        console.log("图片已成功加载到 Photoshop 的新图层中");

        // 清理临时文件
        await tempFile.delete();
        console.log("临时文件已删除");
    } catch (error) {
        console.error("加载图片到 Photoshop 新图层时发生错误:", error);
        throw error;
    }
}

// 为按钮点击事件添加监听器
document.getElementById("btnGenerate").addEventListener("click", async () => {
    saveSettings();
    // 获取 log 框和相关元素
    const logElement = document.getElementById("log");
    const logMessage = document.getElementById("logMessage");
    const generateButton = document.getElementById("btnGenerate");

    // 显示 log 框并禁用生成按钮，防止多次点击
    logElement.style.display = "block";
    logMessage.textContent = "初始化...";
    generateButton.disabled = true;

    try {
        // 获取用户输入的表单参数
        const apikey = document.getElementById("apikey").value;
        const prompt = document.getElementById("prompt").value;
        const steps = parseInt(document.getElementById("steps").value, 10);
        const promptUpsampling = document.getElementById("promptUpsampling").checked;
        const guidance = parseFloat(document.getElementById("guidance").value);
        const safetyTolerance = parseInt(document.getElementById("safetyTolerance").value, 10);

        // 记录用户输入
        logMessage.textContent = "用户输入的参数已接收...";
        console.log("用户输入的参数：", {
            apikey,
            prompt,
            steps,
            promptUpsampling,
            guidance,
            safetyTolerance,
        });
        // 获取选区坐标
        const selectionCoordinates = await getSelectionCoordinates();
        if (!selectionCoordinates) {
            console.error("未能获取选区坐标，操作终止！");
            logMessage.textContent = "未能获取选区坐标，操作终止！";
                // 恢复生成按钮状态
            generateButton.disabled = false;
            return;
        }
        // 创建蒙版并应用选区
        await core.executeAsModal(async () => {
            await createLayerMask();
            await invertLayerMask();
        }, { commandName: "Apply Selection as Mask and Invert" });
        // 获取选中图层的 Base64 编码
        const layerBase64 = await getActiveLayerBase64();
        console.log("选中图层的 Base64:", layerBase64);

        logMessage.textContent = "正在提交任务到 Flux API...";
        // 提交任务到 Flux API，使用表单中的参数
        const taskId = await submitFluxTask(layerBase64, {
            apikey,
            prompt,
            steps,
            promptUpsampling,
            guidance,
            safetyTolerance,
        });
        console.log("任务已提交，任务 ID:", taskId);

        logMessage.textContent = `任务已提交，任务 ID: ${taskId}`;

        // 等待任务完成并获取生成的图像 URL
        logMessage.textContent = "等待任务完成...";
        const imageUrl = await getTaskResult(apikey, taskId, (statusMessage) => {
            logMessage.textContent = statusMessage;
        });
        console.log("任务完成，生成的图片 URL:", imageUrl);

        logMessage.textContent = "正在将图片加载到 Photoshop...";
        // 加载生成的图片到 Photoshop 的新图层
        await loadImageToLayerDirectly(imageUrl);
        console.log("图片已成功加载到 Photoshop 的新图层中");

        logMessage.textContent = "处理完成！图片已加载到 Photoshop。";

        // 恢复生成按钮状态
        generateButton.disabled = false;
    } catch (error) {
        console.error("发生错误:", error);
        logMessage.textContent = `发生错误: ${error.message}`;

        // 恢复生成按钮状态
        generateButton.disabled = false;
    }
});
