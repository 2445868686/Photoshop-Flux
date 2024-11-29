const { app, core, imaging } = require('photoshop');

// 获取图层的 Base64 编码
async function getActiveLayerBase64() {
    const activeDoc = app.activeDocument;
    const activeLayer = activeDoc.activeLayers[0];

    console.log("activeLayer Name: ", activeLayer.name);
    console.log("activeLayer ID: ", activeLayer.id);

    const pixels = await core.executeAsModal(async () => {
        return await imaging.getPixels({
            documentID: activeDoc.id,
            layerID: activeLayer.id,
        });
    }, { commandName: "Get Pixels" });

    const { width, height } = pixels.imageData;
    console.log(`Layer Size：${width} x ${height}`);

    const pixelData = await pixels.imageData.getData();
    console.log("pixelData：",pixelData);
    const base64String = arrayBufferToBase64(pixelData);

    return base64String;
}
// 获取反转后的蒙版 Base64 编码
async function getInvertedLayerMaskBase64() {
    const activeDoc = app.activeDocument;
    const activeLayer = activeDoc.activeLayers[0];

    const maskData = await core.executeAsModal(async () => {
        return await imaging.getLayerMask({
            documentID: activeDoc.id,
            layerID: activeLayer.id,
        });
    }, { commandName: "Get Layer Mask" });

    const maskArray = await maskData.imageData.getData();
    const invertedArray = new Uint8ClampedArray(maskArray.length);

    for (let i = 0; i < maskArray.length; i++) {
        invertedArray[i] = 255 - maskArray[i];
    }

    const base64String = arrayBufferToBase64(invertedArray);
    return base64String;
}

// 将 ArrayBuffer 转换为 Base64 字符串
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// 提交生成任务到 FLUX API
async function submitFluxTask(imageBase64) {
  const apiKey = "268506c9-66ed-432f-af34-e8d610da77d5"; // 替换为你的 FLUX API Key
  const url = "https://api.bfl.ml/v1/flux-pro-1.0-fill"; // API 端点

  const requestBody = {
      image: imageBase64,
      //mask: maskBase64,
      prompt: "a bird",
      steps: 30,
      prompt_upsampling: false,  // 添加额外参数以符合官方示例
      guidance: 60,  // 你可以根据需求调整这些参数
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
      throw error; // 重新抛出错误以便调用者捕获
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
          if (response.ok) { // 确保请求成功
              if (data.status === "Ready") {
                  return data.result.image; // 返回生成的图片 Base64
              } else if (data.status === "Error") {
                  throw new Error("生成任务失败");
              } else {
                  console.log("等待任务完成...");
                  await new Promise((resolve) => setTimeout(resolve, 5000)); // 每 5 秒检查一次
              }
          } else {
              throw new Error(`请求失败，状态码：${response.status}`);
          }
      }
  } catch (error) {
      console.error("获取任务结果时发生错误:", error);
      throw error; // 重新抛出错误以便调用者处理
  }
}

// 下载图片到 Photoshop
async function downloadToPhotoshop(base64Image) {
    const buffer = Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
    const blob = new Blob([buffer.buffer], { type: "image/png" });

    await core.executeAsModal(async () => {
        const newDoc = await app.documents.add({ width: 1024, height: 768, resolution: 72 });
        await newDoc.placeImage(blob, { left: 0, top: 0 });
    }, { commandName: "Place Generated Image" });
}

// 为按钮点击事件添加监听器
document.getElementById("btnGetLayerBase64").addEventListener("click", async () => {
    try {
        const layerBase64 = await getActiveLayerBase64();
        //const invertedMaskBase64 = await getInvertedLayerMaskBase64();

        const taskId = await submitFluxTask(layerBase64);
        console.log("任务已提交，任务 ID:", taskId);

        const resultBase64 = await getTaskResult(taskId);
        console.log("任务完成，生成的图片 Base64:", resultBase64);
    
        await downloadToPhotoshop(resultBase64);
        console.log("图片已下载到 Photoshop");
    } catch (error) {
        console.error("发生错误:", error);
    }
});
