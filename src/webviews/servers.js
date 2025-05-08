const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();
const { getServerConfigFile } = require('../utils/config');

function showServersWebView(context) {
    const panel = vscode.window.createWebviewPanel(
        'servidoresConfigurados',
        'Servidores Configurados',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const filePath = getServerConfigFile();
    let jsonData = { configurations: [] };

    try {
        if (fs.existsSync(filePath)) {
            jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        vscode.window.showErrorMessage('Erro ao ler arquivo de configurações: ' + err.message);
    }

    const htmlPath = path.join(context.extensionPath, 'src', 'webviews', 'servers.html');
    panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

    panel.webview.onDidReceiveMessage((message) => {
        handleWebViewMessage(message, jsonData, filePath, panel);
    });
}

function handleWebViewMessage(message, jsonData, filePath, panel) {
    switch (message.command) {
        case 'ready':
            panel.webview.postMessage({ configurations: jsonData.configurations });
            return;

        case 'delete':
            jsonData.configurations.splice(message.index, 1);
            break;

        case 'duplicate': {
            const original = jsonData.configurations[message.index];
            const duplicate = { ...original };
            const baseName = duplicate.name || 'Duplicated Config';
            let newName = baseName;
            let count = 1;

            while (jsonData.configurations.some(cfg => cfg.name === newName)) {
                newName = `${baseName} (${count++})`;
            }

            duplicate.name = newName;
            jsonData.configurations.push(duplicate);
            break;
        }

        case 'copyConfig': {
            const configText = JSON.stringify(jsonData.configurations[message.index], null, 4);
            (async () => {
                try {
                    await vscode.env.clipboard.writeText(configText);
                    vscode.window.showInformationMessage('Configuração copiada para a área de transferência.');
                } catch (err) {
                    vscode.window.showErrorMessage('Erro ao copiar: ' + err.message);
                }
            })();
            break;
        }

        case 'export':
            const configText = JSON.stringify(jsonData.configurations[message.index], null, 4);
            const fileName = jsonData.configurations[message.index].name || 'servers-new.json';
            const filePath = path.join(homedir, fileName);
            fs.writeFileSync(filePath, configText);
            vscode.window.showInformationMessage(`Configuração exportada para ${filePath}`);
        return;
        
        case 'add':
            vscode.env.clipboard.readText().then(text => {
                try {
                    const newConfig = JSON.parse(text);
                    if (typeof newConfig === 'object') {
                        jsonData.configurations.push(newConfig);
                        vscode.window.showInformationMessage('Configuração adicionada da área de transferência.');
                        update();
                    } else {
                        vscode.window.showErrorMessage('Conteúdo inválido na área de transferência.');
                    }
                } catch (err) {
                    vscode.window.showErrorMessage('Erro: conteúdo da área de transferência não é JSON válido.');
                }
            });
            return;

        case 'import':
            vscode.window.showOpenDialog({ filters: { 'JSON Files': ['json'] } }).then(files => {
                if (files && files.length > 0) {
                    try {
                        const imported = JSON.parse(fs.readFileSync(files[0].fsPath, 'utf8'));
                        jsonData.configurations = jsonData.configurations.concat(imported.configurations || []);
                        update();
                    } catch (err) {
                        vscode.window.showErrorMessage('Erro ao importar arquivo: ' + err.message);
                    }
                }
            });
            return;

        case 'edit':
            const serverConfig = jsonData.configurations[message.index];
            serverConfig[message.key] = message.value;
            break;
    }

    function update() {
        panel.webview.postMessage({ configurations: jsonData.configurations });
    }

    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 4));
    panel.webview.postMessage({ configurations: jsonData.configurations });
}

module.exports = { showServersWebView };