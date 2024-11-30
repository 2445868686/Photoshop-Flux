const { app, core, imaging, action } = require('photoshop');
const { storage } = require('uxp');
const fs = storage.localFileSystem;
document.addEventListener("DOMContentLoaded", () => {
    const panel = require("uxp").window;
    panel.moveTo(100, 100); // 将窗口移动到屏幕坐标 (100, 100)
  });
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

        // 获取文件令牌
        const token = await fs.createSessionToken(outputFile);

        // 使用 batchPlay 导出图层
        await core.executeAsModal(async () => {
            const result = await action.batchPlay(
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
            console.log("batchPlay result:", result); // 调试信息
        }, { commandName: "Export Layer" });

        // 添加调试信息
        console.log("outputFile:", outputFile);

        // 读取生成的文件并获取 ArrayBuffer
        const arrayBuffer = await outputFile.read({ format: storage.formats.binary });

        // 将 ArrayBuffer 转换为 Base64
        const base64String = arrayBufferToBase64(arrayBuffer);
        
        console.log("base64String：", base64String);
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

// 提交生成任务到 FLUX API
async function submitFluxTask(imageBase64) {
  const apiKey = "268506c9-66ed-432f-af34-e8d610da77d5"; // 替换为你的 FLUX API Key
  const url = "https://api.bfl.ml/v1/flux-pro-1.0-fill"; // API 端点

  const requestBody = {
      image: imageBase64,
      prompt: "a man sit on the couch",
      steps: 30,
      prompt_upsampling: false,  // 添加额外参数以符合官方示例
      guidance: 20,  // 你可以根据需求调整这些参数
      output_format: "png",
      safety_tolerance: 2  // 可选参数，用于安全性容忍度
  };

  try {
      const response = await fetch(url, {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "x-key": apiKey,
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
async function getTaskResult(taskId) {
    const apiKey = "268506c9-66ed-432f-af34-e8d610da77d5"; // 替换为你的 FLUX API Key
    const url = `https://api.bfl.ml/v1/get_result?id=${taskId}`;
  
    try {
      while (true) {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-key": apiKey,
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

// 下载图片并加载到 Photoshop
async function downloadToSpecifiedPath(imageUrl) {
    try {
        const activeDoc = app.activeDocument;
        const activeLayer = activeDoc.activeLayers[0];

        // 获取选中图层的名称并生成文件名
        const layerName = activeLayer.name.replace(/[\\/:*?"<>|]/g, ""); // 移除非法字符
        const fileName = `${layerName}_generate.png`;

        // 目标路径
        const downloadFolderPath = "/Users/mac-mini-03/Downloads";
        const filePath = `${downloadFolderPath}/${fileName}`;

        // 下载图片
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`无法下载图片，状态码：${response.status}`);
        }

        // 将图片数据保存到指定路径
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const { storage } = require("uxp");
        const fs = storage.localFileSystem;

        // 获取目标文件夹并创建文件
        const targetFolder = await fs.getFolderForSaving();
        const outputFile = await targetFolder.createFile(fileName, { overwrite: true });
        await outputFile.write(uint8Array, { format: storage.formats.binary });

        console.log(`图片已下载并保存到指定路径：${outputFile.nativePath}`);
        return outputFile.nativePath; // 返回图片路径
    } catch (error) {
        console.error("下载并保存图片时发生错误:", error);
        throw error;
    }
}

async function downloadToSpecifiedPath(imageUrl) {
    try {
        const { app, storage } = require("photoshop");
        const fs = storage.localFileSystem;

        // 获取活动文档和选中图层
        const activeDoc = app.activeDocument;
        const activeLayer = activeDoc.activeLayers[0];

        // 生成文件名：选中图层名称 + _generate
        const layerName = activeLayer.name.replace(/[\\/:*?"<>|]/g, ""); // 移除非法字符
        const fileName = `${layerName}_generate.png`;

        // 获取临时文件夹
        const tempFolder = await fs.getTemporaryFolder();
        const outputFile = await tempFolder.createFile(fileName, { overwrite: true });

        // 下载图片数据
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`无法下载图片，状态码：${response.status}`);
        }

        // 写入文件
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await outputFile.write(uint8Array, { format: storage.formats.binary });

        console.log(`图片已下载并保存到指定路径：${outputFile.nativePath}`);
        return outputFile.nativePath; // 返回图片路径
    } catch (error) {
        console.error("下载并保存图片时发生错误:", error);
        throw error;
    }
}



// 为按钮点击事件添加监听器
document.getElementById("btnGenerate").addEventListener("click", async () => {
    try {
        // 获取选中图层的 Base64 编码
        const layerBase64 = await getActiveLayerBase64();
        console.log("选中图层的 Base64:", layerBase64);

        // 提交任务到 Flux API
        const taskId = await submitFluxTask(layerBase64);
        console.log("任务已提交，任务 ID:", taskId);

        // 等待任务完成并获取生成的图像 URL
        const imageUrl = await getTaskResult(taskId);
        console.log("任务完成，生成的图片 URL:", imageUrl);

        // 加载下载的图片到 Photoshop 的新图层
        await loadImageToLayerDirectly(imageUrl);
        console.log("图片已成功加载到 Photoshop 的新图层中");
    } catch (error) {
        console.error("发生错误:", error);
    }
});

