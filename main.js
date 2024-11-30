const { app, core, imaging, action } = require('photoshop');
const { storage } = require('uxp');
const fs = storage.localFileSystem;
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
            //await outputFile.delete();
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
      prompt: "a bird",
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
async function downloadToPhotoshop(imageUrl) {
    try {
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`无法下载图片，状态码：${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const blob = new Blob([uint8Array], { type: "image/png" });
  
      // 在 Photoshop 中打开图片
      await core.executeAsModal(async () => {
        const tempFolder = await fs.getTemporaryFolder();
        const tempFile = await tempFolder.createFile("temp_image.png", { overwrite: true });
        await tempFile.write(uint8Array, { format: storage.formats.binary });
        await app.open(tempFile);
      }, { commandName: "Place Generated Image" });
    } catch (error) {
      console.error("下载并加载图片时发生错误:", error);
      throw error;
    }
  }

// 为按钮点击事件添加监听器
document.getElementById("btnGetLayerBase64").addEventListener("click", async () => {
    try {
        const layerBase64 = await getActiveLayerBase64();
        //const taskId = await submitFluxTask(layerBase64);
        console.log("任务已提交，任务 ID:", taskId);
    
        const imageUrl = await getTaskResult(taskId);
        console.log("任务完成，生成的图片 URL:", imageUrl);
    
        await downloadToPhotoshop(imageUrl);
        console.log("图片已下载到 Photoshop");
        } catch (error) {
        console.error("发生错误:", error);
    }
  });

