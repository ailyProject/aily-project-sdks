const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// 确保 __dirname 有值，如果没有则使用当前工作目录
const srcDir = __dirname || process.cwd();
// 确保目标目录有值，空字符串会导致解压到当前目录
const destDir = process.env.AILY_SDK_PATH || process.cwd();
const _7zaPath = process.env.AILY_7ZA_PATH || '7za.exe';

// 使用传统的回调式 API 并用 Promise 包装
function readdir(dir) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
}

// 使用 Promise 和 async/await 简化异步操作
async function extractArchives() {
    try {
        // 读取目录并过滤出 .7z 文件
        const files = await readdir(srcDir);
        const archiveFiles = files.filter(file => path.extname(file).toLowerCase() === '.7z');

        // 处理每个压缩文件
        for (const file of archiveFiles) {
            const srcPath = path.join(srcDir, file);
            try {
                await unpack(srcPath, destDir);
                console.log(`已解压 ${file} 到 ${destDir}`);
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
        const args = ['x', archivePath, '-y', '-o' + destination];
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