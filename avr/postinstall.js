const fs = require('fs')
const child_process = require('child_process')
const path = require('path');

const srcDir = __dirname;
const destDir = process.env.AILY_SDK_PATH;
const _7zaPath = process.env.AILY_7ZA_PATH || '7za.exe';

fs.readdir(srcDir, (err, files) => {
    if (err) {
        console.error('无法读取目录:', err);
        return;
    }
    files.filter(file => path.extname(file).toLowerCase() === '.7z')
        .forEach(file => {
            const srcPath = path.join(srcDir, file);
            const destPath = path.join(destDir, file);

            unpack(srcPath, destDir, err => {
                if (err) {
                    console.error(`解压 ${file} 失败:`, err);
                } else {
                    console.log(`已解压 ${file} 到 ${destDir}`);
                }
            });
        });
});

function unpack(pathToPack, destPathOrCb, cb) {
    if (typeof destPathOrCb === 'function' && cb === undefined) {
        cb = destPathOrCb;
        _7zRun(_7zaPath, ['x', pathToPack, '-y'], cb);
    } else {
        _7zRun(_7zaPath, ['x', pathToPack, '-y', '-o' + destPathOrCb], cb);
    }
}

function _7zRun(bin, args, cb) {
    // cb = onceify(cb);
    const runError = new Error(); // get full stack trace
    const proc = child_process.spawn(bin, args, { windowsHide: true });
    let output = '';
    proc.on('error', function (err) {
        console.error('7-zip error:', err);
        cb(err);
    });
    proc.on('exit', function (code) {
        let result = null;
        if (args[0] === 'l') {
            result = parseListOutput(output);
        }
        if (code) {
            runError.message = `7-zip exited with code ${code}\n${output}`;
        }
        console.log("output:", output);
        cb(code ? runError : null, result);
    });
    proc.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
        output += chunk.toString();
    });
}

