const fs = require('fs');
const path = require('path');

// 确保 __dirname 有值，如果没有则使用当前工作目录
const srcDir = __dirname || "";
// 确保目标目录有值，空字符串会导致解压到当前目录
const destDir = process.env.AILY_SDK_PATH || "";

// 使用传统的回调式 API 并用 Promise 包装
function readdir(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
}

// 自定义递归删除函数
function deleteFolderRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(file => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // 递归删除子目录
                deleteFolderRecursive(curPath);
            } else {
                // 删除文件，忽略错误
                try {
                    fs.unlinkSync(curPath);
                } catch (e) {
                    console.warn(`无法删除文件: ${curPath}`, e);
                }
            }
        });
        // 删除目录本身
        try {
            fs.rmdirSync(dirPath);
        } catch (e) {
            console.warn(`无法删除目录: ${dirPath}`, e);
            // 如果删除失败，尝试重命名
            try {
                const tempPath = path.join(path.dirname(dirPath), `_temp_${Date.now()}`);
                fs.renameSync(dirPath, tempPath);
                deleteFolderRecursive(tempPath);
            } catch (renameErr) {
                console.warn(`重命名删除也失败: ${dirPath}`, renameErr);
            }
        }
    }
}

// 重试函数封装
async function withRetry(fn, maxRetries = 3, retryDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.log(`操作失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`等待 ${retryDelay / 1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    throw new Error(`经过 ${maxRetries} 次尝试后操作仍然失败: ${lastError.message}`);
}

async function handler(file) {
    // 将文件名中的@替换为_，这对应postinstall.js中的重命名逻辑
    const baseName = path.basename(file, '.7z');
    const folderName = baseName.replace('@', '_');
    const folderPath = path.join(destDir, folderName);

    console.log(`准备删除文件夹: ${folderPath}`);

    // 判断是否存在目标目录，如果存在则删除
    if (fs.existsSync(folderPath)) {
        try {
            deleteFolderRecursive(folderPath);
            console.log(`已删除目录: ${folderPath}`);
        } catch (err) {
            console.error(`无法删除目录: ${folderPath}`, err);
            throw new Error(`删除目录失败: ${folderPath}`);
        }
    } else {
        console.log(`目录不存在，跳过删除: ${folderPath}`);
    }
}

// 使用 Promise 和 async/await 简化异步操作
async function removeExtractedArchives() {
    try {
        // 确保源目录存在
        if (!fs.existsSync(srcDir)) {
            console.error(`源目录不存在: ${srcDir}`);
            return;
        }

        // 确保目标目录存在
        if (!destDir) {
            console.error('未设置目标目录');
            return;
        }

        if (!fs.existsSync(destDir)) {
            console.log(`目标目录不存在: ${destDir}`);
            return;
        }

        // 读取目录并过滤出 .7z 文件
        const files = await readdir(srcDir);
        const archiveFiles = files.filter(file => path.extname(file).toLowerCase() === '.7z');

        console.log(`找到 ${archiveFiles.length} 个 .7z 文件对应的文件夹需要删除`);

        // 处理每个压缩文件对应的文件夹
        for (const file of archiveFiles) {
            if (!file) {
                console.error('文件名为空，跳过');
                continue;
            }

            try {
                await withRetry(async () => {
                    await handler(file);
                }, 3, 2000); // 重试3次，每次间隔2秒
            } catch (error) {
                console.error(`删除 ${file} 对应的文件夹失败:`, error);
            }
        }
    } catch (err) {
        console.error('无法读取目录:', err);
    }
}

// 执行主函数
removeExtractedArchives().catch(function (err) {
    console.error('执行失败:', err);
});
