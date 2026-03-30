const { app, BrowserWindow, ipcMain, protocol, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// --- Paths ---
// Em dev: resources/ na raiz do projeto
// Empacotado: process.resourcesPath (Contents/Resources/ no macOS)
const isDev         = !app.isPackaged;
const projectRoot   = path.join(__dirname, '..');
const resourcesPath = isDev ? path.join(projectRoot, 'resources') : process.resourcesPath;
const isWin         = os.platform() === 'win32';

// ffmpeg/ffprobe: copiados para resources/ pelo setup.sh / setup.bat
const ffmpegPath  = path.join(resourcesPath, isWin ? 'ffmpeg.exe'  : 'ffmpeg');
const ffprobePath = path.join(resourcesPath, isWin ? 'ffprobe.exe' : 'ffprobe');

// Python standalone — criado pelo setup.sh / setup.bat em resources/python/
const pythonDir   = path.join(resourcesPath, 'python');
const pythonCmd   = isWin
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3');
const workDir     = path.join(app.getPath('userData'), 'musikill-work');
fs.ensureDirSync(workDir);

// --- Format configs for converter ---
const FORMAT_CONFIGS = {
    // Audio
    mp3:  { type: 'audio', ext: 'mp3',  label: 'MP3',
            args: q => ['-vn', '-codec:a', 'libmp3lame', '-b:a', q==='high'?'320k':q==='medium'?'192k':'128k'] },
    aac:  { type: 'audio', ext: 'aac',  label: 'AAC',
            args: q => ['-vn', '-codec:a', 'aac', '-b:a', q==='high'?'256k':'128k'] },
    m4a:  { type: 'audio', ext: 'm4a',  label: 'M4A',
            args: q => ['-vn', '-codec:a', 'aac', '-b:a', q==='high'?'256k':'128k'] },
    wav:  { type: 'audio', ext: 'wav',  label: 'WAV',
            args: () => ['-vn', '-codec:a', 'pcm_s16le'] },
    flac: { type: 'audio', ext: 'flac', label: 'FLAC',
            args: () => ['-vn', '-codec:a', 'flac'] },
    ogg:  { type: 'audio', ext: 'ogg',  label: 'OGG Vorbis',
            args: q => ['-vn', '-codec:a', 'libvorbis', '-q:a', q==='high'?'9':q==='medium'?'6':'3'] },
    opus: { type: 'audio', ext: 'opus', label: 'Opus',
            args: q => ['-vn', '-codec:a', 'libopus', '-b:a', q==='high'?'192k':q==='medium'?'128k':'64k'] },
    // Video
    mp4:    { type: 'video', ext: 'mp4',  label: 'MP4 (H.264)',
              args: q => ['-c:v','libx264','-preset','medium','-crf',q==='high'?'18':q==='medium'?'23':'28','-c:a','aac','-b:a','192k'] },
    mp4h265:{ type: 'video', ext: 'mp4',  label: 'MP4 (H.265)',
              args: q => ['-c:v','libx265','-preset','medium','-crf',q==='high'?'22':q==='medium'?'28':'35','-c:a','aac','-b:a','192k'] },
    mkv:    { type: 'video', ext: 'mkv',  label: 'MKV',
              args: q => ['-c:v','libx264','-preset','medium','-crf',q==='high'?'18':'23','-c:a','aac'] },
    mov:    { type: 'video', ext: 'mov',  label: 'MOV',
              args: q => ['-c:v','libx264','-crf',q==='high'?'18':'23','-c:a','aac'] },
    avi:    { type: 'video', ext: 'avi',  label: 'AVI',
              args: () => ['-c:v','mpeg4','-q:v','5','-c:a','mp3'] },
    webm:   { type: 'video', ext: 'webm', label: 'WebM',
              args: q => ['-c:v','libvpx-vp9','-crf',q==='high'?'24':'30','-b:v','0','-c:a','libopus'] },
    gif:    { type: 'video', ext: 'gif',  label: 'GIF',
              args: () => ['-vf','fps=10,scale=480:-1:flags=lanczos','-loop','0'] },
};

// Resolve certifi CA bundle path from inside the venv (needed on macOS)
let _certPath = null;
function getCertPath() {
    if (_certPath !== null) return _certPath;
    try {
        _certPath = execFileSync(pythonCmd, ['-c', 'import certifi; print(certifi.where())'], { encoding: 'utf8' }).trim();
    } catch {
        _certPath = '';
    }
    return _certPath;
}

function buildPythonEnv(torchHome) {
    const cert = getCertPath();
    return {
        ...process.env,
        TORCH_HOME: torchHome,
        ...(cert ? { SSL_CERT_FILE: cert, REQUESTS_CA_BUNDLE: cert } : {}),
    };
}

let mainWindow;

// --- App Setup ---
app.whenReady().then(() => {
    protocol.registerFileProtocol('app', (request, callback) => {
        try {
            const url = request.url.replace(/^app:\/\//, '');
            const filePath = path.normalize(path.join(workDir, decodeURIComponent(url)));
            if (filePath.startsWith(workDir) && fs.existsSync(filePath)) {
                callback({ path: filePath });
            } else {
                callback({ error: -6 });
            }
        } catch {
            callback({ error: -2 });
        }
    });
    createWindow();
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 760,
        minWidth: 720,
        minHeight: 540,
        backgroundColor: '#0d0d14',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        titleBarStyle: os.platform() === 'darwin' ? 'hiddenInset' : 'default',
        show: false,
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // chmod binaries on non-Windows
    if (!isWin) {
        [ffmpegPath, ffprobePath, pythonCmd].forEach(p => {
            if (fs.existsSync(p)) { try { fs.chmodSync(p, 0o755); } catch {} }
        });
    }
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', async () => { await fs.emptyDir(workDir).catch(() => {}); });

// --- Helpers ---

function runCommand(cmd, args, opts, onData) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, opts || {});
        if (onData) {
            proc.stdout.on('data', d => onData(d.toString()));
            proc.stderr.on('data', d => onData(d.toString()));
        }
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} saiu com código ${code}`)));
        proc.on('error', reject);
    });
}

function getMediaDuration(filePath) {
    return new Promise(resolve => {
        const proc = spawn(ffprobePath, ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', filePath]);
        let out = '';
        proc.stdout.on('data', d => out += d);
        proc.on('close', () => resolve(parseFloat(out.trim()) || 0));
        proc.on('error', () => resolve(0));
    });
}

function hasVideoStream(filePath) {
    return new Promise(resolve => {
        const proc = spawn(ffprobePath, ['-v','error','-select_streams','v:0','-show_entries','stream=index','-of','csv=p=0', filePath]);
        let out = '';
        proc.stdout.on('data', d => out += d);
        proc.on('close', () => resolve(out.trim() !== ''));
        proc.on('error', () => resolve(false));
    });
}

function safeSend(webContents, channel, data) {
    if (webContents && !webContents.isDestroyed()) webContents.send(channel, data);
}

function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// --- General IPC ---

ipcMain.handle('select-files', async (event, { filters, multi } = {}) => {
    const props = ['openFile'];
    if (multi !== false) props.push('multiSelections');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: props,
        filters: filters || [{ name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (result.canceled) return [];
    return result.filePaths.map(p => ({
        path: p,
        name: path.basename(p),
        size: fs.existsSync(p) ? fs.statSync(p).size : 0,
    }));
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file', async (event, { sourcePath, defaultName, ext }) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) return { success: false, error: 'Arquivo não encontrado.' };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Salvar arquivo',
        defaultPath: defaultName || path.basename(sourcePath),
        filters: [{ name: (ext || 'Arquivo').toUpperCase(), extensions: [ext || '*'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
        await fs.copyFile(sourcePath, filePath);
        return { success: true, path: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.on('reveal-file', (event, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.handle('save-all-to-folder', async (event, files) => {
    // files: [{sourcePath, outputName}]
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Escolher pasta de destino',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return { success: false };
    const destDir = filePaths[0];
    const results = [];
    for (const f of files) {
        if (!f.sourcePath || !fs.existsSync(f.sourcePath)) {
            results.push({ name: f.outputName, ok: false });
            continue;
        }
        try {
            await fs.copyFile(f.sourcePath, path.join(destDir, f.outputName));
            results.push({ name: f.outputName, ok: true });
        } catch {
            results.push({ name: f.outputName, ok: false });
        }
    }
    return { success: true, destDir, results };
});

// --- Converter ---

async function processConversion(file, format, quality, jobId, wc) {
    const send = data => safeSend(wc, 'converter:progress', { jobId, ...data });
    const config = FORMAT_CONFIGS[format];
    if (!config) { send({ status: 'error', error: 'Formato desconhecido.' }); return; }

    const jobDir = path.join(workDir, 'conv_' + jobId);
    await fs.ensureDir(jobDir);

    try {
        send({ status: 'running', progress: 0 });
        const duration = await getMediaDuration(file.path);
        const baseName = path.parse(file.name).name;
        const outName  = `${baseName}.${config.ext}`;
        const outPath  = path.join(jobDir, outName);

        await new Promise((resolve, reject) => {
            const args = ['-y', '-hide_banner', '-i', file.path, ...config.args(quality), outPath];
            const proc = spawn(ffmpegPath, args);

            proc.stderr.on('data', data => {
                const m = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
                if (m && duration > 0) {
                    const secs = +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/100;
                    send({ status: 'running', progress: Math.min(99, Math.round(secs / duration * 100)) });
                }
            });
            proc.stdout.on('data', () => {});
            proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com código ${code}`)));
            proc.on('error', reject);
        });

        const size = (await fs.stat(outPath)).size;
        send({ status: 'done', progress: 100, outputPath: outPath, outputName: outName, outputSize: size, ext: config.ext });
    } catch (err) {
        send({ status: 'error', error: err.message });
    }
}

ipcMain.handle('converter:start', async (event, { files, format, quality }) => {
    const jobs = [];
    for (const file of files) {
        const jobId = uuidv4().slice(0, 10);
        processConversion(file, format, quality, jobId, event.sender);
        jobs.push({ jobId, name: file.name });
    }
    return jobs;
});

ipcMain.handle('converter:formats', () => {
    return Object.entries(FORMAT_CONFIGS).map(([id, c]) => ({ id, label: c.label, type: c.type, ext: c.ext }));
});

// --- Separator ---

async function processSeparation(file, jobId, wc) {
    const send = data => safeSend(wc, 'separator:progress', { jobId, ...data });
    const jobDir = path.join(workDir, 'sep_' + jobId);
    await fs.ensureDir(jobDir);

    try {
        send({ status: 'running', progress: 3, step: 'Verificando arquivo…' });
        const hadVideo = await hasVideoStream(file.path);

        send({ status: 'running', progress: 8, step: 'Extraindo áudio…' });
        const tempWav = path.join(jobDir, 'input.wav');
        await runCommand(ffmpegPath,
            ['-y','-hide_banner','-loglevel','error','-i', file.path, '-vn','-ac','2','-ar','44100','-acodec','pcm_s16le', tempWav],
            {}, null
        );

        send({ status: 'running', progress: 15, step: 'Separando stems com Demucs…' });
        const demucsOut = path.join(jobDir, 'demucs_out');
        const torchHome = path.join(resourcesPath, 'models');
        const env = buildPythonEnv(torchHome);

        await new Promise((resolve, reject) => {
            const proc = spawn(pythonCmd, [
                '-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', demucsOut, tempWav
            ], { env });

            let stderrLog = '';
            proc.stderr.on('data', data => {
                const text = data.toString();
                stderrLog += text;
                const m = text.match(/(\d+)%\|/);
                if (m) send({ status: 'running', progress: 15 + Math.round(parseInt(m[1]) * 0.72), step: 'Separando stems com Demucs…' });
            });
            proc.stdout.on('data', () => {});
            proc.on('close', code => {
                if (code === 0) return resolve();
                // Extrai a última linha relevante do log para mostrar ao usuário
                const lastLine = stderrLog.trim().split('\n').filter(l => l.trim()).slice(-3).join(' | ');
                reject(new Error(`Demucs falhou (código ${code}):\n${lastLine}`));
            });
            proc.on('error', reject);
        });

        const stemDir    = path.join(demucsOut, 'htdemucs', 'input');
        const vocalsRaw  = path.join(stemDir, 'vocals.wav');
        const instrRaw   = path.join(stemDir, 'no_vocals.wav');
        if (!fs.existsSync(vocalsRaw)) throw new Error('Arquivo vocals.wav não encontrado após separação do Demucs.');

        send({ status: 'running', progress: 88, step: 'Organizando arquivos…' });
        const vocalsOut = path.join(jobDir, 'vocals.wav');
        const instrOut  = path.join(jobDir, 'instrumental.wav');
        await fs.move(vocalsRaw, vocalsOut);
        await fs.move(instrRaw, instrOut);

        let videoVocalsOut = null;
        let videoInstrOut  = null;

        if (hadVideo) {
            send({ status: 'running', progress: 92, step: 'Remuxando vídeo com voz…' });
            videoVocalsOut = path.join(jobDir, 'video_vocals.mp4');
            await runCommand(ffmpegPath,
                ['-y','-hide_banner','-loglevel','error','-i', file.path,'-i', vocalsOut,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-shortest', videoVocalsOut],
                {}, null
            );

            send({ status: 'running', progress: 96, step: 'Remuxando vídeo instrumental…' });
            videoInstrOut = path.join(jobDir, 'video_instrumental.mp4');
            await runCommand(ffmpegPath,
                ['-y','-hide_banner','-loglevel','error','-i', file.path,'-i', instrOut,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-shortest', videoInstrOut],
                {}, null
            );
        }

        send({
            status: 'done', progress: 100,
            payload: {
                hadVideo,
                // Relative paths for app:// player
                vocalsUrl:  `sep_${jobId}/vocals.wav`,
                instrUrl:   `sep_${jobId}/instrumental.wav`,
                videoVocalsUrl: hadVideo ? `sep_${jobId}/video_vocals.mp4`   : null,
                videoInstrUrl:  hadVideo ? `sep_${jobId}/video_instrumental.mp4` : null,
                // Absolute paths for save dialog
                vocalsPath:      vocalsOut,
                instrPath:       instrOut,
                videoVocalsPath: videoVocalsOut,
                videoInstrPath:  videoInstrOut,
            }
        });

    } catch (err) {
        send({ status: 'error', error: err.message });
    }
}

ipcMain.handle('separator:start', async (event, { files }) => {
    const jobs = [];
    for (const file of files) {
        const jobId = uuidv4().slice(0, 10);
        processSeparation(file, jobId, event.sender);
        jobs.push({ jobId, name: file.name });
    }
    return jobs;
});
