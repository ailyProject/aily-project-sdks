const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// test

// 确保 __dirname 有值，如果没有则使用当前工作目录
const srcDir = __dirname || "";
// 确保目标目录有值，空字符串会导致解压到当前目录
const destDir = process.env.AILY_SDK_PATH || "";
const _7zaPath = process.env.AILY_7ZA_PATH || "";

// 使用传统的回调式 API 并用 Promise 包装
function readdir(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
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
            const tempPath = path.join(path.dirname(dirPath), `_temp_${Date.now()}`);
            fs.renameSync(dirPath, tempPath);
            deleteFolderRecursive(tempPath);
        }
    }
}


async function handler(file) {
    const srcPath = path.join(srcDir, file);
    console.log(`准备解压: ${srcPath}`);

    await unpack(srcPath, destDir).catch(err => {
        console.error(`解压 ${file} 失败:`, err);
        throw err; // 重新抛出错误以便重试
    });

    console.log(`已解压 ${file} 到 ${destDir}`);

    // 重命名
    const newName = path.basename(file, '.7z');
    const destPath = path.join(destDir, newName);

    // 将newName中的@替换为_
    const newName2 = newName.replace('@', '_');
    const newPath = path.join(destDir, newName2);

    // 判断是否存在目标目录，如果存在则删除
    if (fs.existsSync(newPath)) {
        try {
            deleteFolderRecursive(newPath);
            console.log(`已删除目录: ${newPath}`);
        } catch (err) {
            console.error(`无法删除目录: ${newPath}`, err);
            throw new Error(`删除目录失败: ${newPath}`);
        }
    }

    fs.renameSync(destPath, newPath);
    console.log(`已重命名 ${destPath} 为 ${newPath}`);

    // Check if post-install script exists and run it
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'post_install.bat' : 'post_install.sh';
    const scriptPath = path.join(newPath, scriptName);

    if (fs.existsSync(scriptPath)) {
        console.log(`Running post-install script: ${scriptPath}`);

        // Make sure the script is executable on Unix
        if (!isWindows) {
            fs.chmodSync(scriptPath, '755');
        }

        // Prepare command and arguments
        const command = isWindows ? 'cmd' : 'sh';
        const args = isWindows ? ['/c', scriptPath] : [scriptPath];

        // Execute the script
        await new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                cwd: newPath,
                stdio: 'inherit',
                windowsHide: true
            });

            proc.on('exit', (code) => {
                if (code === 0) {
                    console.log(`Post-install script completed successfully.`);
                } else {
                    console.error(`Post-install script failed with code ${code}`);
                    throw new Error(`Script exited with code ${code}`);
                }
            });

            proc.on('error', (err) => {
                console.error('Failed to run post-install script:', err);
                throw new Error(`Failed to run post-install script: ${err.message}`);
            });
        });
    } else {
        console.log(`No post-install script found at ${scriptPath}`);
    }
}

// 使用 Promise 和 async/await 简化异步操作
async function extractArchives() {
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

        // 确保 7za.exe 存在
        if (!fs.existsSync(_7zaPath)) {
            console.error(`7za.exe 不存在: ${_7zaPath}`);
            return;
        }

        if (!fs.existsSync(destDir)) {
            console.log(`目标目录不存在，创建: ${destDir}`);
            fs.mkdirSync(destDir, { recursive: true });
        }

        // 读取目录并过滤出 .7z 文件
        const files = await readdir(srcDir);
        const archiveFiles = files.filter(file => path.extname(file).toLowerCase() === '.7z');

        console.log(`找到 ${archiveFiles.length} 个 .7z 文件`);

        // 处理每个压缩文件
        for (const file of archiveFiles) {
            if (!file) {
                console.error('文件名为空，跳过');
                continue;
            }

            try {
                await withRetry( async () => {
                    await handler(file);
                }, 3, 2000); // 重试3次，每次间隔2秒
            } catch (error) {
                console.error(`解压 ${file} 失败:`, error);
            }
        }
    } catch (err) {
        console.error('无法读取目录:', err);
    }
}

// 使用 Promise 封装解压函数
function unpack(archivePath, destination) {
    return new Promise((resolve, reject) => {
        if (!archivePath) {
            return reject(new Error('压缩文件路径不能为空'));
        }
        if (!destination) {
            return reject(new Error('目标目录不能为空'));
        }

        const args = ['x', archivePath, '-y', '-o' + destination];
        console.log(`执行命令: ${_7zaPath} ${args.join(' ')}`);

        const proc = spawn(_7zaPath, args, { windowsHide: true });

        let output = '';

        proc.stdout.on('data', function (chunk) {
            output += chunk.toString();
        });
        proc.stderr.on('data', function (chunk) {
            output += chunk.toString();
        });

        proc.on('error', function (err) {
            console.error('7-zip 错误:', err);
            reject(err);
        });

        proc.on('exit', function (code) {
            if (code === 0) {
                resolve();
            } else {
                const error = new Error(`7-zip 退出码 ${code}\n${output}`);
                reject(error);
            }
        });
    });
}

// 执行主函数
extractArchives().catch(function (err) {
    console.error('执行失败:', err);
});